import { describe, expect, it } from "vitest";
import {
  createNexoRequestContext,
  getEmployeeId,
  getRecordedDecision,
} from "../../../src/server/agent/request-context";
import { actionLabelsFor } from "../../../src/server/agent/tools/action-labels";
import { buildTools } from "../../../src/server/agent/tools";
import { makeHarness, run } from "../../fakes/tool-fakes";

describe("request context", () => {
  it("getEmployeeId lança quando falta o funcionário", () => {
    const ctx = createNexoRequestContext({
      employeeId: "",
      conversationId: "c",
      sessionId: "s",
      profile: { name: "x", department: "y", deviceOs: null },
    });
    expect(() => getEmployeeId(ctx)).toThrow();
  });

  it("nenhuma tool aceita employeeId no inputSchema", () => {
    const { deps } = makeHarness();
    for (const tool of Object.values(buildTools(deps))) {
      const json = JSON.stringify(tool.inputSchema?.["~standard"].jsonSchema.input({ target: "draft-07" }));
      expect(json).not.toContain("employeeId");
    }
  });
});

describe("get_ticket", () => {
  it("chamado de outro usuário responde not_found sem vazar o conteúdo", async () => {
    const { deps, ctx } = makeHarness("ana.souza");
    const result = await run(buildTools(deps).get_ticket, { code: "INC-20420" }, ctx);
    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(JSON.stringify(result)).not.toContain("VPN cai");
  });

  it("devolve prazo, atraso, SLA e se pode reabrir", async () => {
    const { deps, ctx } = makeHarness();
    const result = (await run(buildTools(deps).get_ticket, { code: "INC-20311" }, ctx)) as Record<string, unknown>;
    expect(result).toMatchObject({ ok: true, slaLabel: "3 dias úteis", canReopen: false, overdue: true });
    expect(typeof result["dueAt"]).toBe("string");
  });
});

describe("search_my_tickets", () => {
  it("indisponibilidade do serviço vira tickets_unavailable", async () => {
    const { deps, ctx, gateway } = makeHarness();
    gateway.unavailable = true;
    await expect(run(buildTools(deps).search_my_tickets, {}, ctx)).resolves.toEqual({
      ok: false,
      error: "tickets_unavailable",
    });
  });

  it("lista só os abertos do funcionário, com dueAt e overdue", async () => {
    const { deps, ctx } = makeHarness();
    const result = (await run(buildTools(deps).search_my_tickets, { scope: "open" }, ctx)) as {
      tickets: Array<{ code: string; dueAt: string; overdue: boolean }>;
    };
    expect(result.tickets.map((t) => t.code).sort()).toEqual(["INC-20311", "REQ-10442"]);
    expect(result.tickets[0]).toHaveProperty("dueAt");
    expect(result.tickets[0]).toHaveProperty("overdue");
  });

  it("filtra pelo texto", async () => {
    const { deps, ctx } = makeHarness();
    const result = (await run(buildTools(deps).search_my_tickets, { scope: "all", text: "monitor" }, ctx)) as {
      tickets: Array<{ code: string }>;
    };
    expect(result.tickets.map((t) => t.code)).toEqual(["REQ-10442"]);
  });
});

describe("search_help_center, classify_priority, present_choices, record_decision", () => {
  it("search_help_center devolve os artigos", async () => {
    const { deps, ctx } = makeHarness();
    const result = (await run(buildTools(deps).search_help_center, { query: "vpn" }, ctx)) as {
      ok: boolean;
      articles: unknown[];
    };
    expect(result.ok).toBe(true);
    expect(result.articles).toHaveLength(1);
  });

  it("classify_priority usa o domínio", async () => {
    const { deps, ctx } = makeHarness();
    const result = await run(
      buildTools(deps).classify_priority,
      { type: "INC", impact: "company", blocksWork: true, sameDayDeadline: false },
      ctx,
    );
    expect(result).toMatchObject({ priority: "critica", slaLabel: "1 hora" });
  });

  it("present_choices exige 2 a 4 opções e devolve renderOnly", async () => {
    const { deps, ctx } = makeHarness();
    const tool = buildTools(deps).present_choices;
    const opt = (n: number) => ({ label: `L${n}`, value: `v${n}` });
    const ok = await run(tool, { question: "Qual?", kind: "quick_reply", options: [opt(1), opt(2)] }, ctx);
    expect(ok).toMatchObject({ renderOnly: true, question: "Qual?" });
    for (const options of [[opt(1)], [opt(1), opt(2), opt(3), opt(4), opt(5)]]) {
      const parsed = await tool.inputSchema?.["~standard"].validate({ question: "Qual?", kind: "quick_reply", options });
      expect(parsed && "issues" in parsed && parsed.issues).toBeTruthy();
    }
  });

  it("record_decision guarda a decisão no contexto e não toca em banco", async () => {
    const { deps, ctx } = makeHarness();
    const decision = {
      intent: "ticket_create",
      understanding: "Notebook lento",
      action: "abrir chamado",
      confidence: 0.9,
      rationale: "Sem solução na central",
    };
    await expect(run(buildTools(deps).record_decision, decision, ctx)).resolves.toEqual({ recorded: true });
    expect(getRecordedDecision(ctx)).toEqual(decision);
  });
});

describe("prepare_ticket_draft", () => {
  const base = {
    kind: "create",
    title: "Notebook muito lento",
    description: "Trava ao abrir o Excel.",
    type: "INC",
    category: "Hardware",
    impact: "individual",
    blocksWork: false,
    sameDayDeadline: false,
    affectedLabel: "Só você",
  } as const;

  it("suspeita de duplicado devolve os candidatos; com notDuplicateOf cria o rascunho", async () => {
    const { deps, ctx, drafts } = makeHarness();
    const tools = buildTools(deps);
    const first = (await run(tools.prepare_ticket_draft, base, ctx)) as {
      ok: boolean;
      error: string;
      candidates: Array<{ code: string }>;
    };
    expect(first).toMatchObject({ ok: false, error: "duplicate_suspected" });
    expect(first.candidates.map((c) => c.code)).toContain("INC-20311");
    expect(drafts.created).toHaveLength(0);

    const second = (await run(tools.prepare_ticket_draft, { ...base, notDuplicateOf: ["INC-20311"] }, ctx)) as {
      ok: boolean;
      draft: { displayCode: string; status: string };
    };
    expect(second.ok).toBe(true);
    expect(second.draft).toMatchObject({ displayCode: "D-381", status: "pending" });
    expect(drafts.created).toHaveLength(1);
  });

  it("recalcula a prioridade no servidor e não aceita priority no input", async () => {
    const { deps, ctx } = makeHarness();
    const tool = buildTools(deps).prepare_ticket_draft;
    const result = (await run(
      tool,
      { ...base, category: "Software", title: "Sistema fora do ar", impact: "team", blocksWork: true, priority: "baixa" },
      ctx,
    )) as { ok: boolean; draft: { priority: string; dueAt: string } };
    expect(result.ok).toBe(true);
    expect(result.draft.priority).toBe("critica");
    const json = JSON.stringify(tool.inputSchema?.["~standard"].jsonSchema.input({ target: "draft-07" }));
    expect(json).not.toContain('"priority"');
  });

  it("reabrir chamado resolvido há 20 dias responde reopen_window_expired", async () => {
    const { deps, ctx } = makeHarness();
    const result = await run(
      buildTools(deps).prepare_ticket_draft,
      { ...base, kind: "reopen", targetCode: "INC-19877" },
      ctx,
    );
    expect(result).toEqual({ ok: false, error: "reopen_window_expired" });
  });

  it("reabrir chamado dentro do prazo monta o rascunho", async () => {
    const { deps, ctx, drafts } = makeHarness();
    const result = (await run(
      buildTools(deps).prepare_ticket_draft,
      { ...base, kind: "reopen", targetCode: "INC-20150" },
      ctx,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(drafts.created[0]).toMatchObject({ kind: "reopen", targetTicketCode: "INC-20150" });
  });

  it("chamado alvo de outro usuário responde not_found", async () => {
    const { deps, ctx } = makeHarness();
    const result = await run(
      buildTools(deps).prepare_ticket_draft,
      { ...base, kind: "update", targetCode: "INC-20420" },
      ctx,
    );
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("serviço indisponível vira tickets_unavailable", async () => {
    const { deps, ctx, gateway } = makeHarness();
    gateway.unavailable = true;
    const result = await run(buildTools(deps).prepare_ticket_draft, base, ctx);
    expect(result).toEqual({ ok: false, error: "tickets_unavailable" });
  });
});

describe("handoff_to_analyst", () => {
  it("atraso transfere o chamado para a fila N2 e a conversa vai para waiting_analyst", async () => {
    const { deps, ctx, gateway, conversations } = makeHarness();
    const result = await run(
      buildTools(deps).handoff_to_analyst,
      { reason: "overdue", summary: "Chamado atrasado", ticketCode: "INC-20311" },
      ctx,
    );
    expect(result).toEqual({ ok: true, state: "waiting_analyst", queue: "N2", ticketTransferred: true });
    expect(gateway.transferCalls[0]).toMatchObject({ code: "INC-20311", input: { queue: "N2" } });
    expect(conversations.state).toBe("waiting_analyst");
  });

  it("pedido do usuário vai para N1", async () => {
    const { deps, ctx, gateway } = makeHarness();
    await run(
      buildTools(deps).handoff_to_analyst,
      { reason: "user_request", summary: "Quer falar", ticketCode: "INC-20311" },
      ctx,
    );
    expect(gateway.transferCalls[0]?.input.queue).toBe("N1");
  });

  it("sem ticketCode só transfere a conversa", async () => {
    const { deps, ctx, gateway, conversations } = makeHarness();
    const result = await run(
      buildTools(deps).handoff_to_analyst,
      { reason: "low_confidence", summary: "Não entendi" },
      ctx,
    );
    expect(result).toMatchObject({ ok: true, ticketTransferred: false });
    expect(gateway.transferCalls).toHaveLength(0);
    expect(conversations.state).toBe("waiting_analyst");
  });

  it("com o serviço de chamados indisponível transfere a conversa mesmo assim", async () => {
    const { deps, ctx, gateway, conversations } = makeHarness();
    gateway.unavailable = true;
    const result = await run(
      buildTools(deps).handoff_to_analyst,
      { reason: "overdue", summary: "Atrasado", ticketCode: "INC-20311" },
      ctx,
    );
    expect(result).toEqual({ ok: true, state: "waiting_analyst", queue: "N2", ticketTransferred: false });
    expect(conversations.state).toBe("waiting_analyst");
  });

  it("conversa que já foi transferida não transfere de novo", async () => {
    const { deps, ctx } = makeHarness();
    const tool = buildTools(deps).handoff_to_analyst;
    await run(tool, { reason: "user_request", summary: "a" }, ctx);
    await expect(run(tool, { reason: "user_request", summary: "b" }, ctx)).resolves.toEqual({
      ok: false,
      error: "already_transferred",
    });
  });
});

describe("action labels", () => {
  it("get_ticket gera dois chips com o código", () => {
    expect(actionLabelsFor("get_ticket", { code: "INC-20311" })).toEqual(["consultou o INC-20311", "calculou o prazo"]);
    expect(actionLabelsFor("present_choices")).toEqual([]);
    expect(actionLabelsFor("record_decision")).toEqual([]);
  });
});
