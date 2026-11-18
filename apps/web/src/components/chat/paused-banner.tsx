import type { ConversationState } from "@nexo/domain";

export function PausedBanner({ state, reason }: { state: ConversationState; reason?: string | null }) {
  if (state !== "waiting_analyst" && state !== "analyst") return null;
  const waiting = state === "waiting_analyst";
  return (
    <div role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn-ink">
      <p className="font-semibold">{waiting ? "Um analista vai falar com você" : "Analista atendendo"}</p>
      <p className="mt-0.5 text-[13px]">
        {waiting
          ? "O assistente pausou as respostas até um analista assumir a conversa."
          : "Um analista está acompanhando esta conversa. O assistente não responde nesse período."}
        {reason ? ` Motivo: ${reason}` : ""}
      </p>
    </div>
  );
}
