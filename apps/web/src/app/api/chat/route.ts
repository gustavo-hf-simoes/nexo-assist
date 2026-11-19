import { after } from "next/server";
import { z } from "zod";
import { runTurn } from "@/server/agent/run-turn";
import { requireEmployee } from "@/server/auth/guards";
import { toHttpError } from "@/server/errors";

// O cliente manda só o texto; o histórico vem sempre do servidor. Campos extras são rejeitados.
const BodySchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

export async function POST(req: Request): Promise<Response> {
  let claims;
  try {
    claims = await requireEmployee(req);
  } catch (error) {
    return toHttpError(error);
  }
  const body: unknown = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Envie uma mensagem de 1 a 2000 caracteres." }, { status: 400 });
  }
  try {
    const result = await runTurn({ session: claims, text: parsed.data.text });
    switch (result.kind) {
      case "stream":
        // Em serverless, mantém a função viva até o turno gravar, mesmo se o cliente desconectar.
        after(() => result.done);
        return result.response;
      case "paused":
        return Response.json({ state: result.state }, { status: 409 });
      case "quota_exceeded":
        return Response.json({ error: "quota_exceeded", used: result.used, limit: result.limit }, { status: 429 });
      case "daily_limit":
        return Response.json({ error: "daily_limit" }, { status: 429 });
    }
  } catch (error) {
    console.error("[api/chat]", error instanceof Error ? error.message : "erro desconhecido");
    return Response.json(
      { error: "Não consegui processar sua mensagem agora. Tente novamente em instantes." },
      { status: 500 },
    );
  }
}
