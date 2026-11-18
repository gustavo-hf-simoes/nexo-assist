"use client";

import { usePathname } from "next/navigation";
import { AssistantStatus } from "./assistant-status";

export function HeaderBar() {
  const pathname = usePathname();
  const page = pathname.startsWith("/perfil") ? "Meu perfil" : "Atendimento";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-6">
      <nav aria-label="Você está em" className="text-sm text-muted">
        Service desk de TI <span aria-hidden>›</span> <span className="font-medium text-ink">{page}</span>
      </nav>
      <AssistantStatus />
    </header>
  );
}
