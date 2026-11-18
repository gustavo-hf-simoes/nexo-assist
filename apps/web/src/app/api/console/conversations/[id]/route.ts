import { handleConsoleRoute, type ConsoleRouteContext } from "@/server/conversations/console-actions";
import { loadConsoleDetail } from "@/server/conversations/console-queries";
import { ConversationNotFoundError } from "@/server/conversations/errors";
import { getDb } from "@/server/db/app-db";
import { createTicketGateway } from "@/server/tickets/ticket-gateway-factory";

export async function GET(req: Request, ctx: ConsoleRouteContext): Promise<Response> {
  return handleConsoleRoute(req, ctx, async (_claims, id) => {
    const detail = await loadConsoleDetail(getDb(), createTicketGateway(), id);
    if (!detail) throw new ConversationNotFoundError();
    return Response.json(detail);
  });
}
