import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/server/auth/session";

const homeFor = (role: "employee" | "analyst"): string =>
  role === "analyst" ? "/console" : "/atendimento";

// Next 16: "proxy" é o antigo middleware. As rotas /api/* ficam de fora: cada handler usa os
// guards (401/403 em JSON) em vez de redirecionar.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const claims = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!claims) {
    return pathname === "/login" ? NextResponse.next() : redirectTo("/login");
  }
  const home = homeFor(claims.role);
  if (pathname === "/" || pathname === "/login") return redirectTo(home);
  if (pathname.startsWith("/console") && claims.role !== "analyst") return redirectTo(home);
  if ((pathname.startsWith("/atendimento") || pathname.startsWith("/perfil")) && claims.role !== "employee") {
    return redirectTo(home);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/atendimento/:path*", "/perfil/:path*", "/console/:path*"],
};
