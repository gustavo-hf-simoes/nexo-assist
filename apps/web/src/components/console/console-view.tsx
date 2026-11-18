"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConsoleDetail, ConsoleFilter, ConsoleList } from "@/server/conversations/console-queries";
import { AnalystComposer } from "./analyst-composer";
import { ConversationFilters } from "./conversation-filters";
import { ConversationHeader } from "./conversation-header";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";
import { EmployeeTicketsPanel } from "./employee-tickets-panel";
import { Rail } from "./rail";
import { TakeoverBar } from "./takeover-bar";
import { usePolledResource } from "./use-polled-resource";

export interface ConsoleViewProps {
  analystId: string;
  analystName: string;
}

type Action = "assume" | "return" | "close";

async function errorTextOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error !== "" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export function ConsoleView({ analystId, analystName }: ConsoleViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const term = query.trim();
  const listUrl = `/api/console/conversations?filter=${filter}${term ? `&q=${encodeURIComponent(term)}` : ""}`;
  const list = usePolledResource<ConsoleList>(listUrl);
  const detail = usePolledResource<ConsoleDetail>(selectedId ? `/api/console/conversations/${selectedId}` : null);

  async function post(path: string, body?: unknown): Promise<Response> {
    return fetch(`/api/console/conversations/${selectedId}/${path}`, {
      method: "POST",
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  }

  async function run(action: Action) {
    if (!selectedId || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await post(action);
      if (!response.ok) setActionError(await errorTextOf(response, "Não foi possível concluir a ação."));
    } catch {
      setActionError("Não foi possível concluir a ação. Verifique a conexão.");
    } finally {
      setBusy(false);
      await Promise.all([detail.reload(), list.reload()]);
    }
  }

  async function send(text: string): Promise<boolean> {
    setActionError(null);
    try {
      const response = await post("messages", { text });
      if (!response.ok) {
        setActionError(await errorTextOf(response, "Não foi possível enviar a mensagem."));
        return false;
      }
      await Promise.all([detail.reload(), list.reload()]);
      return true;
    } catch {
      setActionError("Não foi possível enviar a mensagem. Verifique a conexão.");
      return false;
    }
  }

  async function logout() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  function select(id: string) {
    setActionError(null);
    setSelectedId(id);
  }

  const data = detail.data;
  const firstName = data?.employee.name.split(" ")[0] ?? "";
  const mine = data?.conversation.assignedAnalystId === analystId;
  const canReply = data?.conversation.state === "analyst" && mine;

  return (
    <div className="flex h-dvh w-full bg-white">
      <Rail name={analystName} waitingCount={list.data?.counts.for_you ?? 0} onLogout={() => void logout()} leaving={leaving} />
      <section aria-label="Lista de conversas" className="flex h-full w-[360px] shrink-0 flex-col border-r border-line bg-white">
        <div className="flex flex-col gap-3 px-4 pb-3 pt-5">
          <h1 className="text-[22px] font-semibold text-ink">Conversas</h1>
          <input
            type="search"
            aria-label="Buscar conversas"
            placeholder="Buscar por nome ou mensagem"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand"
          />
          <ConversationFilters value={filter} counts={list.data?.counts ?? null} onChange={setFilter} />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <ConversationList
            items={list.data?.conversations ?? null}
            loading={list.loading}
            error={list.error}
            selectedId={selectedId}
            onSelect={select}
            onRetry={() => void list.reload()}
            searching={term !== ""}
          />
        </div>
      </section>

      <main className="flex h-full min-w-0 flex-1">
        {selectedId === null ? (
          <p className="m-auto text-sm text-muted">Selecione uma conversa para começar.</p>
        ) : detail.loading ? (
          <p role="status" className="m-auto text-sm text-muted">
            Carregando conversa…
          </p>
        ) : !data ? (
          <div role="alert" className="m-auto text-center text-sm text-ink-soft">
            <p>Não consegui carregar a conversa.</p>
            <button type="button" onClick={() => void detail.reload()} className="mt-2 font-medium text-brand hover:underline">
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-col">
              <ConversationHeader employee={data.employee} state={data.conversation.state} linkedTicketCode={data.handoff.linkedTicketCode} />
              <ConversationThread detail={data} />
              <TakeoverBar
                state={data.conversation.state}
                employeeFirstName={firstName}
                assignedAnalystName={data.conversation.assignedAnalystName}
                mine={mine}
                busy={busy}
                error={actionError}
                onAssume={() => void run("assume")}
                onReturn={() => void run("return")}
                onClose={() => void run("close")}
              />
              <AnalystComposer enabled={canReply} disabledReason="Assuma o atendimento para responder" onSend={send} />
            </div>
            <EmployeeTicketsPanel
              employeeFirstName={firstName}
              tickets={data.tickets}
              error={data.ticketsError}
              linkedTicketCode={data.handoff.linkedTicketCode}
            />
          </>
        )}
      </main>
    </div>
  );
}
