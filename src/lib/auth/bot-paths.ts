/**
 * Páginas cujas ações de servidor passam pelo BotID (login, cadastro, códigos, recuperação).
 * As ações de servidor são enviadas por POST para o endereço da própria página; o BotID no
 * navegador só anexa os sinais nesses endereços. Uma página nova com essas ações precisa
 * entrar aqui — o teste bot-paths.test.ts confere isso.
 */
export const BOT_PROTECTED_PATHS = [
  "/*/entrar",
  "/*/entrar/verificar",
  "/*/entrar/recuperar",
  "/*/cadastro",
  "/*/profissional/cadastro",
  "/*/profissional/convite/*",
] as const;
