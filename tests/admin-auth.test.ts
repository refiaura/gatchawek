import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL_SEC,
  signSession,
  verifyPassword,
  verifySession,
} from "../src/admin/auth.js";

const SECRET = "test-secret";
const NOW = 1_700_000_000;

describe("verifyPassword", () => {
  it("accepts the exact password", () => {
    expect(verifyPassword("rahasia", "rahasia")).toBe(true);
  });

  it("rejects wrong passwords", () => {
    expect(verifyPassword("salah", "rahasia")).toBe(false);
  });

  it("rejects different-length input", () => {
    expect(verifyPassword("raha", "rahasia")).toBe(false);
    expect(verifyPassword("rahasiaaa", "rahasia")).toBe(false);
  });
});

describe("signSession / verifySession", () => {
  it("is deterministic for the same input", async () => {
    await expect(signSession(SECRET, NOW + 100)).resolves.toBe(
      await signSession(SECRET, NOW + 100),
    );
  });

  it("accepts a valid unexpired session", async () => {
    const cookie = await signSession(SECRET, NOW + ADMIN_SESSION_TTL_SEC);
    await expect(verifySession(SECRET, cookie, NOW)).resolves.toBe(true);
  });

  it("rejects expired sessions", async () => {
    const cookie = await signSession(SECRET, NOW - 1);
    await expect(verifySession(SECRET, cookie, NOW)).resolves.toBe(false);
  });

  it("rejects malformed cookie values", async () => {
    await expect(verifySession(SECRET, "", NOW)).resolves.toBe(false);
    await expect(verifySession(SECRET, "no-dot", NOW)).resolves.toBe(false);
    await expect(verifySession(SECRET, "abc.def", NOW)).resolves.toBe(false);
    await expect(verifySession(SECRET, `${NOW + 100}.zzzz`, NOW)).resolves.toBe(false);
  });

  it("rejects forged HMAC", async () => {
    const cookie = await signSession(SECRET, NOW + 100);
    await expect(verifySession("other-secret", cookie, NOW)).resolves.toBe(false);
  });

  it("rejects tampered expiry", async () => {
    const cookie = await signSession(SECRET, NOW + 100);
    const sig = cookie.slice(cookie.indexOf(".") + 1);
    await expect(
      verifySession(SECRET, `${NOW + 9999}.${sig}`, NOW),
    ).resolves.toBe(false);
  });
});
