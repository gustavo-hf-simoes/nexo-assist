import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { ShowcasePanel } from "@/components/auth/showcase-panel";

export const metadata: Metadata = { title: "Entrar · Nexo Assist" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-1 bg-white">
      <ShowcasePanel />
      <section className="flex flex-1 flex-col justify-between px-6 py-10 sm:px-14">
        <p className="flex items-center justify-end gap-1.5 text-[13.5px]">
          <span className="text-muted">Problema para entrar?</span>
          <span className="font-semibold text-brand-link">Ligue no ramal 4000</span>
        </p>
        <LoginForm />
        <footer className="flex items-center justify-between text-[12.5px] text-muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
