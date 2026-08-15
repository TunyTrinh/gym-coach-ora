import { createLocalUser, getLocalUserByUsername } from "./db";
import { hashLocalPassword, isValidLocalPassword, isValidLocalUsername, normalizeLocalUsername } from "./local-credentials";

/** Provision the explicitly configured first local Admin only when no account exists. */
export async function ensureBootstrapAdminAccount() {
  if (!process.env.DATABASE_URL) {
    console.warn("[Local auth] Admin bootstrap skipped because DATABASE_URL is unavailable.");
    return { created: false, skipped: true } as const;
  }

  const configuredUsername = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!configuredUsername || !configuredPassword) {
    console.warn("[Local auth] Admin bootstrap skipped because bootstrap credentials are not configured.");
    return { created: false, skipped: true } as const;
  }

  const username = normalizeLocalUsername(configuredUsername);
  if (!isValidLocalUsername(username) || !isValidLocalPassword(configuredPassword)) {
    throw new Error("Invalid bootstrap Admin credential configuration.");
  }

  const existing = await getLocalUserByUsername(username);
  if (existing) {
    if (existing.role !== "admin") {
      throw new Error("Bootstrap Admin username is already assigned to a non-admin account.");
    }
    return { created: false, skipped: false } as const;
  }

  await createLocalUser({
    username,
    passwordHash: await hashLocalPassword(configuredPassword),
    name: "Coachora Administrator",
    role: "admin",
  });
  console.info(`[Local auth] Bootstrap Admin account created for ${username}.`);
  return { created: true, skipped: false } as const;
}
