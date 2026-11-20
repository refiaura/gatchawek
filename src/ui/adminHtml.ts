/**
 * Pure HTML builders for the admin panel. No fetch, no db: `(args) => string`.
 * All DB/user values pass through escapeHtml.
 */

import type {
  AdminCardDetail,
  AdminCardKindFilter,
  AdminCardRow,
  AdminCounts,
  AdminQueueStatus,
} from "../db/queries/admin.js";
import type { QueueRow } from "../db/queries/inject.js";

export type AdminPage = "login" | "dashboard" | "cards" | "card" | "inject";

const BASE =
  "https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css";

function localImageSrc(base: string, imageFile: string): string {
  // Mirrors cardImageUrl (src/ui/gachaEmbed.ts) without a cross-layer import.
  if (
    imageFile.startsWith("https://") ||
    imageFile.startsWith("http://")
  ) {
    return imageFile;
  }
  return `https://${base}/cards/${imageFile}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(title: string, active: AdminPage, body: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · admin</title><link rel="stylesheet" href="${BASE}"><style>main{max-width:1100px;margin:0 auto;padding:1rem}nav{display:flex;gap:1rem;align-items:center;margin-bottom:1rem}nav .sp{flex:1}table img{width:96px;height:96px;object-fit:cover}.badge{display:inline-block;padding:.1rem .5rem;border-radius:999px;font-size:.8rem}.b-empty{background:#fee2e2}.b-remote{background:#fef3c7}.b-static{background:#dcfce7}.b-off{background:#e5e7eb}.thumb-broken{border:2px solid #ef4444}.kindpick{display:inline-block;margin:.1rem}</style></head><body><main><nav><strong>🛠️ admin</strong><a href="/admin"${active === "dashboard" ? ' aria-current="page"' : ""}>dashboard</a><a href="/admin/cards"${active === "cards" || active === "card" ? ' aria-current="page"' : ""}>kartu</a><a href="/admin/inject"${active === "inject" ? ' aria-current="page"' : ""}>inject</a><span class="sp"></span><form method="post" action="/admin/logout"><button type="submit" class="secondary outline">logout</button></form></nav>${body}</main></body></html>`;
}

export function loginPage(error: string | null): string {
  const err =
    error === null ? "" : `<p role="alert"><mark>${escapeHtml(error)}</mark></p>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>login · admin</title><link rel="stylesheet" href="${BASE}"></head><body><main class="container" style="max-width:28rem"><h1>🔐 admin login</h1>${err}<form method="post" action="/admin/login"><label>password<input type="password" name="password" required autocomplete="current-password"></label><button type="submit">masuk</button></form></main></body></html>`;
}

export function dashboardPage(counts: AdminCounts): string {
  return shell(
    "dashboard",
    "dashboard",
    `<h1>dashboard</h1><div class="grid"><article><header>total kartu</header><h2>${counts.total}</h2></article><article><header>image kosong</header><h2>${counts.empty}</h2><a href="/admin/cards?kind=empty">lihat →</a></article><article><header>image remote/CDN</header><h2>${counts.remote}</h2><a href="/admin/cards?kind=remote">lihat →</a></article><article><header>inject pending</header><h2>${counts.pending}</h2><a href="/admin/inject?status=pending">review →</a></article></div>`,
  );
}

function kindBadge(kind: string): string {
  const cls =
    kind === "empty" ? "b-empty" : kind === "remote" ? "b-remote" : "b-static";
  return `<span class="badge ${cls}">${escapeHtml(kind)}</span>`;
}

const KINDS: AdminCardKindFilter[] = ["all", "empty", "remote", "static"];

export function cardsPage(args: {
  rows: AdminCardRow[];
  total: number;
  kind: AdminCardKindFilter;
  q: string;
  base: string;
}): string {
  const tabs = KINDS.map(
    (k) =>
      `<a role="button" class="kindpick${k === args.kind ? "" : " secondary outline"}" href="/admin/cards?kind=${k}${args.q === "" ? "" : `&amp;q=${encodeURIComponent(args.q)}`}">${k}</a>`,
  ).join("");
  const rows = args.rows
    .map((r) => {
      const thumb =
        r.imageKind === "empty"
          ? `<span class="badge b-empty">tanpa image</span>`
          : `<img src="${escapeHtml(localImageSrc(args.base, r.imageFile))}" alt="" loading="lazy" onerror="this.classList.add('thumb-broken');var b=this.nextElementSibling;if(b)b.hidden=false;"><span class="badge b-off" hidden>gagal dimuat</span>`;
      return `<tr><td>${thumb}</td><td><a href="/admin/cards/${escapeHtml(r.id)}">${escapeHtml(r.id)}</a></td><td>${escapeHtml(r.memberName)}</td><td>${escapeHtml(r.poolName)} · ${escapeHtml(r.groupBadge)}</td><td>${escapeHtml(r.rarity)}</td><td>${kindBadge(r.imageKind)}</td><td>×${r.quantityOwned}</td><td>${r.enabled ? "aktif" : `<span class="badge b-off">mati</span>`}</td></tr>`;
    })
    .join("");
  return shell(
    "kartu",
    "cards",
    `<h1>kartu (${args.total})</h1><div>${tabs}</div><form method="get" action="/admin/cards" role="search"><input type="hidden" name="kind" value="${escapeHtml(args.kind)}"><input type="search" name="q" value="${escapeHtml(args.q)}" placeholder="cari nama / id kartu"><button type="submit">cari</button></form><table><thead><tr><th>thumb</th><th>id</th><th>member</th><th>pool · grup</th><th>rarity</th><th>kind</th><th>owned</th><th>status</th></tr></thead><tbody>${rows === "" ? `<tr><td colspan="8">kosong.</td></tr>` : rows}</tbody></table>`,
  );
}

export function cardDetailPage(args: {
  card: AdminCardDetail;
  base: string;
  message: string | null;
  ok: boolean;
}): string {
  const c = args.card;
  const img =
    c.imageKind === "empty"
      ? `<p><span class="badge b-empty">tanpa image</span></p>`
      : `<img src="${escapeHtml(localImageSrc(args.base, c.imageFile))}" alt="" style="max-width:320px" onerror="this.classList.add('thumb-broken');var b=document.getElementById('imgwarn');if(b)b.hidden=false;"><p id="imgwarn" hidden><span class="badge b-off">⚠️ gagal dimuat — file static hilang atau URL mati</span></p>`;
  const rawBanner =
    c.imageKind === "remote"
      ? `<p><span class="badge b-remote">⚠️ image raw/CDN — rebuild pipeline (fetch-images → build-cards → seed → deploy) agar permanen</span></p>`
      : "";
  const msg =
    args.message === null
      ? ""
      : `<p role="alert"><mark>${escapeHtml(args.message)}</mark></p>`;
  return shell(
    c.id,
    "card",
    `<h1>${escapeHtml(c.id)}</h1>${msg}${img}${rawBanner}<ul><li>member: ${escapeHtml(c.memberName)}${c.fullName === null ? "" : ` (${escapeHtml(c.fullName)})`}</li><li>pool: ${escapeHtml(c.poolName)} · grup: ${escapeHtml(c.groupBadge)}</li><li>rarity: ${escapeHtml(c.rarity)} · foto ${c.photoNo}/${c.photoTotal}${c.photoLabel === null ? "" : ` · ${escapeHtml(c.photoLabel)}`}</li><li>serial: ${c.serial} · owned ×${c.quantityOwned} · holo: ${c.holoEnabled ? "ya" : "tidak"}</li><li>sumber: ${c.sourcePageUrl === null ? "—" : escapeHtml(c.sourcePageUrl)}</li><li>kind: ${kindBadge(c.imageKind)} · status: ${c.enabled ? "aktif" : "mati"}</li><li>image_file: <code>${escapeHtml(c.imageFile)}</code></li></ul><h2>ganti image</h2><form method="post" action="/admin/cards/${escapeHtml(c.id)}/image" enctype="multipart/form-data"><label>upload file (≤8 MB)<input type="file" name="file" accept="image/*" required></label><button type="submit">upload via discord</button></form><form method="post" action="/admin/cards/${escapeHtml(c.id)}/image"><label>atau set URL manual (https)<input type="url" name="url" placeholder="https://…" required></label><button type="submit">set URL</button></form><h2>status</h2><form method="post" action="/admin/cards/${escapeHtml(c.id)}/enabled"><input type="hidden" name="enabled" value="${c.enabled ? "0" : "1"}"><button type="submit">${c.enabled ? "nonaktifkan" : "aktifkan"}</button></form><p><a href="/admin/cards">← kembali</a></p>`,
  );
}

const STATUSES: AdminQueueStatus[] = ["pending", "approved", "rejected"];

export function injectPage(args: {
  rows: QueueRow[];
  total: number;
  status: AdminQueueStatus;
  ok: string | null;
}): string {
  const tabs = STATUSES.map(
    (s) =>
      `<a role="button" class="kindpick${s === args.status ? "" : " secondary outline"}" href="/admin/inject?status=${s}">${s}</a>`,
  ).join("");
  const ok = args.ok === null ? "" : `<p><mark>${escapeHtml(args.ok)}</mark></p>`;
  const rows = args.rows
    .map((r) => {
      const preview =
        r.imageUrl === null || r.imageUrl === ""
          ? `<span class="badge b-empty">tanpa image</span>`
          : `<a href="${escapeHtml(r.messageUrl)}"><img src="${escapeHtml(r.imageUrl)}" alt="" loading="lazy" onerror="this.classList.add('thumb-broken');var b=this.nextElementSibling;if(b)b.hidden=false;"><span class="badge b-off" hidden>gagal dimuat</span></a>`;
      const action =
        r.status === "pending"
          ? `<form method="post" action="/admin/inject/${escapeHtml(r.messageId)}/approve" onsubmit="return confirm('Approve ${escapeHtml(r.nama ?? r.messageId)}?')"><button type="submit">approve</button></form><form method="post" action="/admin/inject/${escapeHtml(r.messageId)}/reject" onsubmit="return confirm('Reject ${escapeHtml(r.messageId)}?')"><button type="submit" class="secondary outline">reject</button></form>`
          : escapeHtml(r.status);
      return `<tr><td>${preview}</td><td>${escapeHtml(r.nama ?? "—")}<br><small>${escapeHtml(r.messageId)}</small></td><td>${escapeHtml(r.pool ?? "—")} · ${escapeHtml(r.grup ?? "—")}</td><td>${escapeHtml(r.rarity ?? "—")}</td><td>${r.errors === null || r.errors === "" ? "—" : escapeHtml(r.errors)}</td><td><a href="${escapeHtml(r.messageUrl)}">pesan</a></td><td>${action}</td></tr>`;
    })
    .join("");
  return shell(
    "inject",
    "inject",
    `<h1>inject ${escapeHtml(args.status)} (${args.total})</h1><div>${tabs}</div>${ok}<table><thead><tr><th>preview</th><th>nama</th><th>pool · grup</th><th>rarity</th><th>errors</th><th>link</th><th>aksi</th></tr></thead><tbody>${rows === "" ? `<tr><td colspan="7">kosong.</td></tr>` : rows}</tbody></table><p>Approve/reject via web memakai logika yang sama dengan tombol Discord.</p>`,
  );
}
