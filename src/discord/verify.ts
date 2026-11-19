import { verifyKey } from "discord-interactions";

export async function verifyDiscordRequest(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  publicKey: string,
): Promise<boolean> {
  if (signature === undefined || timestamp === undefined) return false;
  return verifyKey(rawBody, signature, timestamp, publicKey);
}
