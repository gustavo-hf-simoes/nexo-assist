import { z } from "zod";
import { requireAnalyst } from "@/server/auth/guards";
import { CONSOLE_FILTERS, listConsoleConversations } from "@/server/conversations/console-queries";
import { getDb } from "@/server/db/app-db";
import { toHttpError } from "@/server/errors";

const QuerySchema = z.object({
  filter: z.enum(CONSOLE_FILTERS).default("all"),
  q: z.string().max(100).default(""),
});

export async function GET(req: Request): Promise<Response> {
  let claims;
  try {
    claims = await requireAnalyst(req);
  } catch (error) {
    return toHttpError(error);
  }
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    filter: url.searchParams.get("filter") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "Filtro inválido." }, { status: 400 });
  try {
    return Response.json(await listConsoleConversations(getDb(), claims.userId, parsed.data.filter, parsed.data.q));
  } catch (error) {
    console.error("[api/console/conversations]", error instanceof Error ? error.message : "erro desconhecido");
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
