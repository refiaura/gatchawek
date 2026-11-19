import { Hono } from "hono";
import {
  InteractionResponseType,
  InteractionType,
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
} from "discord-api-types/v10";
import { verifyDiscordRequest } from "./discord/verify.js";
import { commandHandlers } from "./commands/registry.js";
import type { Env } from "./env.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok" }, 200));

app.post("/interactions", async (c) => {
  const signature = c.req.header("X-Signature-Ed25519");
  const timestamp = c.req.header("X-Signature-Timestamp");
  const body = await c.req.text();
  if (signature === undefined || timestamp === undefined) {
    return c.text("Bad request signature", 401);
  }
  const ok = await verifyDiscordRequest(
    body,
    signature,
    timestamp,
    c.env.DISCORD_PUBLIC_KEY,
  );
  if (!ok) return c.text("Bad request signature", 401);

  const interaction = JSON.parse(body) as APIInteraction;
  if (interaction.type === InteractionType.Ping) {
    return c.json({ type: InteractionResponseType.Pong });
  }
  if (interaction.type === InteractionType.ApplicationCommand) {
    const command = interaction as APIChatInputApplicationCommandInteraction;
    const handler = commandHandlers.get(command.data.name);
    if (handler === undefined) {
      return c.json({ error: "Unknown command" }, 400);
    }
    return c.json(await handler(command, c.env));
  }
  return c.json({ error: "Unhandled interaction type" }, 400);
});

export default app;
