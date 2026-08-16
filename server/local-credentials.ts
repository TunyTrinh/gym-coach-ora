import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_KEY_LENGTH = 64;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function normalizeLocalUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLocalUsername(value: string) {
  return USERNAME_PATTERN.test(value);
}

export function isValidLocalPassword(value: string) {
  return value.length >= 10 && value.length <= 128;
}

export async function hashLocalPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyLocalPassword(password: string, encodedHash: string) {
  const [algorithm, salt, expectedHex, ...unexpected] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || unexpected.length > 0) return false;

  try {
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length !== SCRYPT_KEY_LENGTH) return false;
    const actual = await scrypt(password, salt, SCRYPT_KEY_LENGTH) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
