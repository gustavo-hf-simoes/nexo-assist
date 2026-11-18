import { randomUUID } from "node:crypto";
import { TicketDto, type CreateTicketInput, type TransferInput } from "@nexo/domain";
import { z } from "zod";
import type { TicketGateway, TicketScope } from "./ticket-gateway";
import {
  TicketConflictError,
  TicketNotFoundError,
  TicketRequestError,
  TicketServiceUnavailableError,
  type TicketConflictCode,
} from "./ticket-errors";

export interface HttpTicketGatewayOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  timeoutMs?: number;
}

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

const BACKOFF_BASE_MS = 200;
const ErrorPayload = z.object({ error: z.string() });
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function toConflictCode(error: string): TicketConflictCode | null {
  switch (error) {
    case "reopen_window_expired":
    case "not_resolved":
    case "idempotency_conflict":
      return error;
    default:
      return null;
  }
}

const ticketPath = (code: string): string => `/tickets/${encodeURIComponent(code)}`;

async function readErrorCode(res: Response): Promise<string> {
  try {
    const parsed = ErrorPayload.safeParse(await res.json());
    return parsed.success ? parsed.data.error : "";
  } catch {
    return "";
  }
}

async function parseJson<T>(
  res: Response,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new TicketRequestError("Resposta do serviço de chamados não é um JSON válido.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new TicketRequestError("Resposta do serviço de chamados fora do contrato.");
  }
  return parsed.data;
}

export class HttpTicketGateway implements TicketGateway {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly attempts: number;
  private readonly timeoutMs: number;

  constructor(options: HttpTicketGatewayOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.attempts = options.attempts ?? 3;
    this.timeoutMs = options.timeoutMs ?? 2000;
  }

  async listMine(employeeId: string, scope: TicketScope): Promise<TicketDto[]> {
    const res = await this.request({
      method: "GET",
      path: "/tickets",
      query: { requesterId: employeeId, scope },
    });
    return parseJson(res, z.array(TicketDto));
  }

  async getMine(employeeId: string, code: string): Promise<TicketDto | null> {
    try {
      const res = await this.request({
        method: "GET",
        path: ticketPath(code),
        query: { requesterId: employeeId },
      });
      return await parseJson(res, TicketDto);
    } catch (error) {
      if (error instanceof TicketNotFoundError) return null;
      throw error;
    }
  }

  async create(
    employeeId: string,
    input: CreateTicketInput,
    idempotencyKey: string,
  ): Promise<TicketDto> {
    const res = await this.request({
      method: "POST",
      path: "/tickets",
      body: { ...input, requesterId: employeeId },
      idempotencyKey,
    });
    return parseJson(res, TicketDto);
  }

  async addComment(
    employeeId: string,
    code: string,
    body: string,
    idempotencyKey: string,
  ): Promise<TicketDto> {
    const res = await this.request({
      method: "POST",
      path: `${ticketPath(code)}/comments`,
      body: { requesterId: employeeId, body },
      idempotencyKey,
    });
    return parseJson(res, TicketDto);
  }

  async reopen(employeeId: string, code: string): Promise<TicketDto> {
    const res = await this.request({
      method: "POST",
      path: `${ticketPath(code)}/reopen`,
      body: { requesterId: employeeId },
    });
    return parseJson(res, TicketDto);
  }

  async transfer(employeeId: string, code: string, input: TransferInput): Promise<TicketDto> {
    const res = await this.request({
      method: "POST",
      path: `${ticketPath(code)}/transfer`,
      body: { ...input, requesterId: employeeId },
      // Uma chave por chamada, reaproveitada nos retries: repetir não transfere duas vezes.
      idempotencyKey: randomUUID(),
    });
    return parseJson(res, TicketDto);
  }

  // Repete só falha de rede, timeout e 5xx; 4xx nunca é repetido.
  private async request(options: RequestOptions): Promise<Response> {
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      const res = await this.attemptOnce(options);
      if (res && res.status < 500) return this.ensureSuccess(res);
      if (attempt < this.attempts) await this.sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    }
    throw new TicketServiceUnavailableError();
  }

  private async attemptOnce(options: RequestOptions): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(this.buildUrl(options), {
        method: options.method,
        headers: this.buildHeaders(options),
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl({ path, query }: RequestOptions): string {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
    return `${this.baseUrl}${path}${qs}`;
  }

  private buildHeaders({ body, idempotencyKey }: RequestOptions): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    };
  }

  private async ensureSuccess(res: Response): Promise<Response> {
    if (res.ok) return res;
    if (res.status === 404) throw new TicketNotFoundError();
    if (res.status === 409) {
      const code = toConflictCode(await readErrorCode(res));
      if (code) throw new TicketConflictError(code);
    }
    throw new TicketRequestError(
      `O serviço de chamados recusou a requisição (${res.status}).`,
      res.status,
    );
  }
}
