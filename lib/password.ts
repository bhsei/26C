import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

// Hashes a password using the scrypt algorithm and returns the hashed password in the format "scrypt$salt$hash".
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${key.toString("base64url")}`;
}

// Verifies a password against its hashed version.
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, encodedKey] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedKey) {
    // Upgrade accounts created before password hashing was introduced.
    return safeEqual(password, stored);
  }

  const expected = Buffer.from(encodedKey, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Compares two strings in a timing-safe manner to prevent timing attacks.
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
