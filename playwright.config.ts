import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de navegador (fluxos da recepção e do admin) contra o build de
 * produção local. Pré-requisitos: banco local com seed (`npm run db:seed`) e
 * `npx next build`. Rodar: `npm run e2e`.
 *
 * Sequencial: os fluxos mexem no mesmo banco que o Vitest usa.
 */
const PORTA = Number(process.env.E2E_PORTA ?? 3100);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 820 } }, testIgnore: /celular\.spec\.ts/ },
    { name: "celular", use: { ...devices["Pixel 7"] }, testMatch: /celular\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORTA}`,
    url: `http://localhost:${PORTA}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
