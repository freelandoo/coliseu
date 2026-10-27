import { expirarMatriculasVencidas, modoExpiracao } from "@/lib/billing/expiracao";
import { rodarReguaCobranca } from "@/lib/billing/regua-cobranca";
import { modoEspelho, rodarEspelho } from "@/lib/cloudgym/espelho";
import { enviarLembretesAula, lembreteLigado } from "@/lib/aula-experimental-lembrete";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";
import { processarFila } from "@/lib/freelandoo/fila";
import { sincronizarFreelandoo } from "@/lib/freelandoo/sincronizar";

/**
 * Tarefas periódicas do servidor:
 * - vencimento de matrícula, de hora em hora (idempotente — rodar de novo não
 *   vence ninguém duas vezes);
 * - régua de cobrança, de hora em hora: pausa os avisos do Asaas no 8º dia,
 *   registra os avisos e limpa o registro com mais de 3 meses;
 * - fila da Freelandoo, a cada minuto, e a sincronização das contas, a cada
 *   10 min. Sem FREELANDOO_API_URL/FREELANDOO_PARTNER_KEY as duas não fazem nada;
 * - espelho no CloudGym, a cada 10 min, até o corte (CLOUDGYM_ESPELHO);
 * - lembrete de aula experimental na véspera, a cada 10 min das 9h às 20h
 *   (segunda exceção ao "nada sai sozinho" — ver aula-experimental-lembrete).
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

const rodarLembretesAula = semSobreposicao("lembrete de aula", async () => {
  if (!lembreteLigado()) return;
  const r = await enviarLembretesAula();
  if (r.enviados || r.falhas) console.log(`[agendador] lembretes de aula: ${r.enviados} enviado(s), ${r.falhas} falha(s)`);
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

const rodarRegua = semSobreposicao("régua de cobrança", async () => {
  const r = await rodarReguaCobranca();
  if (r.pausados || r.religados || r.registrados || r.apagados || r.bloqueados || r.erros) {
    console.log(
      `[agendador] régua: ${r.pausados} pausado(s), ${r.religados} religado(s), ${r.registrados} aviso(s) registrado(s), ` +
        `${r.apagados} apagado(s), ${r.bloqueados} ${modoExpiracao() === "ativa" ? "bloqueado(s)" : "seriam bloqueados (simulação)"}, ${r.erros} erro(s)`,
    );
  }
});

export function iniciarAgendador(): void {
  if (g.__coliseuAgendador) return;
  g.__coliseuAgendador = true;
  // Primeira rodada um minuto após o boot: não disputa com o healthcheck.
  setTimeout(() => void rodarExpiracao(), 60_000).unref?.();
  setInterval(() => void rodarExpiracao(), UMA_HORA).unref?.();
  setTimeout(rodarRegua, 135_000).unref?.();
  setInterval(rodarRegua, UMA_HORA).unref?.();

  setTimeout(rodarFilaFreelandoo, 75_000).unref?.();
  setInterval(rodarFilaFreelandoo, UM_MINUTO).unref?.();
  setTimeout(rodarSyncFreelandoo, 90_000).unref?.();
  setInterval(rodarSyncFreelandoo, DEZ_MINUTOS).unref?.();
  setTimeout(rodarEspelhoCloudgym, 105_000).unref?.();
  setInterval(rodarEspelhoCloudgym, DEZ_MINUTOS).unref?.();
  setTimeout(rodarLembretesAula, 120_000).unref?.();
  setInterval(rodarLembretesAula, DEZ_MINUTOS).unref?.();
}
