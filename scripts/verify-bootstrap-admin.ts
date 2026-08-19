import { type RowDataPacket } from "mysql2";
import { createPool } from "mysql2/promise";

import { normalizeLocalUsername, verifyLocalPassword } from "../server/local-credentials";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const configuredUsername = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const pool = createPool({ uri: databaseUrl });
  try {
    const [rows] = await pool.query<Array<RowDataPacket & { passwordHash: string | null }>>(
      "SELECT passwordHash FROM users WHERE openId = 'local:admin' LIMIT 1",
    );
    const storedHash = rows[0]?.passwordHash ?? null;
    const usernameMatches = normalizeLocalUsername(configuredUsername ?? "") === "admin";
    const passwordMatches = Boolean(configuredPassword && storedHash && await verifyLocalPassword(configuredPassword, storedHash));
    console.log(JSON.stringify({
      configuredUsernamePresent: Boolean(configuredUsername),
      configuredPasswordPresent: Boolean(configuredPassword),
      configuredUsernameMatchesExistingAdmin: usernameMatches,
      configuredPasswordMatchesExistingAdmin: passwordMatches,
    }));
  } finally {
    await pool.end();
  }
}

void main();
