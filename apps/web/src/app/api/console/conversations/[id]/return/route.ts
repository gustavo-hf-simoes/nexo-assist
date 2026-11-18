import { handleConsoleRoute, runConsoleEvent, type ConsoleRouteContext } from "@/server/conversations/console-actions";

export async function POST(req: Request, ctx: ConsoleRouteContext): Promise<Response> {
  return handleConsoleRoute(req, ctx, (claims, id) => runConsoleEvent(id, claims.userId, () => ({ type: "return_to_agent" })));
}
