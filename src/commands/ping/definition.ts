import {
  InteractionContextType,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";

export const pingDefinition: RESTPostAPIChatInputApplicationCommandsJSONBody = {
  name: "ping",
  description: "Balas Pong untuk tes koneksi bot.",
  contexts: [InteractionContextType.Guild],
};
