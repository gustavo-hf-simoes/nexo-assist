import { z } from "zod";
import { handleConsoleRoute, type ConsoleRouteContext } from "@/server/conversations/console-actions";
import { ConversationService } from "@/server/conversations/conversation-service";
import { getDb } from "@/server/db/app-db";

const BodySchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

// 409 se a conversa não está em `analyst` (ex.: ainda aguardando, devolvida ou encerrada); 403 se é de outro analista.
export async function POST(req: Request, ctx: ConsoleRouteContext): Promise<Response> {
  return handleConsoleRoute(req, ctx, async (claims, id) => {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Envie uma mensagem de 1 a 2000 caracteres." }, { status: 400 });
    const messageId = await new ConversationService(getDb()).appendAnalystMessage(id, claims.userId, parsed.data.text);
    return Response.json({ id: messageId }, { status: 201 });
  });
}
