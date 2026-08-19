import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to create a backup.");
}

const connection = new URL(databaseUrl);
if (connection.protocol !== "mysql:") {
  throw new Error("Only mysql DATABASE_URL values are supported by this backup utility.");
}

const databaseName = connection.pathname.replace(/^\//, "");
if (!databaseName) {
  throw new Error("DATABASE_URL must include a database name.");
}

const createdAt = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = join(process.cwd(), "audit", "backups");
const backupPath = join(backupDirectory, `audit-db-${createdAt}.sql`);
const manifestPath = `${backupPath}.manifest.json`;
mkdirSync(backupDirectory, { recursive: true });

const args = [
  "--host", connection.hostname,
  "--port", connection.port || "3306",
  "--user", decodeURIComponent(connection.username),
  // The managed database proxy does not support mysqldump's SAVEPOINT flow used
  // by --single-transaction. Avoiding table locks keeps this read-only backup
  // non-disruptive; row counts are captured separately before any migration work.
  "--skip-lock-tables",
  "--skip-add-locks",
  "--routines",
  "--events",
  "--no-tablespaces",
  "--result-file", backupPath,
  databaseName,
];

const result = spawnSync("mysqldump", args, {
  env: { ...process.env, MYSQL_PWD: decodeURIComponent(connection.password) },
  stdio: "inherit",
});

if (result.status !== 0 || !existsSync(backupPath)) {
  throw new Error("Database backup failed.");
}

const checksum = createHash("sha256").update(readFileSync(backupPath)).digest("hex");
const manifest = {
  createdAt: new Date().toISOString(),
  backupFile: backupPath.split("/").at(-1),
  byteSize: statSync(backupPath).size,
  sha256: checksum,
  hostFingerprint: createHash("sha256").update(connection.hostname).digest("hex").slice(0, 12),
  databaseFingerprint: createHash("sha256").update(databaseName).digest("hex").slice(0, 12),
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(manifest));
