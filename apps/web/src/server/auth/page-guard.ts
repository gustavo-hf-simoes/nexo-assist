import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { requireAnalyst, requireEmployee } from "./guards";
import { SESSION_COOKIE, type SessionClaims } from "./session";

// O proxy só confere o JWT; aqui o banco decide (sessão revogada pelo logout não entra).
// Sem sessão válida, ou com o papel errado, volta para o login.
async function guardPage(require: (req: Request) => Promise<SessionClaims>): Promise<SessionClaims> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const request = new Request("http://localhost/", {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  });
  try {
    return await require(request);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) redirect("/login");
    throw error;
  }
}

// Guard para páginas do funcionário.
export const requireEmployeePage = cache(() => guardPage(requireEmployee));

// Guard para o console do analista.
export const requireAnalystPage = cache(() => guardPage(requireAnalyst));
