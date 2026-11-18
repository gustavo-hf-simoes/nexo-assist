"use client";

import { useEffect, useState } from "react";

type Health = "checking" | "online" | "degraded";

const POLL_MS = 30_000;

export function AssistantStatus() {
  const [health, setHealth] = useState<Health>("checking");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch("/api/health/tickets", { cache: "no-store" });
        const body = (await response.json()) as { status?: string };
        if (!cancelled) setHealth(response.ok && body.status === "online" ? "online" : "degraded");
      } catch {
        if (!cancelled) setHealth("degraded");
      }
    }
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const online = health === "online";
  const label = health === "checking" ? "Verificando…" : online ? "Assistente online" : "Assistente com instabilidade";
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        online ? "bg-ok/10 text-ok-ink" : health === "checking" ? "bg-surface text-muted" : "bg-warn/15 text-warn-ink"
      }`}
    >
      <span aria-hidden className={`size-2 rounded-full ${online ? "bg-ok" : health === "checking" ? "bg-muted" : "bg-warn"}`} />
      {label}
    </span>
  );
}
