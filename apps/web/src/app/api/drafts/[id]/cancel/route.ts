import { requireEmployee } from "@/server/auth/guards";
import { ConversationService } from "@/server/conversations/conversation-service";
import { getDb } from "@/server/db/app-db";
import { draftErrorResponse } from "@/server/drafts/draft-actions";
import { DraftService } from "@/server/drafts/draft-service";
import { toHttpError } from "@/server/errors";
import { createTicketGateway } from "@/server/tickets/ticket-gateway-factory";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let claims;
  try {
    claims = await requireEmployee(req);
  } catch (error) {
    return toHttpError(error);
  }
  const { id } = await ctx.params;
  try {
    const db = getDb();
    const drafts = new DraftService(db, createTicketGateway(), new ConversationService(db));
    await drafts.cancel(id, claims.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return draftErrorResponse(error) ?? toHttpError(error);
  }
}
