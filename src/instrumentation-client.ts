import { initBotId } from "botid/client/core";
import { BOT_PROTECTED_PATHS } from "@/lib/auth/bot-paths";

// BotID só funciona publicado na Vercel; fora dela (local, testes) não é carregado.
if (process.env.NEXT_PUBLIC_VP_BOTID === "1") {
  try {
    initBotId({ protect: BOT_PROTECTED_PATHS.map((path) => ({ path, method: "POST" })) });
  } catch {
    /* sem os sinais, o servidor recusa como robô; nada a fazer aqui */
  }
}
