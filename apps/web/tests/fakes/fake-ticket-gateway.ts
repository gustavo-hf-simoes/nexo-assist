import {
  classifyPriority,
  isOpenStatus,
  type CreateTicketInput,
  type TicketDto,
  type TransferInput,
} from "@nexo/domain";
import { TicketNotFoundError, TicketServiceUnavailableError } from "../../src/server/tickets/ticket-errors";
import type { TicketGateway, TicketScope } from "../../src/server/tickets/ticket-gateway";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mesmos chamados do seed do serviço de chamados (services/tickets/src/seed.ts).
export function seedTickets(now: Date): TicketDto[] {
  const ago = (days: number): string => new Date(now.getTime() - days * DAY_MS).toISOString();
  const base = { affected: "individual", resolvedAt: null, lastSupportUpdateAt: null } as const;
  return [
    {
      ...base,
      code: "INC-20311",
      type: "INC",
      category: "Hardware",
      priority: "media",
      status: "aguardando_analista",
      title: "Notebook lento após atualização do Windows",
      description: "O notebook ficou muito lento depois da última atualização do Windows.",
      requesterId: "ana.souza",
      createdAt: ago(9),
      updatedAt: ago(6),
      lastSupportUpdateAt: ago(6),
    },
    {
      ...base,
      code: "REQ-10442",
      type: "REQ",
      category: "Hardware",
      priority: "baixa",
      status: "aprovado",
      title: "Segundo monitor para home office",
      description: "Solicito um segundo monitor para trabalhar em casa.",
      requesterId: "ana.souza",
      createdAt: ago(8),
      updatedAt: ago(7),
      lastSupportUpdateAt: ago(7),
    },
    {
      ...base,
      code: "INC-20150",
      type: "INC",
      category: "Acesso",
      priority: "media",
      status: "resolvido",
      title: "Senha do SAP bloqueada",
      description: "A senha do SAP foi bloqueada após tentativas de acesso.",
      requesterId: "ana.souza",
      createdAt: ago(6),
      updatedAt: ago(4),
      lastSupportUpdateAt: ago(4),
      resolvedAt: ago(4),
    },
    {
      ...base,
      code: "INC-19877",
      type: "INC",
      category: "E-mail",
      priority: "media",
      status: "resolvido",
      title: "Outlook não sincroniza no celular",
      description: "O Outlook parou de sincronizar os e-mails no celular.",
      requesterId: "ana.souza",
      createdAt: ago(25),
      updatedAt: ago(20),
      lastSupportUpdateAt: ago(20),
      resolvedAt: ago(20),
    },
    {
      ...base,
      code: "INC-20420",
      type: "INC",
      category: "Rede e VPN",
      priority: "alta",
      status: "aberto",
      title: "VPN cai a cada 10 minutos",
      description: "A conexão da VPN cai a cada 10 minutos.",
      requesterId: "carla.mendes",
      createdAt: ago(1),
      updatedAt: ago(1),
    },
  ];
}

export class FakeTicketGateway implements TicketGateway {
  tickets: TicketDto[];
  unavailable = false;
  failCreateWith: Error | null = null;
  createDelayMs = 0;
  readonly createCalls: Array<{ employeeId: string; input: CreateTicketInput; idempotencyKey: string }> = [];
  readonly commentCalls: Array<{ employeeId: string; code: string; body: string; idempotencyKey: string }> = [];
  readonly reopenCalls: Array<{ employeeId: string; code: string; idempotencyKey: string }> = [];
  readonly transferCalls: Array<{ employeeId: string; code: string; input: TransferInput; idempotencyKey: string }> =
    [];
  private readonly byKey = new Map<string, TicketDto>();
  private seq = 20520;

  constructor(now: Date = new Date()) {
    this.tickets = seedTickets(now);
  }

  private guard(): void {
    if (this.unavailable) throw new TicketServiceUnavailableError();
  }

  private find(employeeId: string, code: string): TicketDto {
    const found = this.tickets.find((t) => t.code === code && t.requesterId === employeeId);
    if (!found) throw new TicketNotFoundError();
    return found;
  }

  async listMine(employeeId: string, scope: TicketScope): Promise<TicketDto[]> {
    this.guard();
    return this.tickets.filter(
      (t) => t.requesterId === employeeId && (scope === "all" || isOpenStatus(t.status)),
    );
  }

  async getMine(employeeId: string, code: string): Promise<TicketDto | null> {
    this.guard();
    return this.tickets.find((t) => t.code === code && t.requesterId === employeeId) ?? null;
  }

  async create(employeeId: string, input: CreateTicketInput, idempotencyKey: string): Promise<TicketDto> {
    this.createCalls.push({ employeeId, input, idempotencyKey });
    this.guard();
    if (this.failCreateWith) throw this.failCreateWith;
    if (this.createDelayMs > 0) await new Promise((r) => setTimeout(r, this.createDelayMs));
    const existing = this.byKey.get(idempotencyKey);
    if (existing) return existing;
    const now = new Date().toISOString();
    const ticket: TicketDto = {
      code: `${input.type}-${(this.seq += 1)}`,
      type: input.type,
      category: input.category,
      priority: classifyPriority({
        type: input.type,
        impact: input.affected,
        blocksWork: input.blocksWork,
        sameDayDeadline: input.sameDayDeadline,
      }).priority,
      status: "aberto",
      title: input.title,
      description: input.description,
      affected: input.affected,
      requesterId: employeeId,
      createdAt: now,
      updatedAt: now,
      lastSupportUpdateAt: null,
      resolvedAt: null,
    };
    this.tickets.push(ticket);
    this.byKey.set(idempotencyKey, ticket);
    return ticket;
  }

  async addComment(employeeId: string, code: string, body: string, idempotencyKey: string): Promise<TicketDto> {
    this.guard();
    this.commentCalls.push({ employeeId, code, body, idempotencyKey });
    return this.find(employeeId, code);
  }

  async reopen(employeeId: string, code: string, idempotencyKey: string): Promise<TicketDto> {
    this.guard();
    this.reopenCalls.push({ employeeId, code, idempotencyKey });
    const ticket = this.find(employeeId, code);
    const reopened: TicketDto = { ...ticket, status: "aberto", resolvedAt: null };
    this.tickets = this.tickets.map((t) => (t.code === code ? reopened : t));
    return reopened;
  }

  async transfer(employeeId: string, code: string, input: TransferInput, idempotencyKey: string): Promise<TicketDto> {
    this.guard();
    this.transferCalls.push({ employeeId, code, input, idempotencyKey });
    return this.find(employeeId, code);
  }
}
