import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputDir = resolve(process.cwd(), process.argv[2] ?? "web");
const indexPath = resolve(outputDir, "index.html");
const manifestPath = resolve(outputDir, "manifest.json");
const serviceWorkerPath = resolve(outputDir, "sw.js");
const releasePath = resolve(outputDir, "release.json");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const artifactFingerprint = hash(`${readFileSync(indexPath)}\n${readFileSync(manifestPath)}`).slice(0, 20);
const releaseId = process.env.COACHORA_RELEASE_ID ?? artifactFingerprint;
let sourceRevision = process.env.SOURCE_REVISION?.trim() ?? "";

if (!sourceRevision) {
  try {
    const workingTree = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
    if (!workingTree) {
      sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    }
  } catch {
    // Fall through to the exported-artifact identity below.
  }
}

if (!sourceRevision) {
  // The output artifact remains verifiable when Git metadata is unavailable or the tree is uncommitted.
  sourceRevision = `artifact:${artifactFingerprint}`;
}

const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
if (!serviceWorker.includes("__BUILD_ID__")) {
  throw new Error("Expected the exported service worker to contain the release placeholder.");
}

writeFileSync(serviceWorkerPath, serviceWorker.replaceAll("__BUILD_ID__", releaseId));
writeFileSync(releasePath, `${JSON.stringify({
  app: "Coachora",
  releaseId,
  sourceRevision,
  artifactFingerprint,
}, null, 2)}\n`);

console.log(`[release] Coachora ${releaseId} from ${sourceRevision}`);
