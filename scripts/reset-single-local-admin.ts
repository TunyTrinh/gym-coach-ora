import { type RowDataPacket } from "mysql2";
import { createPool } from "mysql2/promise";

import { hashLocalPassword, isValidLocalPassword, verifyLocalPassword } from "../server/local-credentials";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const newPassword = process.env.NEW_ADMIN_PASSWORD;
  if (!databaseUrl || !newPassword) throw new Error("DATABASE_URL and NEW_ADMIN_PASSWORD are required.");
  if (!isValidLocalPassword(newPassword)) throw new Error("The replacement password does not meet the local password policy.");

  const pool = createPool({ uri: databaseUrl });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [adminRows] = await connection.query<Array<RowDataPacket & { id: number; passwordHash: string | null; role: string; loginMethod: string | null }>>(
      "SELECT id, passwordHash, role, loginMethod FROM users WHERE openId = 'local:admin' FOR UPDATE",
    );
    const admin = adminRows[0];
    if (!admin || admin.role !== "admin" || admin.loginMethod !== "local") {
      throw new Error("The existing local admin account is unavailable for a controlled reset.");
    }
    const [counts] = await connection.query<Array<RowDataPacket & { count: number }>>("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if (Number(counts[0]?.count) !== 1) throw new Error("Credential reset stopped because the database does not contain exactly one Admin account.");

    const passwordHash = await hashLocalPassword(newPassword);
    await connection.query("UPDATE users SET passwordHash = ?, lastSignedIn = NOW() WHERE id = ?", [passwordHash, admin.id]);
    await connection.query("INSERT INTO auditLogs (actorUserId, action, targetUserId, details) VALUES (?, ?, ?, ?)", [
      admin.id,
      "RESET_LOCAL_ADMIN_CREDENTIAL",
      admin.id,
      "Reset the existing single local Admin credential under explicit owner approval.",
    ]);
    const [updatedRows] = await connection.query<Array<RowDataPacket & { passwordHash: string | null }>>("SELECT passwordHash FROM users WHERE id = ?", [admin.id]);
    const passwordVerified = Boolean(updatedRows[0]?.passwordHash && await verifyLocalPassword(newPassword, updatedRows[0].passwordHash));
    if (!passwordVerified) throw new Error("Credential reset verification failed.");
    await connection.commit();
    console.log(JSON.stringify({ username: "admin", existingAdminUpdated: true, exactlyOneAdmin: true, passwordVerified: true }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

void main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "Credential reset failed.");
    process.exit(1);
  },
);
