/**
 * Single-user admin gate. Pure functions only: no db, discord, or Hono
 * imports allowed here (see AGENTS.md layering).
 */

export const ADMIN_SESSION_TTL_SEC = 604800; // 7 days

export const ADMIN_SESSION_COOKIE = "admin_session";

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Session cookie value: `<expiryEpochSec>.<hexHmac>`; HMAC-SHA256 over the
 * expiry, keyed by ADMIN_SECRET.
 */
export async function signSession(
  secret: string,
  expirySec: number,
): Promise<string> {
  const exp = String(Math.trunc(expirySec));
  return `${exp}.${await hmacHex(secret, exp)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifySession(
  secret: string,
  cookieValue: string,
  nowSec: number,
): Promise<boolean> {
  const dot = cookieValue.indexOf(".");
  if (dot <= 0) return false;
  const expText = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!/^\d+$/.test(expText)) return false;
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  const expiry = Number(expText);
  if (!Number.isSafeInteger(expiry) || expiry <= nowSec) return false;
  const expected = await hmacHex(secret, expText);
  return timingSafeEqual(sig, expected);
}

/**
 * ADMIN_PASSWORD lives as plaintext in the secret store; timing-safe
 * comparison is sufficient for the single-user threat model.
 */
export function verifyPassword(input: string, expected: string): boolean {
  return timingSafeEqual(input, expected);
}
