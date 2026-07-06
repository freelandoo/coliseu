import { Reveal } from "@/components/ui/Reveal";
import { PageHeader, Stat } from "@/components/ui/primitives";
import {
  RetencaoFiltro,
  type LinhaRetencao,
} from "@/components/retencao/RetencaoFiltro";
import { diasSemPresenca, faixaAusencia, formatData } from "@/lib/mock-data";
import { listarAlunos, planoPorId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function RetencaoPage() {
  const linhas: LinhaRetencao[] = listarAlunos()
    .filter((a) => a.status !== "cancelado")
    .map((a) => {
      const dias = diasSemPresenca(a);
      return {
        id: a.id,
        nome: a.nome,
        telefone: a.telefone,
        planoNome: planoPorId(a.planoId)?.nome ?? "—",
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
        <PageHeader
          step={4}
          title="Retenção e Reativação"
          subtitle="Monitora a presença dos alunos. Após 7, 14 ou 21 dias sem comparecer, dispara acompanhamento, alerta de risco e campanha de reativação."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Frequentes" value={frequentes} tone="ok" hint="presença em dia" />
          <Stat label="Ausentes" value={ausentes} tone="warn" hint="há 7+ dias" />
          <Stat label="Lista de evasão" value={evasao} tone="red" hint="há 21+ dias" />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-10">
          <RetencaoFiltro linhas={linhas} />
        </div>
      </Reveal>
    </>
  );
}
