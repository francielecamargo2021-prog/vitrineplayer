import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale } from "@/i18n/config";
import { refreshSession } from "@/lib/supabase/session";

const authed = /^\/(pt|es)\/(painel|entrar|cadastro)(\/|$)/;

/**
 * Redireciona rotas sem prefixo de idioma para /pt ou /es (Accept-Language) e
 * renova a sessão nas áreas autenticadas. A autorização real fica no banco (RLS)
 * e é verificada de novo em cada página/Server Action.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (hasLocale(first)) {
    return authed.test(pathname) ? refreshSession(request, NextResponse.next({ request })) : undefined;
  }

  const accept = request.headers.get("accept-language")?.toLowerCase() ?? "";
  const locale = accept.startsWith("es") ? "es" : defaultLocale;
  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ["/((?!_next|media|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};
