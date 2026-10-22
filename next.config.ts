import type { NextConfig } from "next";

const env = process.env.VP_ENV ?? "";
const isDev = process.env.NODE_ENV === "development";

/**
 * Trava do build: em homologação/produção, faltar uma variável do servidor derruba o
 * build em vez de publicar um site com "backend não configurado". (Só os NOMES são
 * conferidos; nenhum valor é exibido.)
 */
const REQUIRED = ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET", "NEON_DATA_API_URL", "BLOB_READ_WRITE_TOKEN", "ADMIN_MFA_KEY"];
if (env === "homolog" || env === "production") {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if ((process.env.NEON_AUTH_COOKIE_SECRET ?? "").length < 32) missing.push("NEON_AUTH_COOKIE_SECRET (32+ caracteres)");
  if (Buffer.from(process.env.ADMIN_MFA_KEY ?? "", "base64url").length !== 32) missing.push("ADMIN_MFA_KEY (32 bytes em base64url)");
  if (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("variáveis antigas do Supabase devem ser removidas");
  if (missing.length) throw new Error(`VP_ENV=${env}: configuração incompleta — ${[...new Set(missing)].join(", ")}`);
}

/** Só o ambiente de produção pode ser indexado por buscadores (o mesmo vale em src/lib/seo.ts). */
const indexable = env === "production";

/**
 * Política de conteúdo sem nonces (o site usa páginas estáticas e dinâmicas).
 * Imagens externas: só miniaturas do YouTube. Fotos dos atletas vêm do próprio site (/api/fotos).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://i.ytimg.com",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // sem upgrade-insecure-requests: a Vercel já força HTTPS (e o HSTS abaixo mantém)
].join("; ");

const security = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(indexable ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }]),
];

/**
 * BotID Basic (E3): só existe publicado na Vercel, que define VERCEL=1 no build e na execução.
 * Fora dela o navegador não carrega o BotID e o servidor não o consulta (ver src/lib/auth/bot-gate.ts).
 */
const botId = process.env.VERCEL === "1";
if (env === "production" && !botId) console.warn("Aviso: build de produção fora da Vercel — o BotID fica desligado.");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_VP_BOTID: botId ? "1" : "" },
  async headers() {
    return [{ source: "/:path*", headers: security }];
  },
};

export default nextConfig;
