import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  cards,
  groups,
  injectQueue,
  members,
  pools,
  userCards,
  type Rarity,
} from "../schema.js";
import { nativeBatch, type Db } from "../client.js";
import type { QueueRow } from "./inject.js";

export type CardImageKind = "static" | "remote" | "empty";
export type AdminCardKindFilter = "all" | CardImageKind;
export type AdminQueueStatus = "pending" | "approved" | "rejected";

/** static = served from /cards/; remote = raw http(s) URL; empty = "". */
export function classifyImageFile(imageFile: string): CardImageKind {
  if (imageFile === "") return "empty";
  if (
    imageFile.startsWith("http://") ||
    imageFile.startsWith("https://")
  ) {
    return "remote";
  }
  return "static";
}

export interface AdminCardRow {
  id: string;
  memberName: string;
  groupBadge: string;
  poolName: string;
  photoNo: number;
  rarity: Rarity;
  imageFile: string;
  imageKind: CardImageKind;
  enabled: boolean;
  quantityOwned: number;
}

export interface AdminCardDetail extends AdminCardRow {
  photoLabel: string | null;
  fullName: string | null;
  photoTotal: number;
  serial: number;
  sourcePageUrl: string | null;
  holoEnabled: boolean;
}

export interface AdminCounts {
  total: number;
  empty: number;
  remote: number;
  pending: number;
}

function escapeLike(s: string): string {
  // D1 requires a single-char ESCAPE; "/" never appears in ids/names here.
  return s.replace(/[%_/]/g, (c) => `/${c}`);
}

function cardWhere(kind: AdminCardKindFilter, q: string): SQL {
  const conds: SQL[] = [];
  if (kind === "empty") {
    conds.push(sql`${cards.imageFile} = ''`);
  } else if (kind === "remote") {
    conds.push(sql`${cards.imageFile} LIKE 'http%'`);
  } else if (kind === "static") {
    conds.push(
      sql`${cards.imageFile} != '' AND ${cards.imageFile} NOT LIKE 'http%'`,
    );
  }
  const needle = q.trim().toLowerCase();
  if (needle !== "") {
    const esc = escapeLike(needle);
    conds.push(
      sql`(${members.nameLower} LIKE ${`${esc}%`} ESCAPE '/' OR ${cards.id} LIKE ${`%${esc}%`} ESCAPE '/')`,
    );
  }
  return and(...conds) ?? sql`1 = 1`;
}

function clampLimit(limit: number): number {
  const n = Math.trunc(limit);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 200);
}

function clampOffset(offset: number): number {
  const n = Math.trunc(offset);
  if (!Number.isFinite(n)) return 0;
  return Math.max(n, 0);
}

interface AdminCardRaw {
  id: string;
  member_name: string;
  group_badge: string;
  pool_name: string;
  photo_no: number;
  rarity: Rarity;
  image_file: string;
  enabled: number;
  owned: number;
}

function toRow(r: AdminCardRaw): AdminCardRow {
  return {
    id: r.id,
    memberName: r.member_name,
    groupBadge: r.group_badge,
    poolName: r.pool_name,
    photoNo: r.photo_no,
    rarity: r.rarity,
    imageFile: r.image_file,
    imageKind: classifyImageFile(r.image_file),
    enabled: Boolean(r.enabled),
    quantityOwned: Number(r.owned),
  };
}

export async function listAdminCards(
  db: Db,
  opts: {
    kind: AdminCardKindFilter;
    q: string;
    limit: number;
    offset: number;
  },
): Promise<{ rows: AdminCardRow[]; total: number }> {
  const limit = clampLimit(opts.limit);
  const offset = clampOffset(opts.offset);
  const where = cardWhere(opts.kind, opts.q);
  const joinMembers = sql`JOIN ${members} ON ${members.id} = ${cards.memberId}`;
  const [rowsRes, countRes] = await nativeBatch(db, [
    sql`SELECT ${cards.id} AS id, ${members.name} AS member_name, ${groups.badge} AS group_badge, ${pools.name} AS pool_name, ${cards.photoNo} AS photo_no, ${cards.rarity} AS rarity, ${cards.imageFile} AS image_file, ${cards.enabled} AS enabled, IFNULL(SUM(${userCards.quantity}), 0) AS owned FROM ${cards} ${joinMembers} JOIN ${groups} ON ${groups.id} = ${cards.groupId} JOIN ${pools} ON ${pools.id} = ${cards.poolId} LEFT JOIN ${userCards} ON ${userCards.cardId} = ${cards.id} WHERE ${where} GROUP BY ${cards.id} ORDER BY ${cards.id} LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT COUNT(*) AS n FROM ${cards} ${joinMembers} WHERE ${where}`,
  ]);
  const raws = (rowsRes?.results ?? []) as unknown as AdminCardRaw[];
  const total = Number(
    (countRes?.results?.[0] as { n?: number } | undefined)?.n ?? 0,
  );
  return { rows: raws.map(toRow), total };
}

interface AdminCardDetailRaw extends AdminCardRaw {
  photo_label: string | null;
  full_name: string | null;
  photo_total: number;
  serial: number;
  source_page_url: string | null;
  holo_enabled: number;
}

export async function getAdminCard(
  db: Db,
  cardId: string,
): Promise<AdminCardDetail | null> {
  const [res] = await nativeBatch(db, [
    sql`SELECT ${cards.id} AS id, ${members.name} AS member_name, ${groups.badge} AS group_badge, ${pools.name} AS pool_name, ${cards.photoNo} AS photo_no, ${cards.rarity} AS rarity, ${cards.imageFile} AS image_file, ${cards.enabled} AS enabled, IFNULL(SUM(${userCards.quantity}), 0) AS owned, ${cards.photoLabel} AS photo_label, ${members.fullName} AS full_name, ${members.photoTotal} AS photo_total, ${cards.serial} AS serial, ${cards.sourcePageUrl} AS source_page_url, ${cards.holoEnabled} AS holo_enabled FROM ${cards} JOIN ${members} ON ${members.id} = ${cards.memberId} JOIN ${groups} ON ${groups.id} = ${cards.groupId} JOIN ${pools} ON ${pools.id} = ${cards.poolId} LEFT JOIN ${userCards} ON ${userCards.cardId} = ${cards.id} WHERE ${cards.id} = ${cardId} GROUP BY ${cards.id}`,
  ]);
  const raw = (res?.results ?? []) as unknown as AdminCardDetailRaw[];
  const r = raw[0];
  if (r === undefined) return null;
  return {
    ...toRow(r),
    photoLabel: r.photo_label,
    fullName: r.full_name,
    photoTotal: Number(r.photo_total),
    serial: Number(r.serial),
    sourcePageUrl: r.source_page_url,
    holoEnabled: Boolean(r.holo_enabled),
  };
}

export async function setAdminCardImage(
  db: Db,
  cardId: string,
  imageFile: string,
): Promise<boolean> {
  const res = await nativeBatch(db, [
    db.update(cards).set({ imageFile }).where(eq(cards.id, cardId)),
  ]);
  return (res[0]?.meta.changes ?? 0) === 1;
}

export async function setAdminCardEnabled(
  db: Db,
  cardId: string,
  enabled: boolean,
): Promise<boolean> {
  const res = await nativeBatch(db, [
    db.update(cards).set({ enabled }).where(eq(cards.id, cardId)),
  ]);
  return (res[0]?.meta.changes ?? 0) === 1;
}

export async function listAdminQueue(
  db: Db,
  status: AdminQueueStatus,
  limit: number,
  offset: number,
): Promise<{ rows: QueueRow[]; total: number }> {
  const [rows, countRows] = await db.batch([
    db
      .select()
      .from(injectQueue)
      .where(eq(injectQueue.status, status))
      .orderBy(desc(injectQueue.submittedAt))
      .limit(clampLimit(limit))
      .offset(clampOffset(offset)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(injectQueue)
      .where(eq(injectQueue.status, status)),
  ]);
  return { rows, total: countRows[0]?.n ?? 0 };
}

export async function getAdminCounts(db: Db): Promise<AdminCounts> {
  const res = await nativeBatch(db, [
    sql`SELECT COUNT(*) AS n FROM ${cards}`,
    sql`SELECT COUNT(*) AS n FROM ${cards} WHERE ${cards.imageFile} = ''`,
    sql`SELECT COUNT(*) AS n FROM ${cards} WHERE ${cards.imageFile} LIKE 'http%'`,
    sql`SELECT COUNT(*) AS n FROM ${injectQueue} WHERE ${injectQueue.status} = 'pending'`,
  ]);
  const n = (i: number): number =>
    Number((res[i]?.results?.[0] as { n?: number } | undefined)?.n ?? 0);
  return { total: n(0), empty: n(1), remote: n(2), pending: n(3) };
}
