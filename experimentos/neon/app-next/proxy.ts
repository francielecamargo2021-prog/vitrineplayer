import { auth } from "@/lib/auth";
export default auth.middleware({ loginUrl: "/entrar" });
export const config = { matcher: ["/painel/:path*"] };
