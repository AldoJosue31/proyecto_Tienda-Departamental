import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const project = "departamental-five-phases";
const phaseRange = process.argv.includes("--phases-7-9") ? "7-9" : process.argv.includes("--phases-4-6") ? "4-6" : "1-3";
const manifestPath = `docs/release-fases-${phaseRange}.json`;
const rehearsalPath = phaseRange === "1-3" ? "docs/verification-release-images.json" : `docs/verification-release-images-fases-${phaseRange}.json`;
const overridePath = phaseRange === "1-3" ? "compose.release.yaml" : `compose.release-fases-${phaseRange}.yaml`;
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const sha = value => createHash("sha256").update(value).digest("hex");
const files = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(file => file && !/^(docs\/|\.env|\.impeccable\/|PRODUCT\.md|compose\.release(?:-fases-[0-9-]+)?\.yaml$)/.test(file)).sort();
const inputs = files.map(file => ({ file, sha256: existsSync(file) ? sha(readFileSync(file)) : "DELETED" }));
const sourceHash = sha(JSON.stringify(inputs));
const releaseId = `fases-${phaseRange}-20261013-` + sourceHash.slice(0, 12);
const containers = run("docker", ["ps", "-q", "--filter", `label=com.docker.compose.project=${project}`]).split(/\s+/).filter(Boolean);
const images = containers.map(id => {
  const item = JSON.parse(run("docker", ["inspect", id]))[0];
  if (item.Config.Labels["com.docker.compose.project"] !== project || !item.State.Running || (item.State.Health && item.State.Health.Status !== "healthy")) throw new Error("Candidate is not healthy");
  const service = item.Config.Labels["com.docker.compose.service"];
  const tag = `departamental-release/${service}:${releaseId}`;
  let existing;
  try { existing = JSON.parse(run("docker", ["image", "inspect", tag]))[0].Id; } catch { /* first freeze */ }
  if (existing && existing !== item.Image) throw new Error("An immutable release tag already names a different image");
  run("docker", ["tag", item.Image, tag]);
  return { service, imageId: item.Image, tag, health: item.State.Health?.Status ?? "running" };
}).sort((a, b) => a.service.localeCompare(b.service));
if (images.length !== 24) throw new Error("Expected exactly 24 active candidate containers");
const baselines = ["web", project].map(name => {
  const backup = JSON.parse(readFileSync(`docs/verification-release-${name}.json`, "utf8"));
  if (!backup.passed) throw new Error("A verified baseline backup is required");
  const unavailableHistoricalImages = [];
  for (const item of backup.images) {
    try { run("docker", ["tag", item.imageId, `departamental-baseline/${name}-${item.service}:20261013`]); }
    catch { if (name === "web") throw new Error("A principal rollback image is unavailable"); unavailableHistoricalImages.push(item.service); }
  }
  // A test checkpoint may come from a superseded development image. Its forward
  // recovery uses the complete compatible release and is rehearsed separately.
  return { project: name, backupDirectory: backup.backupDirectory, restoredDatabases: backup.databases.length, checks: backup.checks.length, passed: backup.passed, imageIds: name === "web" ? backup.images : images, unavailableHistoricalImages };
});
const migrations = inputs.filter(item => /\/migrations\/\d+_.+\.sql$/.test(item.file));
const override = "# Exact locally validated images. Use with the base Compose and destination env.\n# SMTP capture is supplied by the integration or local university overlay.\nservices:\n" + images.filter(item => phaseRange === "7-9" || item.service !== "smtp-capture").map(item => `  ${item.service}:\n    image: ${item.tag}\n    pull_policy: never\n`).join("");
writeFileSync(overridePath, override);
const imageRehearsal = existsSync(rehearsalPath) ? JSON.parse(readFileSync(rehearsalPath, "utf8")) : null;
const migrationOwner = { auth: "servicio-autenticacion", catalog: "servicio-catalogo", inventory: "servicio-inventario", pricing: "servicio-precios", orders: "servicio-pedidos", analytics: "servicio-analitica", logistics: "servicio-logistica", crm: "servicio-clientes", notification: "servicio-notificaciones" };
const migrationImagesMatch = Boolean(imageRehearsal?.passed && imageRehearsal.checks.length === 18 && imageRehearsal.checks.every(check => check.imageId === images.find(image => image.service === migrationOwner[check.domain])?.imageId));
const manifest = { releaseId, generatedAt: new Date().toISOString(), gitHead: run("git", ["rev-parse", "HEAD"]), uncommittedSourceIncluded: true, sourceHash, project, principalDeploymentPending: true, images, migrations, inputs, baselines, migrationVerification: { report: rehearsalPath, verifiedReleaseId: imageRehearsal?.releaseId ?? null, migrationImagesMatch }, secretsExcluded: true };
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
for (const baseline of baselines) {
  const content = "# Recovery images for this coordinated database/broker checkpoint.\nservices:\n" + baseline.imageIds.map(item => `  ${item.service}:\n    image: ${item.imageId}\n    pull_policy: never\n`).join("");
  writeFileSync(path.join(baseline.backupDirectory, "compose.baseline.yaml"), content, { mode: 0o600 });
}
console.log(`Frozen ${releaseId}: ${images.length} healthy containers, ${migrations.length} migration files, principal rollback and candidate images retained.`);
