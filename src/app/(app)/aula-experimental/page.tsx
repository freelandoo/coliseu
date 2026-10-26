import { AgendarAulaBalcao } from "@/components/aula-experimental/AgendarAulaBalcao";
import { AgendaAulaExperimental } from "@/components/aula-experimental/AgendaAulaExperimental";
import { Coliseu3D } from "@/components/coliseu3d/Coliseu3D";
import { classeBotao } from "@/components/ui/Botao";
import { CabecalhoEditorial, CartaoIndicador, EstadoVazio } from "@/components/ui/editorial";
import { listarAulasExperimentais } from "@/lib/store";
import { listarLegadoRepo } from "@/lib/repositories/aulas-experimentais";
import { ehDataISO, hojeNaAcademia, horaNaAcademia, resumoDoDia } from "@/lib/aula-experimental";
import { requireModulo } from "@/lib/auth/rbac";
import type { AulaExperimentalItem, AulaLegadoItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A agenda das visitas, em tela própria — a tela-referência do tabloide.
 *
 * Saiu de dentro da Captação porque não é a mesma leitura: lá se trabalha o
 * funil (quem é lead, em que estágio está), aqui se olha o relógio — quem vem
 * hoje, que dia já tem visita marcada.
 *
 * Dois caminhos para agendar: a conversa do Atendimento (a confirmação sai
 * por lá) ou o "Agendar aula" daqui, para o balcão não precisar ir ao
 * Atendimento — aqui a aula entra na agenda e a confirmação vai pelo WhatsApp
 * da recepção, com o texto pronto.
 */
export default async function AulaExperimentalPage({
  searchParams,
}: {
  /** `dia`: "AAAA-MM-DD" vindo da central — abre o calendário nesse dia. */
  searchParams: Promise<{ dia?: string | string[] }>;
}) {
  const usuario = await requireModulo("aula-experimental");
  const agendante = { nome: usuario.nome, podeLiberar: usuario.role === "ADMIN" };
  const { dia } = await searchParams;
  const pedido = Array.isArray(dia) ? dia[0] : dia;
  // O dia e a hora são do relógio da academia, não do servidor (UTC) nem do celular.
  const agora = new Date();
  const hoje = hojeNaAcademia(agora);
  const hora = horaNaAcademia(agora);

  // Falha ao carregar não pode virar "zero visitas": vira aviso de erro.
  let aulas: AulaExperimentalItem[] | null = null;
  let legado: AulaLegadoItem[] = [];
  try {
    [aulas, legado] = await Promise.all([listarAulasExperimentais(), listarLegadoRepo()]);
  } catch (e) {
    console.error("[aula-experimental] falha ao listar", e);
  }

  const agendar = <AgendarAulaBalcao agendante={agendante} dia={ehDataISO(pedido) ? pedido : hoje} />;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <CabecalhoEditorial
        className="entrada"
        categoria="Relacionamento / Aula experimental"
        titulo="Aula experimental"
        faixa="Da primeira visita ao próximo aluno"
        descricao={
          aulas ? (
            <>
              <p className="font-semibold">{resumoDoDia(aulas, hoje, hora)}</p>
              <p className="mt-0.5 text-muted">
                Agende por aqui ou pela conversa no Atendimento — as duas caem nesta agenda.
              </p>
            </>
          ) : (
            <p className="text-muted">A agenda não pôde ser carregada agora.</p>
          )
        }
        acoes={agendar}
        decoracao={
          <div className="relative h-[8.5rem] w-[17rem]">
            <Coliseu3D className="absolute inset-0" intensidade="discreto" />
          </div>
        }
      />

      {aulas ? (
        <AgendaAulaExperimental
          aulas={aulas}
          legado={legado}
          agendante={agendante}
          hoje={hoje}
          horaInicial={hora}
          // Data inválida ou ausente: o calendário abre em hoje, como sempre.
          diaInicial={ehDataISO(pedido) ? pedido : hoje}
        />
      ) : (
        <>
          <section aria-label="Indicadores" className="grid gap-2 sm:grid-cols-3 sm:gap-4">
            <CartaoIndicador numero="01" rotulo="Agendadas no mês" periodo="mês do calendário" estado={{ tipo: "erro" }} />
            <CartaoIndicador numero="02" rotulo="Visitas hoje" periodo="hoje" estado={{ tipo: "erro" }} />
            <CartaoIndicador numero="03" rotulo="Próximos 7 dias" periodo="a partir de hoje" estado={{ tipo: "erro" }} />
          </section>
          <EstadoVazio
            tom="erro"
            titulo="Não foi possível carregar as aulas experimentais."
            acao={
              // Recarrega a rota inteira (componente do servidor, sem estado a perder).
              <a href="/aula-experimental" className={classeBotao({ variante: "secundario", tamanho: "md" })}>
                Tentar de novo
              </a>
            }
          >
            Nada foi apagado: é a leitura que falhou. Se continuar, as conversas no Atendimento seguem com o
            histórico de cada agendamento.
          </EstadoVazio>
        </>
      )}
    </div>
  );
}
