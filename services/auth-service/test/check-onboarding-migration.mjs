// Run independently: node test/check-onboarding-migration.mjs (Docker required).
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const purpose = 'auth-onboarding-model-check';
const name = `account-auth-model-check-${randomUUID().slice(0, 8)}`;
const environment = { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString('base64url') };
const docker = (args, input, timeout = 30_000) => execFileSync('docker', args, { encoding: 'utf8', timeout, env: environment, input, stdio: ['pipe', 'pipe', 'pipe'] });
const sql001 = readFileSync(fileURLToPath(new URL('../migrations/001_auth_schema.sql', import.meta.url)), 'utf8');
const sql002 = readFileSync(fileURLToPath(new URL('../migrations/002_account_onboarding.sql', import.meta.url)), 'utf8');

const before = `
INSERT INTO auth_users(id,email,name,password_hash,role) VALUES
('a0000000-0000-4000-8000-000000000001','admin@example.test','Admin prueba','synthetic-hash1','ADMIN'),
('a0000000-0000-4000-8000-000000000002','employee@example.test','Empleado previo','synthetic-hash2','EMPLOYEE'),
('a0000000-0000-4000-8000-000000000003','customer@example.test','Cliente previo','synthetic-hash3','CUSTOMER');
INSERT INTO auth_refresh_tokens(id,user_id,token_hash,family_id,expires_at) VALUES
('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003',repeat('a',64),'b0000000-0000-4000-8000-000000000002',NOW()+INTERVAL '1 day');
CREATE TABLE test_identities_before AS SELECT id,email,name,password_hash,role,is_active FROM auth_users;
CREATE TABLE test_sessions_before AS SELECT * FROM auth_refresh_tokens;
`;

const checks = `
DO $$ BEGIN
IF EXISTS((SELECT id,email,name,password_hash,role,is_active FROM auth_users EXCEPT SELECT * FROM test_identities_before)
UNION ALL (SELECT * FROM test_identities_before EXCEPT SELECT id,email,name,password_hash,role,is_active FROM auth_users)) THEN RAISE EXCEPTION 'Identities changed'; END IF;
IF EXISTS((SELECT * FROM auth_refresh_tokens EXCEPT SELECT * FROM test_sessions_before)
UNION ALL (SELECT * FROM test_sessions_before EXCEPT SELECT * FROM auth_refresh_tokens)) THEN RAISE EXCEPTION 'Sessions changed'; END IF;
IF (SELECT COUNT(*) FROM auth_users WHERE onboarding_status='READY' AND email_verified_at IS NOT NULL AND verification_source='LEGACY_MIGRATION' AND auth_version=0) <>3 THEN RAISE EXCEPTION 'Legacy compatibility failed'; END IF;
IF (SELECT COUNT(*) FROM auth_onboarding_audit WHERE action='LEGACY_MIGRATION_VERIFIED') <>3 THEN RAISE EXCEPTION 'Legacy audit failed'; END IF;
END $$;
INSERT INTO auth_users(email,name,role,onboarding_status) VALUES('invite@example.test','Empleado pendiente','EMPLOYEE','PENDING_INVITATION');
INSERT INTO auth_users(email,name,role,password_hash,onboarding_status) VALUES('register@example.test','Cliente pendiente','CUSTOMER','synthetic-hash4','PENDING_EMAIL');
DO $$ BEGIN
IF (SELECT COUNT(*) FROM auth_users WHERE is_active=TRUE AND onboarding_status='READY' AND email_verified_at IS NOT NULL AND password_hash IS NOT NULL) <>3 THEN RAISE EXCEPTION 'Pending user login filter failed'; END IF;
BEGIN
INSERT INTO auth_users(email,name,role,onboarding_status) VALUES('bad@example.test','Mal estado','CUSTOMER','PENDING_EMAIL');
RAISE EXCEPTION 'Null password accepted for CUSTOMER';
EXCEPTION WHEN check_violation THEN NULL;
END;
BEGIN
INSERT INTO auth_users(email,name,role,password_hash,onboarding_status) VALUES('badready@example.test','Mal ready','CUSTOMER','synthetic-hash','READY');
RAISE EXCEPTION 'READY accepted without verified mailbox';
EXCEPTION WHEN check_violation THEN NULL;
END;
BEGIN
INSERT INTO auth_users(email,name,role,password_hash,onboarding_status) VALUES('ADMIN@EXAMPLE.TEST','Duplicado','CUSTOMER','synthetic-hash','PENDING_EMAIL');
RAISE EXCEPTION 'Email case duplicate accepted';
EXCEPTION WHEN unique_violation THEN NULL;
END;
END $$;
`;

let created = false;
let stage = 'create isolated PostgreSQL';
try {
  // A timed-out CLI can still have created the uniquely named container.
  created = true;
  docker(['run', '-d', '--name', name, '--label', `com.codex.purpose=${purpose}`, '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_PASSWORD', 'postgres:16-alpine']);
  stage = 'wait for PostgreSQL';
  let ready = false;
  const startupDeadline = Date.now() + 30_000;
  while (Date.now() < startupDeadline) {
    try {
      docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], undefined, 5000);
      ready = true;
      break;
    } catch { await delay(250); }
  }
  if (!ready) throw new Error('Isolated PostgreSQL startup timeout');
  stage = 'apply and validate migrations';
  docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], `${sql001}\n${before}\nBEGIN;\n${sql002}\nCOMMIT;\n${checks}`);
  console.log('PASS Auth 001→002: IDs, roles, hashes and refresh sessions preserved; legacy audit, pending states and email uniqueness verified.');
} catch {
  console.error(`FAIL isolated Auth migration check at stage: ${stage}. No business data was used.`);
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      const metadata = JSON.parse(docker(['inspect', name]))[0];
      if (metadata?.Config?.Labels?.['com.codex.purpose'] === purpose && Object.hasOwn(metadata?.HostConfig?.Tmpfs || {}, '/var/lib/postgresql/data')) {
        docker(['rm', '-f', name]);
      } else {
        console.error(`Refused cleanup: ${name} lacks the expected test label or tmpfs.`);
        process.exitCode = 1;
      }
    } catch {
      console.error(`Cleanup unavailable: verify the test label and tmpfs before removing ${name}.`);
      process.exitCode = 1;
    }
  }
  delete environment.POSTGRES_PASSWORD;
}
