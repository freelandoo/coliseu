// Mede, por tela, o JavaScript baixado e o tempo até a tela ficar pronta.
// Uso: node e2e/medir.mjs [baseURL] [rotas...]   (precisa do servidor no ar)
// Sai em JSON para colar no relatório de cada etapa (docs/.../melhorias-paginas).
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const rotas = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["/painel", "/atendimento", "/matriculados", "/matriculados/renovar", "/captacao", "/aula-experimental", "/cobranca", "/relatorios", "/acesso"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const page = await ctx.newPage();
await page.goto(`${base}/login`);
await page.getByLabel("Login ou e-mail").fill("admin");
await page.getByLabel("Senha", { exact: true }).fill("coliseu123");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"));

const resultado = {};
for (const rota of rotas) {
  // Duas passadas: a 1ª aquece o servidor; vale a 2ª, com cache do navegador limpo.
  for (let passada = 0; passada < 2; passada++) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.clearBrowserCache");
    let js = 0;
    const ouvir = async (resp) => {
      if (resp.request().resourceType() !== "script") return;
      const corpo = await resp.body().catch(() => null);
      if (corpo) js += corpo.length;
    };
    page.on("response", ouvir);
    const t0 = Date.now();
    await page.goto(base + rota, { waitUntil: "load" });
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    const ms = Date.now() - t0;
    await page.waitForLoadState("networkidle").catch(() => {});
    page.off("response", ouvir);
    if (passada === 1) resultado[rota] = { jsKB: Math.round(js / 1024), prontaMs: ms };
  }
}
console.log(JSON.stringify(resultado, null, 1));
await browser.close();
