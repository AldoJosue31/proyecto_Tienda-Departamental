import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHash, createHmac } from "node:crypto";
import pg from "pg";

export const env = Object.fromEntries(readFileSync(".env.integration", "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
export const runId = randomUUID().slice(0, 12);
export const fixtureEmail = (name: string) => `ui-accounts-${runId}-${name}@example.test`;
export const fixturePassword = "Mi frase de acceso " + runId;
export const auth = new pg.Pool({ host: "127.0.0.1", port: 55431, database: "auth_service", user: "auth_service", password: env.AUTH_DB_PASSWORD });
export const orders = new pg.Pool({ host: "127.0.0.1", port: 55435, database: "orders_service", user: "orders_service", password: env.ORDERS_DB_PASSWORD });

export function assertIsolation() {
  if (env.COMPOSE_PROJECT_NAME !== "departamental-five-phases") throw new Error("INTEGRATION_PROJECT_REQUIRED");
  for (const service of ["auth-postgres", "orders-postgres", "smtp-capture", "aplicacion-web"]) {
    const label = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', `departamental-five-phases-${service}-1`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (label !== env.COMPOSE_PROJECT_NAME) throw new Error("INTEGRATION_ISOLATION_FAILED");
  }
}
export async function userFor(email: string) { return (await auth.query("SELECT id,role,onboarding_status,is_active,auth_version FROM auth_users WHERE email=$1", [email])).rows[0]; }
export async function direct(path: string, body: unknown, token?: string) {
  const timestamp = String(Date.now()), ip = "198.18." + randomBytes(1)[0] + "." + randomBytes(1)[0];
  const signature = createHmac("sha256", env.TRUSTED_BFF_IP_KEY).update(timestamp + ":" + ip).digest("hex");
  return fetch("http://127.0.0.1:3301" + path, { method: "POST", headers: { "Content-Type": "application/json", "x-auth-client-ip": ip, "x-auth-client-timestamp": timestamp, "x-auth-client-signature": signature, ...(token ? { Authorization: "Bearer " + token, "Idempotency-Key": randomUUID() } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}
export async function mailLink(email: string) {
  let link = "";
  await expect.poll(async () => {
    const user = await userFor(email);
    if (!user) return false;
    const challenge = (await auth.query("SELECT token_hash FROM auth_onboarding_challenges WHERE user_id=$1 ORDER BY generation DESC LIMIT 1", [user.id])).rows[0];
    if (!challenge) return false;
    const list = await (await fetch("http://localhost:18025/api/v1/messages?limit=1000")).json();
    for (const message of list.messages.filter((item: { To: { Address: string }[] }) => item.To?.some(recipient => recipient.Address === email))) {
      const detail = await (await fetch("http://localhost:18025/api/v1/message/" + message.ID)).json();
      const raw = detail.Text?.split(/\r?\n/).find((line: string) => /^http:\/\/localhost:3105\//.test(line.trim()))?.trim();
      if (!raw) continue;
      const parsed = new URL(raw), token = new URLSearchParams(parsed.hash.slice(1)).get("token");
      if (token && createHash("sha256").update(token).digest("hex") === challenge.token_hash) { link = raw; return true; }
    }
    return false;
  }, { timeout: 45000, message: "SMTP capture must contain the current challenge" }).toBe(true);
  return link;
}
export async function signIn(page: Page, email: string, password: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo institucional o de cliente").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar de forma segura" }).click();
  await expect(page).toHaveURL("http://localhost:3105" + next);
}
export async function capture(page: Page, name: string) {
  mkdirSync(".impeccable/review", { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.impeccable/review/accounts-${name}-desktop.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `.impeccable/review/accounts-${name}-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (name === "register" || name === "users") {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: `.impeccable/review/accounts-${name}-dark-desktop.png`, fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `.impeccable/review/accounts-${name}-dark-mobile.png`, fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ colorScheme: "light" });
  }
}
export async function passwords(page: Page, password = fixturePassword) {
  await page.getByLabel("Contraseña nueva", { exact: true }).fill(password);
  await page.getByLabel("Confirmar contraseña", { exact: true }).fill(password);
}
export { test, expect };
