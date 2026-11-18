import {
  canReopen,
  classifyPriority,
  computeDueAt,
  ImpactSchema,
  isOpenStatus,
  TicketCategorySchema,
  TicketTypeSchema,
  type TicketDto,
} from "@nexo/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { DraftPayload } from "../../drafts/draft-types";
import { TicketServiceUnavailableError } from "../../tickets/ticket-errors";
import { getConversationId, getEmployeeId } from "../request-context";
import { significantWords } from "./text";
import { nowOf, TICKETS_UNAVAILABLE, type ToolDeps } from "./tool-deps";

const MIN_SHARED_WORDS = 2;

// Abertos do mesmo tipo e da mesma categoria, ou com 2+ palavras significativas em comum no título.
function findDuplicateCandidates(
  open: TicketDto[],
  draft: { type: string; category: string; title: string },
  notDuplicateOf: readonly string[],
): TicketDto[] {
  const titleWords = significantWords(draft.title);
  return open.filter((t) => {
    if (notDuplicateOf.includes(t.code) || t.type !== draft.type) return false;
    if (t.category === draft.category) return true;
    const shared = significantWords(t.title).filter((w) => titleWords.includes(w));
    return shared.length >= MIN_SHARED_WORDS;
  });
}

export function prepareTicketDraftTool(deps: ToolDeps) {
  return createTool({
    id: "prepare_ticket_draft",
    description:
      "Monta o rascunho de um chamado (create), de um comentário em chamado existente (update) ou de uma reabertura (reopen) para o funcionário confirmar. A prioridade e o prazo são calculados pelo servidor. Nada é aberto antes da confirmação.",
    inputSchema: z.object({
      kind: z.enum(["create", "update", "reopen"]),
      targetCode: z.string().trim().min(1).optional(),
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1),
      type: TicketTypeSchema,
      category: TicketCategorySchema,
      impact: ImpactSchema,
      blocksWork: z.boolean(),
      sameDayDeadline: z.boolean(),
      affectedLabel: z.string().trim().min(1),
      notDuplicateOf: z.array(z.string()).optional(),
    }),
    execute: async (input, context) => {
      const employeeId = getEmployeeId(context.requestContext);
      const conversationId = getConversationId(context.requestContext);
      const now = nowOf(deps);
      try {
        let payload: DraftPayload;
        if (input.kind === "create") {
          const open = await deps.gateway.listMine(employeeId, "open");
          const candidates = findDuplicateCandidates(open, input, input.notDuplicateOf ?? []);
          if (candidates.length > 0) {
            return { ok: false as const, error: "duplicate_suspected" as const, candidates };
          }
          const { priority, reason } = classifyPriority(input);
          payload = {
            title: input.title,
            description: input.description,
            type: input.type,
            category: input.category,
            impact: input.impact,
            blocksWork: input.blocksWork,
            sameDayDeadline: input.sameDayDeadline,
            affectedLabel: input.affectedLabel,
            priority,
            priorityReason: reason,
            dueAt: computeDueAt(priority, now).toISOString(),
          };
        } else {
          const target = input.targetCode ? await deps.gateway.getMine(employeeId, input.targetCode) : null;
          if (!target) return { ok: false as const, error: "not_found" as const };
          if (input.kind === "reopen") {
            if (target.status !== "resolvido") return { ok: false as const, error: "not_resolved" as const };
            if (!canReopen(target, now)) return { ok: false as const, error: "reopen_window_expired" as const };
          } else if (!isOpenStatus(target.status)) {
            return { ok: false as const, error: "ticket_closed" as const };
          }
          // Atualização e reabertura mantêm o chamado como está; só o comentário vem do modelo.
          payload = {
            title: target.title,
            description: input.description,
            type: target.type,
            category: target.category,
            impact: target.affected,
            blocksWork: input.blocksWork,
            sameDayDeadline: input.sameDayDeadline,
            affectedLabel: input.affectedLabel,
            priority: target.priority,
            priorityReason: "Mantém a prioridade do chamado.",
            dueAt: computeDueAt(target.priority, now).toISOString(),
          };
        }
        const draft = await deps.drafts.createDraft({
          conversationId,
          employeeId,
          kind: input.kind,
          ...(input.targetCode ? { targetTicketCode: input.targetCode } : {}),
          payload,
        });
        return { ok: true as const, draft };
      } catch (error) {
        if (error instanceof TicketServiceUnavailableError) return TICKETS_UNAVAILABLE;
        throw error;
      }
    },
  });
}
