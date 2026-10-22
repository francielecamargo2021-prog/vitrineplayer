/**
 * Verificação de robôs (Vercel BotID Basic) nas ações de autenticação, sem Next.js: a
 * chamada ao BotID chega por `check`, para o comportamento ser testado sem a Vercel.
 *
 * - Fora da Vercel (local, testes): o BotID não existe; nada é verificado (registrado uma vez).
 *   Não há chave nem cabeçalho que desligue a verificação NA Vercel.
 * - Na Vercel: robô → recusado. Falha do BotID → cadastro recusado ("indisponível": criar conta
 *   pode esperar); entrar, códigos e recuperação seguem, com registro (os limites e a proteção
 *   por conta continuam valendo; uma família não fica trancada por falha da Vercel).
 */
export type BotFlow = "signup" | "signin" | "code" | "reset";
export type BotResult = { ok: true } | { ok: false; reason: "bot" | "unavailable" };
export type BotEvent = { event: "botid"; flow: BotFlow; outcome: "bot" | "error" | "skipped"; detail?: string };

export function makeBotGate(o: {
  onVercel: boolean;
  check: () => Promise<{ isBot: boolean }>;
  log?: (e: BotEvent) => void;
  timeoutMs?: number;
}) {
  const log = o.log ?? ((e: BotEvent) => console.warn(JSON.stringify(e)));
  let skippedLogged = false;
  return async function botGate(flow: BotFlow): Promise<BotResult> {
    if (!o.onVercel) {
      if (!skippedLogged) log({ event: "botid", flow, outcome: "skipped", detail: "fora da Vercel" });
      skippedLogged = true;
      return { ok: true };
    }
    try {
      const r = await withTimeout(o.check(), o.timeoutMs ?? 2500);
      if (r.isBot) {
        log({ event: "botid", flow, outcome: "bot" });
        return { ok: false, reason: "bot" };
      }
      return { ok: true };
    } catch (e) {
      // só o tipo do erro: nada de e-mail, IP ou mensagem
      log({ event: "botid", flow, outcome: "error", detail: e instanceof Error ? e.name : typeof e });
      return flow === "signup" ? { ok: false, reason: "unavailable" } : { ok: true };
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
