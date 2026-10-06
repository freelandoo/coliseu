import { expirarMatriculasVencidas, modoExpiracao } from "@/lib/billing/expiracao";

/**
 * Tarefas periódicas do servidor. Hoje: vencimento de matrícula, de hora em
 * hora (idempotente — rodar de novo não vence ninguém duas vezes).
 */
const UMA_HORA = 60 * 60 * 1000;

const g = globalThis as unknown as { __coliseuAgendador?: boolean };

async function rodarExpiracao() {
  if (modoExpiracao() === "desligada") return;
  try {
    const r = await expirarMatriculasVencidas();
    if (r.candidatos > 0) {
      console.log(
        r.modo === "ativa"
          ? `[agendador] matrículas vencidas: ${r.expiradas} de ${r.candidatos}`
          : `[agendador] (simulação) ${r.candidatos} matrícula(s) venceriam — EXPIRACAO_MATRICULAS=ativa para aplicar`,
      );
    }
  } catch (e) {
    console.error("[agendador] expiração falhou:", e);
  }
}

export function iniciarAgendador(): void {
  if (g.__coliseuAgendador) return;
  g.__coliseuAgendador = true;
  // Primeira rodada um minuto após o boot: não disputa com o healthcheck.
  setTimeout(() => void rodarExpiracao(), 60_000).unref?.();
  setInterval(() => void rodarExpiracao(), UMA_HORA).unref?.();
}
