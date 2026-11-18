import { requireEmployee } from "@/server/auth/guards";
import { env } from "@/server/config/env";
import { toHttpError } from "@/server/errors";
import { checkTicketsHealth } from "@/server/tickets/ticket-health";

export async function GET(req: Request): Promise<Response> {
  try {
    await requireEmployee(req);
  } catch (error) {
    return toHttpError(error);
  }
  return Response.json(await checkTicketsHealth(fetch, env.TICKET_SERVICE_URL), {
    headers: { "cache-control": "no-store" },
  });
}
