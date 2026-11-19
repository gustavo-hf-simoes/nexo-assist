import { AddCommentInput, CreateTicketInput, TransferInput } from "@nexo/domain";
import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { errorBody, InvalidRequest } from "./http-errors";
import type { TicketRepository } from "./ticket-repository";

const RequesterId = z.string().trim().min(1);
const ListQuery = z.object({
  requesterId: RequesterId,
  scope: z.enum(["open", "all"]).default("open"),
});
const GetQuery = z.object({ requesterId: RequesterId });
const WithRequester = z.object({ requesterId: RequesterId });
const CreateBody = CreateTicketInput.extend({ requesterId: RequesterId });
const CommentBody = AddCommentInput.extend({ requesterId: RequesterId });
const TransferBody = TransferInput.extend({ requesterId: RequesterId });

export interface RoutesDeps {
  repository: TicketRepository;
  now: () => Date;
}

function invalid(c: Context, message: string): Response {
  return c.json(errorBody("invalid_request", message), 400);
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ");
}

async function readBody<T>(c: Context, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new InvalidRequest("Corpo da requisição não é um JSON válido.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new InvalidRequest(describeIssues(parsed.error));
  return parsed.data;
}

function requireIdempotencyKey(c: Context): string {
  const key = c.req.header("Idempotency-Key")?.trim();
  if (!key) throw new InvalidRequest("O cabeçalho Idempotency-Key é obrigatório.");
  return key;
}

export function createRoutes({ repository, now }: RoutesDeps): Hono {
  const routes = new Hono();

  routes.get("/tickets", async (c) => {
    const query = ListQuery.safeParse(c.req.query());
    if (!query.success) return invalid(c, describeIssues(query.error));
    return c.json(await repository.listByRequester(query.data.requesterId, query.data.scope));
  });

  routes.get("/tickets/:code", async (c) => {
    const query = GetQuery.safeParse(c.req.query());
    if (!query.success) return invalid(c, describeIssues(query.error));
    const ticket = await repository.findByCode(c.req.param("code"), query.data.requesterId);
    if (!ticket) return c.json(errorBody("not_found", "Chamado não encontrado."), 404);
    return c.json(ticket);
  });

  routes.post("/tickets", async (c) => {
    const key = requireIdempotencyKey(c);
    const body = await readBody(c, CreateBody);
    const { ticket, replayed } = await repository.create(body, key);
    return c.json(ticket, replayed ? 200 : 201);
  });

  routes.post("/tickets/:code/comments", async (c) => {
    const key = requireIdempotencyKey(c);
    const { requesterId, body } = await readBody(c, CommentBody);
    return c.json(await repository.addComment(c.req.param("code"), requesterId, body, key));
  });

  routes.post("/tickets/:code/reopen", async (c) => {
    // Chave opcional: com ela, repetir a reabertura é um replay em vez de um 409 not_resolved.
    const key = c.req.header("Idempotency-Key")?.trim() || undefined;
    const { requesterId } = await readBody(c, WithRequester);
    return c.json(await repository.reopen(c.req.param("code"), requesterId, now(), key));
  });

  routes.post("/tickets/:code/transfer", async (c) => {
    // Sem a chave, cada chamada é tratada como uma transferência nova.
    const key = c.req.header("Idempotency-Key")?.trim() || randomUUID();
    const { requesterId, summary, queue } = await readBody(c, TransferBody);
    return c.json(
      await repository.transfer(c.req.param("code"), requesterId, { summary, queue }, key),
    );
  });

  return routes;
}
