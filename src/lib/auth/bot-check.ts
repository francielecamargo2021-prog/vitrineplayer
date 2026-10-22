import "server-only";
import { checkBotId } from "botid/server";
import { makeBotGate } from "./bot-gate";

/** BotID Basic: só existe na Vercel (VERCEL=1). Regras em bot-gate.ts. */
export const botGate = makeBotGate({
  onVercel: process.env.VERCEL === "1",
  check: () => checkBotId(),
});
