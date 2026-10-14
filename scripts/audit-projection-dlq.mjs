import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const project = process.argv.includes("--business") ? "web" : "departamental-five-phases";
const recover = process.argv.includes("--recover-valid");
if (recover && project === "web") {
  // Principal replay is only valid after phase 9 installs the compatible image
  // set. Refuse the old mixed version rather than cycling its valid DLQ jobs.
  const release = JSON.parse(readFileSync(process.argv.includes("--phases-7-9") ? "docs/release-fases-7-9.json" : "docs/release-fases-1-3.json", "utf8"));
  for (const image of release.images.filter(image => image.service.startsWith("servicio-") || image.service === "pasarela-api")) {
    const running = JSON.parse(execFileSync("docker", ["inspect", `${project}-${image.service}-1`], { encoding: "utf8" }))[0];
    if (!running.State.Running || running.Config.Labels["com.docker.compose.project"] !== project || running.Image !== image.imageId) throw new Error("Principal replay requires the complete compatible release first");
  }
}
const container = `${project}-servicio-analitica-1`;
const label = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', container], { encoding: "utf8" }).trim();
if (label !== project) throw new Error("Project mismatch");
// Run beside the exact consumer image. Credentials and payloads never leave it.
const script = `
const { connect } = require('amqplib');
const { AnalyticsConsumer } = require('./dist/analytics/analytics.consumer');
(async () => {
  const consumer = new AnalyticsConsumer({}, { environment: 'test' });
  const connection = await connect(process.env.RABBITMQ_URL);
  connection.on('error', () => undefined);
  const channel = await connection.createConfirmChannel();
  const queue = 'analytics.projections.v1', dlq = queue + '.dlq';
  const initial = await channel.checkQueue(dlq);
  if (initial.consumerCount || initial.messageCount > 10000) throw new Error('DLQ must be bounded and have no active consumer');
  let valid = 0, invalid = 0, replayed = 0; const types = {};
  try {
    for (let i = 0; i < initial.messageCount; i++) {
      const message = await channel.get(dlq, { noAck: false });
      if (!message) throw new Error('DLQ changed during audit');
      let event;
      try { event = consumer.event(JSON.parse(message.content.toString('utf8'))); }
      catch { invalid++; continue; }
      valid++; types[event.eventType] = (types[event.eventType] || 0) + 1;
      if (${recover}) {
        channel.sendToQueue(queue, message.content, { ...message.properties, persistent: true, headers: { ...message.properties.headers, 'x-projection-attempt': 0, 'x-controlled-replay': true } });
        await channel.waitForConfirms(); channel.ack(message); replayed++;
      }
    }
  } finally { await channel.close(); }
  const observer = await connection.createChannel();
  const final = await observer.checkQueue(dlq);
  await observer.close(); await connection.close();
  if (final.messageCount !== initial.messageCount - replayed) throw new Error('DLQ retention mismatch');
  console.log(JSON.stringify({ queue: dlq, initial: initial.messageCount, valid, invalid, replayed, retained: final.messageCount, types, confirmedBeforeAck: true, invalidPayloadsRetained: true, passed: true }));
})().catch(() => { console.error('DLQ_AUDIT_FAILED'); process.exitCode = 1; });`;
const result = JSON.parse(execFileSync("docker", ["exec", "-i", container, "node"], { input: script, encoding: "utf8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"] }).trim());
const report = { completedAt: new Date().toISOString(), project, recoveryEnabled: recover, privacy: "No credentials, identities or payloads exported", ...result };
writeFileSync(`docs/verification-dlq-${project}.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
