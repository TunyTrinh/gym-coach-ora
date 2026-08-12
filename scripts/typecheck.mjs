import { spawnSync } from "node:child_process";

// The managed development environment invokes `pnpm check --watch`.
// Keep checks deterministic and one-shot so a permanent TypeScript watcher
// cannot compete with Metro for memory in the constrained preview sandbox.
const result = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
