import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { defaultLocale, hasLocale } from "@/i18n/config";
import { getAuth } from "@/lib/auth/server";

const protectedArea = /^\/(pt|es)\/(painel|admin)(\/|$)/;

/**
 * 1. Rotas sem prefixo de idioma vão para /pt ou /es (Accept-Language).
 * 2. /painel e /admin exigem sessão do Neon Auth (sem sessão → /{idioma}/entrar) e
 *    renovam o cookie da sessão quando necessário.
 * É só a primeira barreira: cada página e cada ação conferem a sessão de novo, e o
 * banco aplica a RLS em todas as consultas.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (hasLocale(first)) {
    if (!protectedArea.test(pathname)) return undefined;
    const auth = getAuth();
    if (!auth) return undefined; // backend não configurado: a página mostra o aviso
    return auth.middleware({ loginUrl: `/${first}/entrar` })(request);
  }

  const accept = request.headers.get("accept-language")?.toLowerCase() ?? "";
  const locale = accept.startsWith("es") ? "es" : defaultLocale;
  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!_next|media|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
