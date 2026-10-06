/**
 * Roda uma vez quando o servidor sobe (Next instrumentation). Produção é uma
 * instância só no Railway, então o agendador em memória não duplica.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production" && process.env.AGENDADOR_DEV !== "1") return;
  const { iniciarAgendador } = await import("@/lib/agendador");
  iniciarAgendador();
}
