import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const drizzleDirectory = path.join(root, "drizzle");
const metadataDirectory = path.join(drizzleDirectory, "meta");
const journal = JSON.parse(readFileSync(path.join(metadataDirectory, "_journal.json"), "utf8"));

const fail = (message) => {
  throw new Error(`[migration-history] ${message}`);
};

if (journal.dialect !== "mysql") fail(`expected mysql dialect, received ${journal.dialect}`);

const sqlTags = readdirSync(drizzleDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => name.slice(0, -4));
const journalTags = journal.entries.map((entry) => entry.tag);

if (new Set(journalTags).size !== journalTags.length) fail("journal contains a duplicate migration tag");
if (sqlTags.length !== journalTags.length || sqlTags.some((tag, index) => tag !== journalTags[index])) {
  fail(`SQL files and journal entries differ\nSQL: ${sqlTags.join(", ")}\nJournal: ${journalTags.join(", ")}`);
}

journal.entries.forEach((entry, index) => {
  if (entry.idx !== index) fail(`journal index ${entry.idx} is out of order at position ${index}`);
  if (!entry.tag.startsWith(String(index).padStart(4, "0"))) fail(`tag ${entry.tag} does not match index ${index}`);
  if (index > 0 && entry.when <= journal.entries[index - 1].when) fail(`timestamp for ${entry.tag} is not increasing`);
});

const snapshotTags = new Set(
  readdirSync(metadataDirectory)
    .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
    .map((name) => name.slice(0, 4)),
);
const documentedCustomMigrations = new Set(["0007"]);
for (const tag of journalTags) {
  const prefix = tag.slice(0, 4);
  if (!snapshotTags.has(prefix) && !documentedCustomMigrations.has(prefix)) {
    fail(`migration ${tag} has no snapshot and is not documented as custom`);
  }
}
for (const prefix of snapshotTags) {
  if (!journalTags.some((tag) => tag.startsWith(prefix))) fail(`snapshot ${prefix} has no journal entry`);
}

const latestTag = journalTags.at(-1);
const latestSql = readFileSync(path.join(drizzleDirectory, `${latestTag}.sql`), "utf8");
if (/DROP\s+TABLE\s+`?serviceTypes`?/i.test(latestSql) || /DROP\s+(?:COLUMN\s+)?`?serviceTypeId`?/i.test(latestSql)) {
  fail(`${latestTag} destructively changes legacy service storage`);
}

console.log(
  `[migration-history] ${journalTags.length} ordered SQL migrations validated; latest=${latestTag}; custom-without-snapshot=0007`,
);
