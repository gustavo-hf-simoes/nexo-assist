import { Suspense } from "react";
import { EmployeeShell } from "@/components/layout/employee-shell";

// A leitura do cookie (guard) precisa ficar dentro de um Suspense por causa do cacheComponents.
export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Carregando…</div>}>
      <EmployeeShell>{children}</EmployeeShell>
    </Suspense>
  );
}
