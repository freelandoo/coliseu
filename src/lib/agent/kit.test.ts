import { describe, expect, it } from "vitest";
import { preencherEnvKit } from "./kit";

const TEMPLATE = [
  "# Coliseu Agent - configuracao (.env)",
  "ADAPTER=controlid",
  "",
  "# URL do CRM na nuvem (sem barra no final).",
  "BACKEND_URL=",
  "AGENT_TOKEN=",
  "DEVICE_ID=",
  "IDFACE_HOST=",
  "IDFACE_USER=admin",
  "# IDFACE_RULE_ID=1",
  "",
].join("\r\n");

describe("preencherEnvKit", () => {
  const valores = {
    backendUrl: "https://crm.coliseu.com.br",
    agentToken: "tok_abc123",
    deviceId: "dev_xyz",
  };

  it("preenche BACKEND_URL, AGENT_TOKEN e DEVICE_ID", () => {
    const out = preencherEnvKit(TEMPLATE, valores);
    expect(out).toContain("BACKEND_URL=https://crm.coliseu.com.br\r\n");
    expect(out).toContain("AGENT_TOKEN=tok_abc123\r\n");
    expect(out).toContain("DEVICE_ID=dev_xyz\r\n");
  });

  it("não mexe nas demais chaves, comentários e CRLF", () => {
    const out = preencherEnvKit(TEMPLATE, valores);
    expect(out).toContain("ADAPTER=controlid\r\n");
    expect(out).toContain("IDFACE_HOST=\r\n");
    expect(out).toContain("IDFACE_USER=admin\r\n");
    expect(out).toContain("# IDFACE_RULE_ID=1\r\n");
    expect(out.startsWith("# Coliseu Agent")).toBe(true);
    // nenhum \n órfão (sem \r antes)
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("sobrescreve valores já preenchidos (re-download após rotação)", () => {
    const preenchido = preencherEnvKit(TEMPLATE, valores);
    const out = preencherEnvKit(preenchido, { ...valores, agentToken: "tok_novo" });
    expect(out).toContain("AGENT_TOKEN=tok_novo\r\n");
    expect(out).not.toContain("tok_abc123");
  });
});
