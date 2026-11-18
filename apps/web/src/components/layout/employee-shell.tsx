import { requireEmployeePage } from "@/server/auth/page-guard";
import { HeaderBar } from "./header-bar";
import { SidebarNav } from "./sidebar-nav";

// Server component: lê o cookie e valida a sessão no banco antes de renderizar qualquer tela do funcionário.
export async function EmployeeShell({ children }: { children: React.ReactNode }) {
  const session = await requireEmployeePage();
  return (
    <div className="flex h-screen">
      <SidebarNav name={session.name} email={session.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <HeaderBar />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
