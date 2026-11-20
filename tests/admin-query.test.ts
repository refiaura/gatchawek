import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db/client.js";
import {
  cards,
  groups,
  injectQueue,
  members,
  pools,
  userCards,
  users,
} from "../src/db/schema.js";
import {
  getAdminCard,
  getAdminCounts,
  listAdminCards,
  listAdminQueue,
  setAdminCardEnabled,
  setAdminCardImage,
} from "../src/db/queries/admin.js";
import type { Env } from "../src/env.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

let mf: Miniflare;
let db: Db;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  const d1 = await mf.getD1Database("DB");
  const dir = path.join(REPO_ROOT, "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const content = await readFile(path.join(dir, file), "utf8");
    for (const chunk of content.split("--> statement-breakpoint")) {
      const stmt = chunk
        .trim()
        .replace(/`/g, '"')
        .replace(/;$/, "")
        .replace(/\s+/g, " ");
      if (stmt !== "") await d1.exec(stmt);
    }
  }
  const env = {
    DISCORD_PUBLIC_KEY: "x",
    DB: d1,
    PUBLIC_BASE_URL: "example.test",
    DISCORD_BOT_TOKEN: "token",
  } as unknown as Env;
  db = createDb(env);

  await db.insert(pools).values({
    id: "pejabat",
    name: "Pejabat",
    emoji: "🏛️",
    staminaMax: 10,
    regenIntervalSec: 100,
    resetCooldownSec: 3600,
    memberCount: 2,
    enabled: true,
  });
  await db.insert(groups).values([
    { id: "g1", poolId: "pejabat", name: "Satu", badge: "SATU", memberCount: 1, enabled: true },
    { id: "g2", poolId: "pejabat", name: "Dua", badge: "DUA", memberCount: 1, enabled: true },
  ]);
  await db.insert(members).values([
    { id: "teddy", poolId: "pejabat", groupId: "g1", name: "Teddy", nameLower: "teddy", photoTotal: 3, sortOrder: 0, enabled: true },
    { id: "rapih", poolId: "pejabat", groupId: "g2", name: "Rapih Amat", nameLower: "rapih amat", photoTotal: 1, sortOrder: 1, enabled: true },
  ]);
  await db.insert(cards).values([
    { id: "teddy-01", poolId: "pejabat", groupId: "g1", memberId: "teddy", serial: 1, photoNo: 1, rarity: "ultra_rare", imageFile: "", enabled: true },
    { id: "teddy-02", poolId: "pejabat", groupId: "g1", memberId: "teddy", serial: 2, photoNo: 2, rarity: "rare", imageFile: "teddy.webp", enabled: true },
    { id: "rapih-01", poolId: "pejabat", groupId: "g2", memberId: "rapih", serial: 3, photoNo: 1, rarity: "common", imageFile: "https://cdn/x.png?ex=1", enabled: true },
    { id: "teddy-03", poolId: "pejabat", groupId: "g1", memberId: "teddy", serial: 4, photoNo: 3, rarity: "common", imageFile: "gone.webp", enabled: false },
  ]);
  await db.insert(users).values({ id: "u1", createdAt: 1 });
  await db.insert(userCards).values([
    { userId: "u1", cardId: "teddy-02", quantity: 2, firstObtainedAt: 1, lastObtainedAt: 1 },
  ]);
  await db.insert(injectQueue).values([
    { messageId: "m1", channelId: "c", guildId: "g", submittedAt: 3, messageUrl: "https://x/3", status: "pending" },
    { messageId: "m2", channelId: "c", guildId: "g", submittedAt: 2, messageUrl: "https://x/2", status: "approved" },
    { messageId: "m3", channelId: "c", guildId: "g", submittedAt: 1, messageUrl: "https://x/1", status: "rejected" },
  ]);
}, 60_000);

afterAll(async () => {
  await mf.dispose();
});

describe("listAdminCards", () => {
  it("filters empty images", async () => {
    const { rows, total } = await listAdminCards(db, { kind: "empty", q: "", limit: 50, offset: 0 });
    expect(total).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(["teddy-01"]);
    expect(rows[0]?.imageKind).toBe("empty");
  });

  it("filters remote images", async () => {
    const { rows, total } = await listAdminCards(db, { kind: "remote", q: "", limit: 50, offset: 0 });
    expect(total).toBe(1);
    expect(rows[0]?.id).toBe("rapih-01");
  });

  it("filters static images including disabled cards", async () => {
    const { rows, total } = await listAdminCards(db, { kind: "static", q: "", limit: 50, offset: 0 });
    expect(total).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual(["teddy-02", "teddy-03"]);
  });

  it("searches by member name prefix and card id", async () => {
    const byName = await listAdminCards(db, { kind: "all", q: "Ted", limit: 50, offset: 0 });
    expect(byName.total).toBe(3);
    const byId = await listAdminCards(db, { kind: "all", q: "rapih-01", limit: 50, offset: 0 });
    expect(byId.total).toBe(1);
    expect(byId.rows[0]?.id).toBe("rapih-01");
  });

  it("aggregates owned quantity and paginates", async () => {
    const page = await listAdminCards(db, { kind: "all", q: "", limit: 2, offset: 1 });
    expect(page.total).toBe(4);
    expect(page.rows).toHaveLength(2);
    expect(page.rows.map((r) => r.id)).toEqual(["teddy-01", "teddy-02"]);
    expect(page.rows[1]?.quantityOwned).toBe(2);
  });
});

describe("getAdminCard / setters", () => {
  it("returns null for unknown ids", async () => {
    await expect(getAdminCard(db, "nope-99")).resolves.toBeNull();
  });

  it("round-trips image and enabled", async () => {
    await expect(setAdminCardImage(db, "teddy-01", "https://cdn/new.png")).resolves.toBe(true);
    await expect(getAdminCard(db, "teddy-01")).resolves.toMatchObject({
      imageFile: "https://cdn/new.png",
      imageKind: "remote",
    });
    await expect(setAdminCardImage(db, "teddy-01", "")).resolves.toBe(true);
    await expect(setAdminCardEnabled(db, "teddy-03", true)).resolves.toBe(true);
    await expect(getAdminCard(db, "teddy-03")).resolves.toMatchObject({ enabled: true });
    await expect(setAdminCardEnabled(db, "nope-99", true)).resolves.toBe(false);
    await expect(setAdminCardImage(db, "nope-99", "x")).resolves.toBe(false);
  });
});

describe("listAdminQueue / getAdminCounts", () => {
  it("lists each status newest-first", async () => {
    await expect(listAdminQueue(db, "pending", 50, 0)).resolves.toMatchObject({ total: 1 });
    const approved = await listAdminQueue(db, "approved", 50, 0);
    expect(approved.rows[0]?.messageId).toBe("m2");
    const rejected = await listAdminQueue(db, "rejected", 50, 0);
    expect(rejected.rows[0]?.messageId).toBe("m3");
  });

  it("counts totals", async () => {
    await expect(getAdminCounts(db)).resolves.toMatchObject({
      total: 4,
      pending: 1,
    });
  });
});
