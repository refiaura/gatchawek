import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SEC,
  signSession,
  verifyPassword,
  verifySession,
} from "./auth.js";
import { createDb } from "../db/client.js";
import {
  getAdminCard,
  getAdminCounts,
  listAdminCards,
  listAdminQueue,
  setAdminCardEnabled,
  setAdminCardImage,
  type AdminCardKindFilter,
  type AdminQueueStatus,
} from "../db/queries/admin.js";
import { approveQueued, rejectQueued } from "../db/queries/inject.js";
import type { Env } from "../env.js";
import {
  cardDetailPage,
  cardsPage,
  dashboardPage,
  injectPage,
  loginPage,
} from "../ui/adminHtml.js";

const MAX_UPLOAD_BYTES = 8_000_000;
const MAX_MANUAL_URL_LEN = 500;

// Single-user owner panel: cookie is HttpOnly + SameSite=Lax + Secure with
// POST-only mutations, proportional to this threat model (no CSRF token).

function loginRedirect(): Response {
  return Response.redirect("/admin/login", 302);
}

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  const admin = new Hono<{ Bindings: Env }>();

  admin.use("*", async (c, next) => {
    if (c.req.path === "/admin/login") return next();
    const value = getCookie(c, ADMIN_SESSION_COOKIE);
    const nowSec = Math.floor(Date.now() / 1000);
    const ok =
      value !== undefined &&
      value !== "" &&
      (await verifySession(c.env.ADMIN_SECRET, value, nowSec));
    if (!ok) {
      if (c.req.method === "GET") return loginRedirect();
      return c.text("Unauthorized", 401);
    }
    return next();
  });

  admin.get("/login", (c) => c.html(loginPage(null)));

  admin.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const password =
      typeof form["password"] === "string" ? form["password"] : "";
    if (password === "" || !verifyPassword(password, c.env.ADMIN_PASSWORD)) {
      return c.html(loginPage("Password salah"));
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const value = await signSession(
      c.env.ADMIN_SECRET,
      nowSec + ADMIN_SESSION_TTL_SEC,
    );
    c.header(
      "Set-Cookie",
      `${ADMIN_SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/admin; Secure; Max-Age=${ADMIN_SESSION_TTL_SEC}`,
    );
    return c.redirect("/admin");
  });

  admin.post("/logout", (c) => {
    c.header(
      "Set-Cookie",
      `${ADMIN_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/admin; Secure; Max-Age=0`,
    );
    return c.redirect("/admin/login");
  });

  admin.get("/", async (c) => {
    const db = createDb(c.env);
    return c.html(dashboardPage(await getAdminCounts(db)));
  });

  admin.get("/cards", async (c) => {
    const rawKind = c.req.query("kind") ?? "";
    const kind: AdminCardKindFilter =
      rawKind === "empty" || rawKind === "remote" || rawKind === "static"
        ? rawKind
        : "all";
    const q = c.req.query("q") ?? "";
    const db = createDb(c.env);
    const { rows, total } = await listAdminCards(db, {
      kind,
      q,
      limit: 100,
      offset: 0,
    });
    return c.html(
      cardsPage({ rows, total, kind, q, base: c.env.PUBLIC_BASE_URL }),
    );
  });

  admin.get("/cards/:id", async (c) => {
    const id = c.req.param("id");
    const card = await getAdminCard(createDb(c.env), id);
    if (card === null) return c.text("Kartu tidak ditemukan", 404);
    const message = c.req.query("msg") ?? null;
    return c.html(
      cardDetailPage({
        card,
        base: c.env.PUBLIC_BASE_URL,
        message: message === "" ? null : message,
        ok: (c.req.query("ok") ?? "") === "1",
      }),
    );
  });

  admin.post("/cards/:id/image", async (c) => {
    const id = c.req.param("id");
    const db = createDb(c.env);
    const card = await getAdminCard(db, id);
    if (card === null) return c.text("Kartu tidak ditemukan", 404);
    const fail = (message: string): Response =>
      c.html(
        cardDetailPage({
          card,
          base: c.env.PUBLIC_BASE_URL,
          message,
          ok: false,
        }),
      );
    let form: Record<string, string | File>;
    try {
      form = await c.req.parseBody();
    } catch {
      return fail("Form tidak terbaca.");
    }
    const file = form["file"];
    const url =
      typeof form["url"] === "string" ? form["url"].trim() : "";
    const done = (message: string): Response =>
      c.redirect(
        `/admin/cards/${encodeURIComponent(id)}?ok=1&msg=${encodeURIComponent(message)}`,
      );
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return fail("File harus gambar.");
      if (file.size > MAX_UPLOAD_BYTES) return fail("File melebihi 8 MB.");
      const discord = new FormData();
      discord.set("content", `🗂️ admin upload untuk ${id} oleh owner`);
      discord.set("file", file, file.name || "upload");
      let res: Response;
      try {
        res = await fetch(
          `https://discord.com/api/v10/channels/${c.env.INGEST_CHANNEL_ID}/messages`,
          {
            method: "POST",
            headers: { Authorization: `Bot ${c.env.DISCORD_BOT_TOKEN}` },
            body: discord,
          },
        );
      } catch {
        return fail("Upload ke Discord gagal (jaringan). D1 tidak diubah.");
      }
      if (!res.ok) {
        return fail(`Upload ke Discord gagal (${res.status}). D1 tidak diubah.`);
      }
      let payload: { attachments?: { url?: string }[] };
      try {
        payload = (await res.json()) as typeof payload;
      } catch {
        return fail("Respons Discord tak terbaca. D1 tidak diubah.");
      }
      const cdn = payload.attachments?.[0]?.url;
      if (typeof cdn !== "string" || cdn === "") {
        return fail("Discord tak mengembalikan URL. D1 tidak diubah.");
      }
      await setAdminCardImage(db, id, cdn);
      return done("Image diperbarui (remote/CDN).");
    }
    if (url !== "") {
      if (!url.startsWith("https://")) {
        return fail("URL harus diawali https://");
      }
      if (url.length > MAX_MANUAL_URL_LEN) {
        return fail("URL terlalu panjang (maks 500).");
      }
      await setAdminCardImage(db, id, url);
      return done("Image diperbarui (remote/CDN).");
    }
    return fail("Pilih file upload atau isi URL manual.");
  });

  admin.post("/cards/:id/enabled", async (c) => {
    const id = c.req.param("id");
    const form = await c.req.parseBody();
    const enabled = form["enabled"] === "1";
    const ok = await setAdminCardEnabled(createDb(c.env), id, enabled);
    if (!ok) return c.text("Kartu tidak ditemukan", 404);
    return c.redirect(`/admin/cards/${encodeURIComponent(id)}`);
  });

  admin.get("/inject", async (c) => {
    const raw = c.req.query("status") ?? "";
    const status: AdminQueueStatus =
      raw === "approved" || raw === "rejected" ? raw : "pending";
    const { rows, total } = await listAdminQueue(
      createDb(c.env),
      status,
      100,
      0,
    );
    return c.html(
      injectPage({
        rows,
        total,
        status,
        ok: c.req.query("ok") || null,
      }),
    );
  });

  admin.post("/inject/:messageId/approve", async (c) => {
    const messageId = c.req.param("messageId");
    const db = createDb(c.env);
    const outcome = await approveQueued(db, messageId, "admin-web", Date.now());
    if (outcome.status !== "ok") {
      const pending = await listAdminQueue(db, "pending", 100, 0);
      return c.html(
        injectPage({
          rows: pending.rows,
          total: pending.total,
          status: "pending",
          ok: `Approve gagal: ${outcome.status}`,
        }),
      );
    }
    return c.redirect(
      `/admin/inject?status=approved&ok=${encodeURIComponent(`Approved → ${outcome.cardId}`)}`,
    );
  });

  admin.post("/inject/:messageId/reject", async (c) => {
    const messageId = c.req.param("messageId");
    await rejectQueued(createDb(c.env), messageId, "admin-web", Date.now());
    return c.redirect("/admin/inject?status=rejected");
  });

  // Mounted under /admin by the caller.
  app.route("/admin", admin);
}
