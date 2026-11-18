import type { ClassifiedChatError } from "./chat-errors";

export function ErrorBanner({ error, onRetry, onDismiss }: { error: ClassifiedChatError; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
      <p>{error.message}</p>
      <div className="flex shrink-0 items-center gap-3">
        {error.retry && onRetry ? (
          <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
            Tentar de novo
          </button>
        ) : null}
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label="Fechar aviso" className="font-semibold">
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
