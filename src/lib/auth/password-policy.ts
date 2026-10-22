import { COMMON_BASES, COMMON_FULL } from "./common-passwords.ts";

/**
 * Política de senhas (sem serviço externo): 10 a 128 caracteres, fora das senhas mais usadas
 * em vazamentos, sem ser só "palavra comum + números" e sem repetir o nome ou o e-mail.
 * Vale no cadastro (responsável, profissional, convite) e na troca de senha por código.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export type PasswordProblem = "password" | "passwordWeak";

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

/** Minúsculas, sem acentos e com as trocas comuns de letras por números (s3nh4 → senha). */
export function normalizePassword(p: string, one: "i" | "l" = "i") {
  return p
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => (c === "1" ? one : LEET[c] ?? c));
}

let full: Set<string> | null = null;
let bases: Set<string> | null = null;
const lists = () => {
  full ??= new Set(COMMON_FULL.split("\n"));
  bases ??= new Set(COMMON_BASES.split("\n"));
  return { full, bases };
};

/** Pedaços do nome e do e-mail com 4+ letras (ex.: "maria", "silva", "mariasilva"). */
function personalParts(email?: string, name?: string) {
  const local = (email ?? "").split("@")[0] ?? "";
  return [local, local.replace(/[^a-z]/gi, ""), ...local.split(/[^a-z]+/i), ...(name ?? "").split(/\s+/)]
    .map((s) => normalizePassword(s).replace(/[^a-z]/g, ""))
    .filter((s) => s.length >= 4);
}

/** null quando a senha pode ser usada; senão, o motivo (a mensagem é genérica para a pessoa). */
export function checkPassword(password: string, who: { email?: string; name?: string } = {}): PasswordProblem | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return "password";
  const { full, bases } = lists();
  const lower = password.toLowerCase();
  const norm = normalizePassword(password);
  const normL = normalizePassword(password, "l"); // "1" também vale por "l" (pa1meiras)
  if (full.has(lower) || full.has(norm) || full.has(normL)) return "passwordWeak";
  if (new Set(lower).size <= 3) return "passwordWeak"; // aaaaaaaaaa, 1212121212
  // palavra comum com poucos números ou símbolos antes/depois (flamengo2024, @senha12345)
  const m = /^[^a-z\u00c0-\u024f]{0,6}(.*?)[^a-z\u00c0-\u024f]{0,6}$/i.exec(password);
  const core = normalizePassword(m?.[1] ?? "").replace(/[^a-z]/g, "");
  const coreL = normalizePassword(m?.[1] ?? "", "l").replace(/[^a-z]/g, "");
  if (core.length >= 4 && [core, coreL].some((c) => bases.has(c) || full.has(c))) return "passwordWeak";
  // repetição (senhasenha) e sequências (abcdefghij, 0123456789)
  if (/^(.{1,5}?)\1+$/.test(norm.replace(/[^a-z]/g, "")) || /^(.{1,5}?)\1+$/.test(lower)) return "passwordWeak";
  if (isSequence(lower)) return "passwordWeak";
  // o nome ou o e-mail da pessoa, com ou sem números
  const flat = norm.replace(/[^a-z]/g, "");
  if (personalParts(who.email, who.name).some((part) => flat === part || core === part || (flat.length - part.length <= 4 && flat.includes(part)))) return "passwordWeak";
  return null;
}

function isSequence(s: string) {
  const rows = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const d = s.replace(/[^a-z0-9]/g, "");
  if (d.length < PASSWORD_MIN - 2) return false;
  return rows.some((r) => {
    const twice = r + r;
    const rev = [...twice].reverse().join("");
    return twice.includes(d) || rev.includes(d);
  });
}
