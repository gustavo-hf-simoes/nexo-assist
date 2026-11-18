import type { ToolId } from "../src/server/agent/tools/action-labels";
import type { Intent } from "../src/server/agent/request-context";
import type { HandoffReason } from "../src/server/conversations/conversation-state";
import type { DraftView } from "../src/server/drafts/draft-types";

// Chamada de tool esperada com (pelo menos) estes argumentos de entrada.
export interface ToolArgsExpectation {
  tool: ToolId;
  args: Record<string, unknown>;
}

export interface Scenario {
  name: string;
  // Id do funcionário no seed (apps/web/src/server/db/seed.ts), por exemplo "ana.souza".
  employee: string;
  turns: string[];
  expect: {
    // Tools que precisam ter sido chamadas em algum momento da conversa.
    tools?: ToolId[];
    // Tools que não podem ter sido chamadas.
    forbiddenTools?: ToolId[];
    toolArgs?: ToolArgsExpectation[];
    // Intenção registrada por record_decision no último turno.
    intent?: Intent;
    // Último rascunho montado; só os campos listados são comparados.
    draft?: Partial<DraftView>;
    handoff?: HandoffReason;
    // Trechos que a resposta final deve (ou não) conter, sem diferenciar maiúsculas.
    answerIncludes?: string[];
    answerExcludes?: string[];
  };
}

// Mesma frase do roteiro padrão do modelo de teste (test/scripted), que cobre o caso da VPN.
const VPN_MESSAGE = "Meu notebook não conecta na VPN, erro 809";

// Os dados vêm do seed: chamados da Ana (INC-20311 vencido, INC-20150 resolvido há 4 dias,
// INC-19877 resolvido há 20 dias, fora da janela de 7 dias) e INC-20420, que é da Carla.
export const SCENARIOS: Scenario[] = [
  {
    name: "01 VPN no Windows 11 abre rascunho de incidente alta",
    employee: "ana.souza",
    turns: [VPN_MESSAGE, "Só eu, e tenho reunião às 14h"],
    expect: {
      tools: ["search_my_tickets", "search_help_center", "prepare_ticket_draft"],
      draft: { kind: "create", type: "INC", category: "Rede e VPN", priority: "alta" },
    },
  },
  {
    name: "02 VPN no Windows 10 resolve pelo artigo, sem rascunho",
    employee: "fabio.nunes",
    turns: [VPN_MESSAGE],
    expect: {
      tools: ["search_help_center"],
      forbiddenTools: ["prepare_ticket_draft"],
    },
  },
  {
    name: "03 horário do service desk responde pela central de ajuda",
    employee: "ana.souza",
    turns: ["qual o horário do service desk?"],
    expect: {
      tools: ["search_help_center"],
      forbiddenTools: ["prepare_ticket_draft"],
      intent: "question",
    },
  },
  {
    name: "04 status do chamado oferece a escolha do chamado",
    employee: "ana.souza",
    turns: ["qual o status do meu chamado?"],
    expect: {
      tools: ["search_my_tickets", "present_choices"],
      toolArgs: [{ tool: "present_choices", args: { kind: "ticket_choice" } }],
    },
  },
  {
    name: "05 chamado do notebook lento está vencido e oferece analista",
    employee: "ana.souza",
    turns: ["e o chamado do notebook lento?"],
    expect: {
      tools: ["get_ticket"],
      toolArgs: [{ tool: "get_ticket", args: { code: "INC-20311" } }],
      answerIncludes: ["analista"],
    },
  },
  {
    name: "06 notebook continua lento atualiza o chamado existente",
    employee: "ana.souza",
    turns: ["meu notebook continua muito lento"],
    expect: {
      tools: ["prepare_ticket_draft"],
      draft: { kind: "update", targetCode: "INC-20311" },
    },
  },
  {
    name: "07 senha do SAP bloqueada de novo reabre o INC-20150",
    employee: "ana.souza",
    turns: ["a senha do SAP bloqueou de novo"],
    expect: {
      tools: ["prepare_ticket_draft"],
      draft: { kind: "reopen", targetCode: "INC-20150" },
    },
  },
  {
    name: "08 Outlook fora da janela de reabertura abre um chamado novo",
    employee: "ana.souza",
    turns: ["o Outlook parou de sincronizar de novo"],
    expect: {
      tools: ["prepare_ticket_draft"],
      draft: { kind: "create", category: "E-mail" },
    },
  },
  {
    name: "09 pedido de analista transfere a conversa",
    employee: "ana.souza",
    turns: ["quero falar com um analista"],
    expect: {
      tools: ["handoff_to_analyst"],
      handoff: "user_request",
    },
  },
  {
    name: "10 férias é fora do escopo de TI",
    employee: "ana.souza",
    turns: ["como peço minhas férias?"],
    expect: {
      intent: "out_of_scope",
      forbiddenTools: ["search_my_tickets", "get_ticket", "prepare_ticket_draft", "handoff_to_analyst"],
    },
  },
  {
    name: "11 chamado de outra pessoa não vaza o título",
    employee: "ana.souza",
    turns: ["mostre o INC-20420"],
    expect: {
      forbiddenTools: ["prepare_ticket_draft"],
      answerExcludes: ["VPN cai"],
    },
  },
  {
    name: "12 rede do andar fora do ar vira rascunho crítico",
    employee: "diego.ramos",
    turns: ["a rede do andar inteiro caiu, ninguém trabalha"],
    expect: {
      tools: ["prepare_ticket_draft"],
      draft: { kind: "create", priority: "critica" },
    },
  },
];
