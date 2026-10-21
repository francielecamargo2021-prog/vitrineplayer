// Segundo fator do admin nos testes de navegador: configura o aplicativo autenticador
// lendo a chave mostrada para digitação manual, calcula o código TOTP (RFC 6238) e confirma.
import { createHmac } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s.toUpperCase()) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function totp(secret, at = Date.now()) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}

/** Abre /admin; se pedir o segundo fator, configura (primeira vez) ou só confirma o código. Devolve a chave. */
export async function adminSecondFactor(page, app, lang = "pt", secret = null) {
  await page.goto(`${app}/${lang}/admin`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("/entrar/segundo-fator")) return secret;
  const generate = page.locator('button:has-text("Gerar QR code")');
  if (await generate.count()) {
    await Promise.all([page.waitForLoadState("networkidle"), generate.click()]);
    await page.locator('[data-testid="mfa-chave"]').waitFor();
    secret = (await page.locator('[data-testid="mfa-chave"]').innerText()).trim();
  }
  if (!secret) throw new Error("segundo fator: chave desconhecida");
  await page.fill('input[name="code"]', totp(secret));
  await page.locator('main form button:has-text("Confirmar")').click();
  const codes = page.locator('[data-testid="codigos-recuperacao"]');
  await Promise.race([codes.waitFor({ timeout: 20000 }), page.waitForURL(new RegExp(`/${lang}/admin$`), { timeout: 20000 })]).catch(() => {});
  if (await codes.count()) {
    await Promise.all([page.waitForURL(new RegExp(`/${lang}/admin$`)), page.locator('button:has-text("ir para o admin")').click()]);
  }
  return secret;
}
