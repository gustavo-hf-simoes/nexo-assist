import { z } from "zod";
import {
  IMPACTS,
  PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_TYPES,
} from "./enums";

export const TicketTypeSchema = z.enum(TICKET_TYPES);
export const TicketCategorySchema = z.enum(TICKET_CATEGORIES);
export const PrioritySchema = z.enum(PRIORITIES);
export const TicketStatusSchema = z.enum(TICKET_STATUSES);
export const ImpactSchema = z.enum(IMPACTS);

const titleSchema = z.string().trim().min(1).max(120);

export const TicketDto = z.object({
  code: z.string(),
  type: TicketTypeSchema,
  category: TicketCategorySchema,
  priority: PrioritySchema,
  status: TicketStatusSchema,
  title: z.string(),
  description: z.string(),
  affected: ImpactSchema,
  requesterId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastSupportUpdateAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
});
export type TicketDto = z.infer<typeof TicketDto>;

// A prioridade é calculada no servidor por classifyPriority; não vem do cliente.
export const CreateTicketInput = z.object({
  title: titleSchema,
  description: z.string().trim().min(1),
  type: TicketTypeSchema,
  category: TicketCategorySchema,
  affected: ImpactSchema,
  blocksWork: z.boolean(),
  sameDayDeadline: z.boolean(),
});
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;

export const AddCommentInput = z.object({
  body: z.string().trim().min(1),
});
export type AddCommentInput = z.infer<typeof AddCommentInput>;

export const TransferInput = z.object({
  summary: z.string().trim().min(1),
  queue: z.enum(["N1", "N2"]),
});
export type TransferInput = z.infer<typeof TransferInput>;
