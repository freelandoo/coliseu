import { NextResponse, type NextRequest } from "next/server";

// /api/freelandoo tem autenticação própria (Bearer FREELANDOO_API_TOKEN,
// consumida server-to-server pela Freelandoo) — não passa por sessão.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/webhooks", "/api/agent", "/api/freelandoo"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/") return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const temSessao = Boolean(req.cookies.get("coliseu_session")?.value);
  if (!temSessao) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // sw.js/manifest/offline ficam fora da sessão: o navegador busca o
    // manifest sem cookie (mesmo logado) e o SW não aceita redirect.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|icons/|.*\\.png$).*)",
  ],
};
