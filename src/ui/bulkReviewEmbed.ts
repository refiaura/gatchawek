import type { APIEmbed } from "discord-api-types/v10";
import type { BulkBatch } from "../db/queries/inject.js";

export interface BulkReviewEmbedArgs {
  batch: BulkBatch;
  batchCount: number;
}

export function bulkCustomId(action: "ok" | "no", baseId: string): string {
  return `bulk:${action}:${baseId}`;
}

export function parseBulkCustomId(customId: string): {
  action: "ok" | "no";
  baseId: string;
} | null {
  const [ns, action, baseId] = customId.split(":");
  if (ns !== "bulk") return null;
  if (action !== "ok" && action !== "no") return null;
  if (baseId === undefined || baseId === "") return null;
  return { action, baseId };
}

export function buildBulkReviewEmbed(args: BulkReviewEmbedArgs): APIEmbed {
  const { batch, batchCount } = args;
  const rows = batch.rows
    .map((r, i) => `${String(i + 1)}. **${r.nama ?? "?"}** · ${r.rarity ?? "?"}${r.label ? ` · ${r.label}` : ""}`)
    .join("\n");
  const first = batch.rows[0];
  const lines = [
    `**${String(batch.rows.length)} kartu** dari 1 pesan bulk (${batch.baseId})`,
    `Pool: ${first?.pool ?? "?"} / Grup: ${first?.grup ?? "?"}`,
    ``,
    rows,
    ``,
    `Batch antre: ${String(batchCount)} batch (ini yang tertua).`,
  ];
  const embed: APIEmbed = {
    title: "📦 Review Bulk",
    description: lines.join("\n"),
  };
  if (first?.imageUrl !== null && first?.imageUrl !== undefined && first.imageUrl !== "") {
    embed.thumbnail = { url: first.imageUrl };
  }
  return embed;
}

export function bulkReviewButtons(baseId: string): [
  { type: 2; style: 3; label: string; custom_id: string },
  { type: 2; style: 4; label: string; custom_id: string },
] {
  return [
    { type: 2, style: 3, label: "✅ Setujui semua", custom_id: bulkCustomId("ok", baseId) },
    { type: 2, style: 4, label: "❌ Tolak semua", custom_id: bulkCustomId("no", baseId) },
  ];
}
