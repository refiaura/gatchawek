# gatchawek

Discord photocard gacha bot — Cloudflare Workers + Hono + D1 + Drizzle, HTTP Interactions (tanpa Gateway).

## Fase 0 — Fondasi

### Prasyarat manual (user)

Buat aplikasi di Discord Developer Portal; catat Application ID dan Public Key; buat bot token; undang bot ke
server dengan scope `applications.commands` dan `bot`; catat Guild ID. Jalankan `wrangler login`.

### Variabel environment

| File | Variabel | Dipakai oleh |
| --- | --- | --- |
| `.dev.vars` (gitignored, salin dari `.dev.vars.example`) | `DISCORD_PUBLIC_KEY` | runtime Worker (`wrangler dev` / `deploy`) |
| `.env` lokal (gitignored) | `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`, `GUILD_ID` | `pnpm register` |

Nilai Public Key, Application ID, Bot Token, dan Guild ID diminta dari user sebelum verifikasi manual —
tidak pernah di-commit.

### Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | jalankan Worker lokal (`wrangler dev`, port 8787) |
| `pnpm register` | PUT guild commands dari `src/commands/*/definition.ts` (+ choices pool dari `data/pools.json`) |
| `pnpm typecheck` | `tsc` worker + node |
| `pnpm test` | `vitest run` |
| `pnpm lint` | `eslint .` |
| `pnpm deploy` | deploy ke Workers |

### Dev lokal + Interactions Endpoint

1. `pnpm dev` (port 8787).
2. `cloudflared tunnel --url http://localhost:8787` — dapatkan URL publik, mis. `https://xxx.trycloudflare.com`.
3. Di Discord Developer Portal → General Information → Interactions Endpoint URL, pasang
   `<tunnel-url>/interactions`. Portal menerima tanpa error = path verifikasi 401 benar.
4. `/ping` di server harus membalas `🏓 Pong!` yang terlihat semua member.

URL quick tunnel **berubah tiap run** dan harus dipasang ulang di portal setiap kali tunnel dibuat ulang.
Alternatif: deploy Worker staging gratis (`pnpm deploy`) — Fase 0 tanpa D1 sehingga staging tidak butuh D1
terpisah. Di Fase 1+, staging memakai D1 terpisah.
