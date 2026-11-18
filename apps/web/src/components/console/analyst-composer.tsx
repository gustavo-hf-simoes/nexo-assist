"use client";

import { useState } from "react";
import { Composer } from "@/components/chat/composer";

export interface AnalystComposerProps {
  // Só habilita depois de assumir (conversa em `analyst` e do analista logado).
  enabled: boolean;
  disabledReason: string;
  onSend: (text: string) => Promise<boolean>;
}

export function AnalystComposer({ enabled, disabledReason, onSend }: AnalystComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      // Só limpa o campo se o envio deu certo; senão o analista não perde o texto.
      if (await onSend(text)) setValue("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white px-6 pb-4">
      <Composer
        value={value}
        onChange={setValue}
        onSend={() => void submit()}
        disabled={!enabled || sending}
        disabledReason={disabledReason}
        placeholder="Responda ao funcionário…"
      />
    </div>
  );
}
