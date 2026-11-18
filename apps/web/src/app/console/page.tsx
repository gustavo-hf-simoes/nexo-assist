import { Suspense } from "react";
import { ConsoleView } from "@/components/console/console-view";
import { requireAnalystPage } from "@/server/auth/page-guard";

export const metadata = { title: "Console · Nexo Assist" };

// A leitura do cookie (guard) precisa ficar dentro de um Suspense por causa do cacheComponents.
async function GuardedConsole() {
  const claims = await requireAnalystPage();
  return <ConsoleView analystId={claims.userId} analystName={claims.name} />;
}

export default function ConsolePage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Carregando…</div>}>
      <GuardedConsole />
    </Suspense>
  );
}
