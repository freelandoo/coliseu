import { expirarMatriculasVencidas, modoExpiracao } from "@/lib/billing/expiracao";
import { modoEspelho, rodarEspelho } from "@/lib/cloudgym/espelho";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";
import { processarFila } from "@/lib/freelandoo/fila";
import { sincronizarFreelandoo } from "@/lib/freelandoo/sincronizar";

/**
 * Tarefas periódicas do servidor:
 * - vencimento de matrícula, de hora em hora (idempotente — rodar de novo não
 *   vence ninguém duas vezes);
 * - fila da Freelandoo, a cada minuto, e a sincronização das contas, a cada
 *   10 min. Sem FREELANDOO_API_URL/FREELANDOO_PARTNER_KEY as duas não fazem nada;
 * - espelho no CloudGym, a cada 10 min, até o corte (CLOUDGYM_ESPELHO).
 *
 * Este módulo alcança o envio de WhatsApp (boas-vindas da Freelandoo); só o
 * `instrumentation.ts` o importa — ver `envio-automatico.test.ts`.
 */
const UM_MINUTO = 60 * 1000;
const DEZ_MINUTOS = 10 * UM_MINUTO;
const UMA_HORA = 60 * UM_MINUTO;

const g = globalThis as unknown as { __coliseuAgendador?: boolean };

/** Uma rodada por vez: tick novo não começa se o anterior ainda está rodando. */
function semSobreposicao(nome: string, tarefa: () => Promise<void>): () => void {
  let rodando = false;
  return () => {
    if (rodando) return;
    rodando = true;
    tarefa()
      .catch((e) => console.error(`[agendador] ${nome} falhou:`, e))
      .finally(() => {
        rodando = false;
      });
  };
}

const rodarFilaFreelandoo = semSobreposicao("fila Freelandoo", async () => {
  if (!freelandooConfigurado()) return;
  const r = await processarFila();
  if (r.parouPorChave) console.error("[agendador] fila Freelandoo parada: chave de parceiro inválida");
  else if (r.processadas > 0) {
    console.log(`[agendador] fila Freelandoo: ${r.ok} ok, ${r.reagendadas} reagendada(s), ${r.falharam} falha(s)`);
  }
});

const rodarSyncFreelandoo = semSobreposicao("sync Freelandoo", async () => {
  if (!freelandooConfigurado()) return;
  const r = await sincronizarFreelandoo();
  if (!r.ok) console.error(`[agendador] sync Freelandoo não concluiu: ${r.erro}`);
  else if (r.atualizados > 0 || r.apagados > 0) {
    console.log(`[agendador] sync Freelandoo: ${r.atualizados} atualizado(s), ${r.apagados} conta(s) apagada(s)`);
  }
});

const rodarEspelhoCloudgym = semSobreposicao("espelho CloudGym", async () => {
  if (modoEspelho() === "desligado") return;
  const r = await rodarEspelho();
  if (r.feitos || r.erros || r.cancelados) {
    console.log(`[agendador] espelho CloudGym: ${r.feitos} lançado(s), ${r.erros} erro(s), ${r.cancelados} cancelado(s)`);
  }
});

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

  setTimeout(rodarFilaFreelandoo, 75_000).unref?.();
  setInterval(rodarFilaFreelandoo, UM_MINUTO).unref?.();
  setTimeout(rodarSyncFreelandoo, 90_000).unref?.();
  setInterval(rodarSyncFreelandoo, DEZ_MINUTOS).unref?.();
  setTimeout(rodarEspelhoCloudgym, 105_000).unref?.();
  setInterval(rodarEspelhoCloudgym, DEZ_MINUTOS).unref?.();
}
