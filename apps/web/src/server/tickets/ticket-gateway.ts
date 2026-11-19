import type { CreateTicketInput, TicketDto, TransferInput } from "@nexo/domain";

export type TicketScope = "open" | "all";

// Porta para o serviço de chamados; o agent depende só desta interface.
export interface TicketGateway {
  listMine(employeeId: string, scope: TicketScope): Promise<TicketDto[]>;
  getMine(employeeId: string, code: string): Promise<TicketDto | null>;
  create(employeeId: string, input: CreateTicketInput, idempotencyKey: string): Promise<TicketDto>;
  addComment(
    employeeId: string,
    code: string,
    body: string,
    idempotencyKey: string,
  ): Promise<TicketDto>;
  reopen(employeeId: string, code: string, idempotencyKey: string): Promise<TicketDto>;
  transfer(employeeId: string, code: string, input: TransferInput, idempotencyKey: string): Promise<TicketDto>;
}
