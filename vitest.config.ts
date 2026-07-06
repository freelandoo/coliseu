import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Testes de integração compartilham um único Postgres — rodar sequencial
    // evita corridas (IDs fixos, código sequencial, mutação de linhas semente).
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
