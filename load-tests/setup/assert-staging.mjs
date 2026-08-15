import { assertRunId, assertStagingDatabase, assertStagingUrl } from "../lib/guard.mjs";

const url = assertStagingUrl();
const runId = assertRunId();
const database = assertStagingDatabase();
console.log(JSON.stringify({ safe: true, target: url, runId, database: new URL(database).toString().replace(/:[^:@/]+@/, ":***@") }, null, 2));
