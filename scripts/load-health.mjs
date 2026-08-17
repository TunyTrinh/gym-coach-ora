import http from "node:http";
import https from "node:https";

const target = new URL(process.env.TARGET_URL ?? "http://127.0.0.1:3000/api/health");
const concurrency = Math.max(1, Number.parseInt(process.env.CONNECTIONS ?? "100", 10));
const durationMs = Math.max(500, Number.parseInt(process.env.DURATION_MS ?? "10000", 10));
const transport = target.protocol === "https:" ? https : http;
const agent = new transport.Agent({ keepAlive: true, maxSockets: concurrency, maxFreeSockets: concurrency });
const startedAt = performance.now();
const deadline = startedAt + durationMs;
const latencies = [];
let completed = 0;
let failures = 0;
const failureTypes = new Map();

function requestOnce() {
  return new Promise((resolve) => {
    const requestStartedAt = performance.now();
    const request = transport.request(target, { method: "GET", agent }, (response) => {
      response.resume();
      response.on("end", () => {
        const latency = performance.now() - requestStartedAt;
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) latencies.push(latency);
        else {
          failures += 1;
          const key = `HTTP_${response.statusCode ?? 0}`;
          failureTypes.set(key, (failureTypes.get(key) ?? 0) + 1);
        }
        completed += 1;
        resolve();
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error("request timeout")));
    request.on("error", (error) => {
      failures += 1;
      failureTypes.set(error.code ?? error.name, (failureTypes.get(error.code ?? error.name) ?? 0) + 1);
      completed += 1;
      resolve();
    });
    request.end();
  });
}

async function worker() {
  while (performance.now() < deadline) await requestOnce();
}

await Promise.all(Array.from({ length: concurrency }, worker));
agent.destroy();
latencies.sort((a, b) => a - b);
const percentile = (value) => latencies.length
  ? latencies[Math.max(0, Math.min(latencies.length - 1, Math.ceil(latencies.length * value) - 1))]
  : null;
const elapsedMs = performance.now() - startedAt;
const successes = completed - failures;
console.log(JSON.stringify({
  target: target.toString(),
  concurrency,
  durationMs: Math.round(elapsedMs),
  completed,
  successes,
  failures,
  errorRatePercent: Number((completed ? (failures / completed) * 100 : 0).toFixed(4)),
  failureTypes: Object.fromEntries(failureTypes),
  requestsPerSecond: Number((completed / (elapsedMs / 1000)).toFixed(2)),
  latencyMs: {
    p50: percentile(0.5) && Number(percentile(0.5).toFixed(2)),
    p95: percentile(0.95) && Number(percentile(0.95).toFixed(2)),
    p99: percentile(0.99) && Number(percentile(0.99).toFixed(2)),
  },
}, null, 2));
