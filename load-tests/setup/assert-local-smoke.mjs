import { assertLocalSmokeTarget } from "../lib/guard.mjs";

const target = assertLocalSmokeTarget();
const response = await fetch(`${target.appUrl}/api/health`, { signal: AbortSignal.timeout(5_000) });
if (!response.ok) throw new Error(`[load-tests] Local health check failed with ${response.status}.`);
console.log(JSON.stringify({ safe: true, target: target.appUrl, database: new URL(target.database).toString().replace(/:[^:@/]+@/, ":***@"), health: response.status }, null, 2));
