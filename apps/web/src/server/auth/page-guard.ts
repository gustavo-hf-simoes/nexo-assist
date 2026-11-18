import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { requireEmployee } from "./guards";
import { SESSION_COOKIE, type SessionClaims } from "./session";

// Guard para páginas do funcionário: o proxy só confere o JWT; aqui o banco decide
// (sessão revogada pelo logout não entra). Sem sessão válida, volta para o login.
export const requireEmployeePage = cache(async (): Promise<SessionClaims> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");
  const request = new Request("http://localhost/", {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  });
  try {
    return await requireEmployee(request);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) redirect("/login");
    throw error;
  }
});
