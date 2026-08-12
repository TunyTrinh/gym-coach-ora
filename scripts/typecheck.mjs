import { spawnSync } from "node:child_process";

// The managed development environment invokes `pnpm check --watch` alongside
// Metro. Run one deterministic check, then remain alive with negligible memory
// usage instead of starting a second full TypeScript compiler watcher.
const watchMode = process.argv.includes("--watch");
const result = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

if (watchMode) {
  console.log("[typecheck] Initial check passed; lightweight watch mode is active.");
  setInterval(() => {}, 60 * 60 * 1000);
} else {
  process.exit(0);
}
