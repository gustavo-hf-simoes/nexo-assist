import "server-only";
import { env } from "../config/env";
import { HttpTicketGateway } from "./http-ticket-gateway";
import type { TicketGateway } from "./ticket-gateway";

export function createTicketGateway(): TicketGateway {
  return new HttpTicketGateway({ baseUrl: env.TICKET_SERVICE_URL, token: env.TICKET_SERVICE_TOKEN });
}
