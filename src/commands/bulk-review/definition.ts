import {
  InteractionContextType,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";

export const bulkReviewDefinition: RESTPostAPIChatInputApplicationCommandsJSONBody = {
  name: "bulk-review",
  description: "Review antrean bulk JSON per batch (kurator).",
  contexts: [InteractionContextType.Guild],
};
