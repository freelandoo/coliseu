/**
 * Valida as variáveis de ambiente do agente. Retorna a lista de campos faltantes
 * (vazia = ok). Usada pelo boot do agente (--check) e pelo install.bat do kit.
 */
export function checkEnv(env: Record<string, string | undefined>): string[] {
  const missing: string[] = [];
  if (!env.DEVICE_ID) missing.push("DEVICE_ID");
  if ((env.ADAPTER ?? "fake").toLowerCase() === "controlid") {
    for (const k of ["IDFACE_HOST", "IDFACE_PASS", "BACKEND_URL", "AGENT_TOKEN"])
      if (!env[k]) missing.push(k);
  }
  return missing;
}
