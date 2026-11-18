import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 'server-only' lança fora do bundler do Next; nos testes vira um módulo vazio.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  esbuild: { jsx: "automatic" },
  test: {
    // Testes de componente pedem jsdom com um docblock `// @vitest-environment jsdom` no arquivo.
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["tests/**/*.int.test.ts", "node_modules/**"],
    setupFiles: ["tests/setup-dom.ts"],
    passWithNoTests: true,
  },
});
