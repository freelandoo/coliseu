import { Reveal } from "@/components/ui/Reveal";
import { PageHeader, Stat } from "@/components/ui/primitives";
import { MatriculadosTabs } from "@/components/matriculados/MatriculadosTabs";
import { LimitacaoIndicadores } from "@/components/matriculados/LimitacaoIndicadores";
import {
  RetencaoFiltro,
  type LinhaRetencao,
} from "@/components/retencao/RetencaoFiltro";
import { diasSemPresenca, faixaAusencia, formatData } from "@/lib/mock-data";
import { listarAlunos, listarPlanos } from "@/lib/store";
import { FAIXAS_RETENCAO, lerEnum } from "@/lib/navegacao";

export const dynamic = "force-dynamic";

export default async function RetencaoPage({
  searchParams,
}: {
  /** `faixa`: filtro a abrir (por allowlist) — é como o voltar da ficha restaura a lista. */
  searchParams: Promise<{ faixa?: string | string[] }>;
}) {
  const [alunos, planos, busca] = await Promise.all([listarAlunos(), listarPlanos(), searchParams]);
  const faixaUrl = Array.isArray(busca.faixa) ? busca.faixa[0] : busca.faixa;
  const planoById = new Map(planos.map((p) => [p.id, p]));

  const linhas: LinhaRetencao[] = alunos
    .filter((a) => a.status !== "cancelado")
    .map((a) => {
      const dias = diasSemPresenca(a);
      return {
        id: a.id,
        nome: a.nome,
        telefone: a.telefone,
        planoNome: planoById.get(a.planoId)?.nome ?? "—",
        ultimaPresenca: formatData(a.ultimaPresenca),
        dias,
        faixa: faixaAusencia(dias),
      };
    })
    .sort((x, y) => y.dias - x.dias);

  const frequentes = linhas.filter((l) => l.faixa === null).length;
  const ausentes = linhas.filter((l) => l.faixa !== null).length;
  const evasao = linhas.filter((l) => l.faixa === 21).length;

  return (
    <>
      <Reveal>
        <MatriculadosTabs />
      </Reveal>

      <Reveal>
        <PageHeader title="Retenção e Reativação" />
      </Reveal>

      <Reveal delay={0.03}>
        <LimitacaoIndicadores tela="retencao" />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Registro recente" value={frequentes} tone="ok" hint="último registro há menos de 7 dias" />
          <Stat label="Sem registro recente" value={ausentes} tone="warn" hint="último registro há 7+ dias" />
          <Stat label="Lista de evasão" value={evasao} tone="danger" hint="último registro há 21+ dias" />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-6">
          <RetencaoFiltro linhas={linhas} filtroInicial={lerEnum(faixaUrl, FAIXAS_RETENCAO, "todos")} />
        </div>
      </Reveal>
    </>
  );
}
