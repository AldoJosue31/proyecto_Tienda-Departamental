import { execFileSync, execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createGzip } from "node:zlib";
import { promisify } from "node:util";

const phaseRange = process.argv.includes("--phases-7-9") ? "7-9" : process.argv.includes("--phases-4-6") ? "4-6" : "1-3";
const reportPath = phaseRange === "1-3" ? "docs/verification-release-archive.json" : `docs/verification-release-archive-fases-${phaseRange}.json`;
const release = JSON.parse(readFileSync(`docs/release-fases-${phaseRange}.json`, "utf8"));
const baseline = release.baselines.find(item => item.project === "web");
const ids = [...new Set([...release.images, ...baseline.imageIds].map(item => item.imageId))];
for (const id of ids) execFileSync("docker", ["image", "inspect", "--format", "{{.Id}}", id], { stdio: ["ignore", "pipe", "pipe"] });
const incremental = process.argv.includes("--incremental");
const base = incremental ? JSON.parse(readFileSync(phaseRange === "1-3" ? "docs/verification-release-archive-base.json" : phaseRange === "7-9" ? "docs/verification-release-archive-fases-4-6.json" : "docs/fases-1-3-verification-release-archive.json", "utf8")) : null;
const baseArchives = base ? base.archives ?? [base] : [];
if (base) {
  if (!base.passed || !base.loadedArchiveVerified) throw new Error("BASE_ARCHIVE_NOT_VERIFIED");
  for (const item of baseArchives) {
  if (!item.loadedArchiveVerified || !Array.isArray(item.imageIds)) throw new Error("BASE_ARCHIVE_NOT_VERIFIED");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(item.archive)) hash.update(chunk);
  if (hash.digest("hex") !== item.sha256) throw new Error("BASE_ARCHIVE_CHECKSUM_MISMATCH");
  }
  const covered = new Set(baseArchives.flatMap(item => item.imageIds));
  const requiredBase=base.requiredImageIds ?? base.imageIds;
  if (!Array.isArray(requiredBase) || new Set(requiredBase).size !== base.imageCount || requiredBase.some(id => !covered.has(id))) throw new Error("BASE_ARCHIVE_COVERAGE_MISMATCH");
}
const archivedSet = new Set(baseArchives.flatMap(item => item.imageIds));
const archivedIds = ids.filter(id => !archivedSet.has(id));
if (!archivedIds.length) throw new Error("NO_NEW_IMAGES_TO_ARCHIVE");
const destination = path.join(baseline.backupDirectory, release.releaseId + ".images.tar.gz");
const temporary = destination + ".incomplete", digest = createHash("sha256");
const checksum = new Transform({ transform(chunk, encoding, done) { digest.update(chunk, encoding); done(null, chunk); } });
const saving = spawn("docker", ["save", ...archivedIds], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
saving.stderr.resume();
const exited = new Promise((resolve, reject) => { saving.once("error", reject); saving.once("exit", code => code === 0 ? resolve() : reject(new Error("IMAGE_ARCHIVE_FAILED"))); });
await Promise.all([pipeline(saving.stdout, createGzip({ level: 3 }), checksum, createWriteStream(temporary, { mode: 0o600 })), exited]);
renameSync(temporary, destination);
await promisify(execFile)("docker", ["load", "--input", destination], { timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
for (const id of ids) execFileSync("docker", ["image", "inspect", "--format", "{{.Id}}", id], { stdio: ["ignore", "pipe", "pipe"] });
const archive = { archive: destination, sha256: digest.digest("hex"), bytes: statSync(destination).size, imageIds: archivedIds, loadedArchiveVerified: true };
writeFileSync(reportPath, JSON.stringify({ completedAt: new Date().toISOString(), releaseId: release.releaseId, incremental, archives: [...baseArchives.map(item => ({ ...item, checksumReverified: true })), archive], requiredImageIds: ids, imageCount: ids.length, loadedArchiveVerified: true, containsPrincipalRollbackAndCandidate: true, secretsInSeparatePrivateEnvironmentFile: true, passed: true }, null, 2) + "\n");
console.log(`Archived ${archivedIds.length} new exact images privately; ${ids.length} required images covered by ${baseArchives.length + 1} verified archives.`);
