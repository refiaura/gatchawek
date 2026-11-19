import { pingDefinition } from "./ping/definition.js";
import { handlePing, type CommandHandler } from "./ping/handler.js";

export const commandDefinitions = [pingDefinition];

export const commandHandlers: Map<string, CommandHandler> = new Map([
  ["ping", handlePing],
]);
