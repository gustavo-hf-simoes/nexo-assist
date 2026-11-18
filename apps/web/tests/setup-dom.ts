import { afterEach } from "vitest";

// Só os testes de componente (jsdom) usam Testing Library; nos de Node este setup não faz nada.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  await import("@testing-library/jest-dom/vitest");
  afterEach(() => cleanup());
}
