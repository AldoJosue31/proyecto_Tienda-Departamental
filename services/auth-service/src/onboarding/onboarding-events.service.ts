import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { ConfirmChannel, ChannelModel, ConsumeMessage } from 'amqplib';
import { DatabaseService } from '../database/database.service';
import { ONBOARDING_CONFIG, type OnboardingConfig } from './onboarding.config';
import type { ChallengePurpose } from './onboarding.security';

const EXCHANGE = 'departamental.events';
interface DeliveryOutcome {
  eventId: string; eventType: 'auth.email.delivery.updated.v1'; challengeId: string;
  userId: string; purpose: ChallengePurpose; generation: number;
  status: 'SENT' | 'SIMULATED' | 'FAILED' | 'UNDELIVERABLE'; attempt: number; willRetry: boolean;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseDeliveryOutcome(value: unknown): DeliveryOutcome | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (event.eventType !== 'auth.email.delivery.updated.v1' || !['eventId','challengeId','userId'].every(key => typeof event[key] === 'string' && uuid.test(event[key] as string)) ||
    !['EMAIL_VERIFICATION','EMPLOYEE_INVITATION'].includes(String(event.purpose)) || !Number.isSafeInteger(event.generation) || Number(event.generation) < 1 ||
    !Number.isSafeInteger(event.attempt) || Number(event.attempt) < 1 || !['SENT','SIMULATED','FAILED','UNDELIVERABLE'].includes(String(event.status)) || typeof event.willRetry !== 'boolean') return null;
  return event as unknown as DeliveryOutcome;
}

@Injectable()
export class OnboardingEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnboardingEventsService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;
  constructor(private readonly database: DatabaseService, @Inject(ONBOARDING_CONFIG) private readonly config: OnboardingConfig) {}

  onModuleInit() {
    this.timer = setInterval(() => { void this.tick(); }, 1000);
    this.timer.unref();
    void this.tick();
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }

  private async connect(): Promise<ConfirmChannel> {
    if (this.channel) return this.channel;
    const connection = await amqp.connect(this.config.rabbitUrl, { timeout: 5000 });
    connection.on('error', () => this.logger.warn('Onboarding message transport unavailable.'));
    connection.on('close', () => { if (this.connection === connection) { this.connection = undefined; this.channel = undefined; } });
    let channel: ConfirmChannel;
    try { channel = await connection.createConfirmChannel(); }
    catch (error) { await connection.close().catch(() => undefined); throw error; }
    channel.on('error', () => this.logger.warn('Onboarding channel unavailable.'));
    channel.on('close', () => { if (this.channel === channel) this.channel = undefined; });
    try {
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange('departamental.events.dlx', 'topic', { durable: true });
    await channel.assertQueue('notification.auth-onboarding.v1', { durable: true, arguments: { 'x-dead-letter-exchange': 'departamental.events.dlx' } });
    for (const eventType of ['auth.email.verification.requested.v1', 'auth.employee.invitation.requested.v1']) {
      await channel.bindQueue('notification.auth-onboarding.v1', EXCHANGE, eventType);
    }
    await channel.assertQueue('auth.onboarding-delivery.v1', { durable: true });
    await channel.bindQueue('auth.onboarding-delivery.v1', EXCHANGE, 'auth.email.delivery.updated.v1');
    await channel.prefetch(10);
    await channel.consume('auth.onboarding-delivery.v1', message => { if (message) void this.consume(channel, message); });
    } catch (error) {
      await channel.close().catch(() => undefined);
      await connection.close().catch(() => undefined);
      throw error;
    }
    this.connection = connection; this.channel = channel;
    return channel;
  }

  private async tick() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      // Scrub ciphertext even when RabbitMQ is unavailable.
      await this.database.query(`UPDATE auth_onboarding_outbox o SET payload=o.payload-'encrypted',published_at=COALESCE(o.published_at,NOW())
        FROM auth_onboarding_challenges c WHERE c.id=o.challenge_id AND o.payload ? 'encrypted'
        AND (c.expires_at<=NOW() OR c.consumed_at IS NOT NULL OR c.revoked_at IS NOT NULL OR c.delivery_terminal=TRUE)`);
      const channel = await this.connect();
      for (let i = 0; i < 20; i++) {
        const published = await this.database.withTransaction(async client => {
          const result = await client.query<{ event_id: string; routing_key: string; payload: unknown }>(`
            SELECT event_id,routing_key,payload FROM auth_onboarding_outbox
            WHERE published_at IS NULL AND next_attempt_at<=NOW() AND payload ? 'encrypted'
            ORDER BY created_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED`);
          const event = result.rows[0];
          if (!event) return false;
          try {
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Onboarding publish deadline')), 5000);
              channel.publish(EXCHANGE, event.routing_key, Buffer.from(JSON.stringify(event.payload)), { persistent: true, messageId: event.event_id, contentType: 'application/json' }, error => {
                clearTimeout(timeout); if (error) reject(error); else resolve();
              });
            });
            await client.query('UPDATE auth_onboarding_outbox SET published_at=NOW(),publish_attempts=publish_attempts+1 WHERE event_id=$1', [event.event_id]);
          } catch {
            await client.query(`UPDATE auth_onboarding_outbox SET publish_attempts=publish_attempts+1,next_attempt_at=NOW()+INTERVAL '5 seconds' WHERE event_id=$1`, [event.event_id]);
          }
          return true;
        });
        if (!published) break;
      }
    } catch { this.logger.warn('Onboarding outbox temporarily unavailable; persisted work will retry.'); }
    finally { this.running = false; }
  }

  private async consume(channel: ConfirmChannel, message: ConsumeMessage) {
    let event: DeliveryOutcome | null;
    try { event = parseDeliveryOutcome(JSON.parse(message.content.toString('utf8'))); }
    catch { event = null; }
    if (!event) { try { channel.ack(message); } catch { /* Closed channels redeliver on reconnection. */ } return; }
    try {
      await this.database.withTransaction(async client => {
        const inserted = await client.query('INSERT INTO auth_onboarding_received_events(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id', [event.eventId]);
        if (!inserted.rows.length) return;
        const terminal = event.status !== 'FAILED' || !event.willRetry;
        const updated = await client.query(`UPDATE auth_onboarding_challenges SET delivery_status=$5,delivery_attempt=$6,delivery_terminal=$7
          WHERE id=$1 AND user_id=$2 AND purpose=$3 AND generation=$4 AND delivery_terminal=FALSE
          AND (delivery_attempt<$6 OR (delivery_attempt=$6 AND delivery_status='PENDING')) RETURNING id`,
          [event.challengeId, event.userId, event.purpose, event.generation, event.status, event.attempt, terminal]);
        if (updated.rows.length && terminal) await client.query(`UPDATE auth_onboarding_outbox SET payload=payload-'encrypted' WHERE challenge_id=$1`, [event.challengeId]);
      });
      channel.ack(message);
    } catch {
      // Requeue only on transient persistence failure; malformed events were already acknowledged.
      if (!this.stopped) {
        try { channel.nack(message, false, true); } catch { /* The broker will redeliver after reconnect. */ }
      }
    }
  }
}
