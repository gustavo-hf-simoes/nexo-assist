"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";

const ITEMS = [
  { href: "/atendimento", label: "Atendimento" },
  { href: "/perfil", label: "Meu perfil" },
] as const;

export function SidebarNav({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 py-5 font-serif text-xl font-semibold text-ink">Nexo Assist</div>
      <nav aria-label="Principal" className="flex flex-col gap-1 px-3">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-tint text-brand" : "text-ink-soft hover:bg-white"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3 border-t border-line p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={name} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={leaving}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-left text-sm font-medium text-ink-soft hover:bg-surface disabled:opacity-60"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
