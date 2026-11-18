import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { requireEmployeePage } from "@/server/auth/page-guard";

export const metadata = { title: "Atendimento · Nexo Assist" };

async function GuardedChat() {
  await requireEmployeePage();
  return <ChatView />;
}

export default function AtendimentoPage() {
  return (
    <Suspense fallback={null}>
      <GuardedChat />
    </Suspense>
  );
}
