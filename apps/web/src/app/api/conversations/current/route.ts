import { requireEmployee } from "@/server/auth/guards";
import { env } from "@/server/config/env";
import { ConversationService } from "@/server/conversations/conversation-service";
import { MessageQuota } from "@/server/conversations/message-quota";
import { toUiMessage } from "@/server/conversations/ui-messages";
import { getDb } from "@/server/db/app-db";
import { DraftService } from "@/server/drafts/draft-service";
import { toHttpError } from "@/server/errors";
import { createTicketGateway } from "@/server/tickets/ticket-gateway-factory";

export async function GET(req: Request): Promise<Response> {
  let claims;
  try {
    claims = await requireEmployee(req);
  } catch (error) {
    return toHttpError(error);
  }
  try {
    const db = getDb();
    const conversations = new ConversationService(db);
    const conversation = await conversations.getOrCreateCurrent(claims.userId);
    const [rows, quota, drafts] = await Promise.all([
      conversations.listMessages(conversation.id),
      new MessageQuota(db, env.SESSION_MESSAGE_LIMIT).peek(claims.sid),
      new DraftService(db, createTicketGateway(), conversations).listForConversation(conversation.id, claims.userId),
    ]);
    return Response.json({
      conversation: { id: conversation.id, state: conversation.state, handoffReason: conversation.handoffReason },
      messages: rows.map(toUiMessage),
      quota,
      drafts,
    });
  } catch (error) {
    console.error("[api/conversations/current]", error instanceof Error ? error.message : "erro desconhecido");
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
