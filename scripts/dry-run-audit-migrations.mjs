import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const databaseUrl = process.env.DATABASE_URL;
const isolatedDatabaseUrl = process.env.AUDIT_DRY_RUN_DATABASE_URL;
if (!databaseUrl || !isolatedDatabaseUrl) {
  throw new Error("DATABASE_URL and a separate AUDIT_DRY_RUN_DATABASE_URL are required for the isolated migration dry run.");
}

const sourceConnection = new URL(databaseUrl);
const connection = new URL(isolatedDatabaseUrl);
if (sourceConnection.protocol !== "mysql:" || connection.protocol !== "mysql:") throw new Error("Only mysql database URLs are supported.");
if (sourceConnection.hostname === connection.hostname && (sourceConnection.port || "3306") === (connection.port || "3306")) {
  throw new Error("AUDIT_DRY_RUN_DATABASE_URL must target a separate isolated database instance.");
}
const sourceDatabase = sourceConnection.pathname.replace(/^\//, "");
if (!sourceDatabase) throw new Error("DATABASE_URL must include a database name.");

const backupsDirectory = join(root, "audit", "backups");
const backupFiles = readdirSync(backupsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .reverse();
const backupPath = backupFiles[0] ? join(backupsDirectory, backupFiles[0]) : null;
if (!backupPath || !existsSync(backupPath)) throw new Error("A verified audit backup is required before the dry run.");

const copyDatabase = `coachora_audit_dryrun_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const mysqlArgs = ["--host", connection.hostname, "--port", connection.port || "3306", "--user", decodeURIComponent(connection.username), "--batch", "--skip-column-names"];
const mysqlEnv = { ...process.env, MYSQL_PWD: decodeURIComponent(connection.password) };
const validationUrl = new URL(isolatedDatabaseUrl);
validationUrl.pathname = `/${copyDatabase}`;
const migrationJournal = JSON.parse(readFileSync(join(root, "drizzle", "meta", "_journal.json"), "utf8"));
const indexMigration = migrationJournal.entries.find((entry) => entry.tag === "0014_clammy_lord_hawal");
const indexMigrationHash = createHash("sha256").update(readFileSync(join(root, "drizzle", "0014_clammy_lord_hawal.sql"))).digest("hex");

function run(command, args, input) {
  const result = spawnSync(command, args, { env: mysqlEnv, input, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
  return result.stdout;
}

function countSnapshot() {
  const tables = ["gymRooms", "gyms", "users", "coaches", "bookings", "availabilityShifts", "timeSlots", "roomClosures", "__drizzle_migrations"];
  const query = tables.map((table) => `SELECT '${table}', COUNT(*) FROM \`${table}\``).join(" UNION ALL ");
  return Object.fromEntries(run("mysql", [...mysqlArgs, copyDatabase, "--execute", query]).trim().split("\n").filter(Boolean).map((line) => {
    const [table, count] = line.split("\t");
    return [table, Number(count)];
  }));
}

function repairKnownIndexJournalDriftInCopy() {
  if (!indexMigration) throw new Error("The expected 0014 index migration is missing from the source journal.");
  const expected = new Map([
    ["availabilityShifts:availability_shifts_room_status_start_idx", "roomId,status,startAt"],
    ["bookings:bookings_time_slot_status_idx", "timeSlotId,status"],
    ["timeSlots:time_slots_room_start_idx", "roomId,startAt"],
    ["timeSlots:time_slots_coach_start_idx", "coachId,startAt"],
  ]);
  const query = "SELECT CONCAT(table_name, ':', index_name), GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('availability_shifts_room_status_start_idx', 'bookings_time_slot_status_idx', 'time_slots_room_start_idx', 'time_slots_coach_start_idx') GROUP BY table_name, index_name";
  const present = new Map(run("mysql", [...mysqlArgs, copyDatabase, "--execute", query]).trim().split("\n").filter(Boolean).map((line) => line.split("\t")));
  const completeAndExact = expected.size === present.size && [...expected].every(([key, columns]) => present.get(key) === columns);
  const recorded = run("mysql", [...mysqlArgs, copyDatabase, "--execute", `SELECT COUNT(*) FROM \`__drizzle_migrations\` WHERE \`hash\` = '${indexMigrationHash}'`]).trim() === "1";
  if (recorded || !completeAndExact) return false;
  run("mysql", [...mysqlArgs, copyDatabase, "--execute", `INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES ('${indexMigrationHash}', ${indexMigration.when})`]);
  return true;
}

const reportDirectory = join(root, "audit");
const reportPath = join(reportDirectory, "migration-dry-run.json");
mkdirSync(reportDirectory, { recursive: true });

let created = false;
try {
  run("mysql", [...mysqlArgs, "--execute", `CREATE DATABASE \`${copyDatabase}\``]);
  created = true;
  run("mysql", [...mysqlArgs, copyDatabase], readFileSync(backupPath));
  const beforeCounts = countSnapshot();
  const journalRepairedInCopy = repairKnownIndexJournalDriftInCopy();

  const migrate = spawnSync("pnpm", ["drizzle-kit", "migrate"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: validationUrl.toString() },
    encoding: "utf8",
  });
  if (migrate.status !== 0) throw new Error(`Migration dry run failed: ${migrate.stderr || migrate.stdout || "unknown error"}`);

  const afterCounts = countSnapshot();
  const dataTables = Object.keys(beforeCounts).filter((table) => table !== "__drizzle_migrations");
  const dataCountsPreserved = dataTables.every((table) => beforeCounts[table] === afterCounts[table]);
  const lifecycleColumns = run("mysql", [...mysqlArgs, copyDatabase, "--execute", "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'gymRooms' AND column_name = 'deletedAt'"]).trim().split("\n").filter(Boolean);
  const migrationCount = Number(run("mysql", [...mysqlArgs, copyDatabase, "--execute", "SELECT COUNT(*) FROM `__drizzle_migrations`"]).trim());
  const report = {
    createdAt: new Date().toISOString(),
    sourceBackupSha256: createHash("sha256").update(readFileSync(backupPath)).digest("hex"),
    sourceHostFingerprint: createHash("sha256").update(sourceConnection.hostname).digest("hex").slice(0, 12),
    isolatedHostFingerprint: createHash("sha256").update(connection.hostname).digest("hex").slice(0, 12),
    sourceDatabaseFingerprint: createHash("sha256").update(sourceDatabase).digest("hex").slice(0, 12),
    beforeCounts,
    afterCounts,
    dataCountsPreserved,
    migrationJournalChangedAsExpected: beforeCounts.__drizzle_migrations + 3 === afterCounts.__drizzle_migrations,
    deletedAtPresent: lifecycleColumns.includes("deletedAt"),
    appliedMigrationCount: migrationCount,
    journalRepairedInCopy,
    copyDisposed: true,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally {
  if (created) {
    try {
      run("mysql", [...mysqlArgs, "--execute", `DROP DATABASE \`${copyDatabase}\``]);
    } catch (error) {
      console.error("Disposable dry-run database cleanup failed.");
      process.exitCode = 1;
    }
  }
}
