import {
  InteractionResponseType,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Env } from "../../env.js";

export type CommandHandler = (
  interaction: APIChatInputApplicationCommandInteraction,
  env: Env,
) => APIInteractionResponse | Promise<APIInteractionResponse>;

export function handlePing(): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "🏓 Pong!" },
  };
}
