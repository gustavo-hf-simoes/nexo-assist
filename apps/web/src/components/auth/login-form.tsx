"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const FIELD_BOX =
  "flex h-11 items-center gap-2.5 rounded-lg bg-white pl-3.5 pr-2 shadow-[0_1px_2px_rgba(27,36,49,0.04)] outline outline-1 -outline-offset-[0.5px] outline-ink/[0.12] focus-within:outline-2 focus-within:outline-brand";
const INPUT =
  "min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-muted/70";

type LoginResponse = { redirectTo?: string; error?: string };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = (await res.json().catch(() => ({}))) as LoginResponse;
      if (res.ok && data.redirectTo) {
        router.push(data.redirectTo);
        return;
      }
      setError(data.error ?? "Não foi possível entrar. Tente de novo.");
    } catch {
      setError("Não foi possível entrar. Verifique a conexão e tente de novo.");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto flex w-full max-w-[380px] flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[40px]/[44px] font-normal tracking-[-0.8px] text-ink">Entrar</h2>
        <p className="text-[15.5px]/[23px] text-muted">
          Use seu e-mail corporativo e a senha da rede Nexo.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13.5px] font-medium text-ink">
          E-mail corporativo
        </label>
        <div className={FIELD_BOX}>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="ana.souza@nexo.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-[13.5px] font-medium text-ink">
            Senha
          </label>
          <span className="text-[13.5px] font-semibold text-brand-link">Esqueci minha senha</span>
        </div>
        <div className={FIELD_BOX}>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-muted hover:text-ink"
          >
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-[9px] pt-0.5 text-[13.5px] text-ink-soft">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="size-[18px] cursor-pointer rounded-md accent-brand"
        />
        Manter conectado neste computador
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13.5px] text-red-800"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-brand text-[15.5px] font-semibold text-white shadow-[0_1px_2px_rgba(0,98,196,0.2),0_6px_16px_rgba(0,98,196,0.15)] transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? "Entrando…" : "Entrar →"}
      </button>
    </form>
  );
}
