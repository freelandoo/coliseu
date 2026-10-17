import { Reveal } from "@/components/ui/Reveal";
import { PageHeader, Stat } from "@/components/ui/primitives";
import { MatriculadosTabs } from "@/components/matriculados/MatriculadosTabs";
import { FidelidadeSubTabs } from "@/components/matriculados/FidelidadeSubTabs";
import { FidelidadeListas } from "@/components/matriculados/FidelidadeListas";
import { LimitacaoIndicadores } from "@/components/matriculados/LimitacaoIndicadores";
import { diasEntre, formatData } from "@/lib/mock-data";
import { formatMeses } from "@/lib/fidelidade";
import { listarAlunos, listarPlanos } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Faixa de fidelidade pelo tempo de casa (em meses). */
function faixaFidelidade(meses: number): { rotulo: string; tone: "neutral" | "ok" | "warn" } {
  if (meses >= 12) return { rotulo: "Veterano", tone: "ok" };
  if (meses >= 6) return { rotulo: "Fiel", tone: "ok" };
  if (meses >= 3) return { rotulo: "Firmando", tone: "warn" };
  return { rotulo: "Novato", tone: "neutral" };
}

const mesesDesde = (iso: string) => Math.max(0, Math.round(diasEntre(iso) / 30));

export default async function FidelidadePage() {
  const [alunos, planos] = await Promise.all([listarAlunos(), listarPlanos()]);
  const planoById = new Map(planos.map((p) => [p.id, p]));
  const planoNome = (id: string) => planoById.get(id)?.nome ?? "—";

  // Ativos: tempo de casa desde a matrícula (fidelidade acumulada).
  const ativos = alunos
    .filter((a) => a.status !== "cancelado")
    .map((a) => {
      const meses = mesesDesde(a.matriculadoEm);
      return { ...a, meses, faixa: faixaFidelidade(meses) };
    })
    .sort((x, y) => y.meses - x.meses);

  // Inativos: há quanto tempo deixaram de frequentar (desde a última presença).
  const inativos = alunos
    .filter((a) => a.status === "cancelado")
    .map((a) => ({ ...a, meses: mesesDesde(a.ultimaPresenca) }))
    .sort((x, y) => y.meses - x.meses);

  const veteranos = ativos.filter((a) => a.meses >= 12).length;
  const fieis = ativos.filter((a) => a.meses >= 6 && a.meses < 12).length;
  const novatos = ativos.filter((a) => a.meses < 3).length;
  const mediaMeses = ativos.length
    ? Math.round(ativos.reduce((s, a) => s + a.meses, 0) / ativos.length)
    : 0;

  return (
    <>
      <Reveal>
        <MatriculadosTabs />
      </Reveal>

      <Reveal>
        <PageHeader title="Fidelidade" />
      </Reveal>

      <Reveal delay={0.03}>
        <FidelidadeSubTabs />
      </Reveal>

      <Reveal delay={0.04}>
        <LimitacaoIndicadores tela="fidelidade" />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Veteranos" value={veteranos} tone="ok" hint="12+ meses de casa" />
          <Stat label="Fiéis" value={fieis} tone="ok" hint="6 a 11 meses" />
          <Stat label="Novatos" value={novatos} tone="warn" hint="menos de 3 meses" />
          <Stat label="Tempo médio" value={formatMeses(mediaMeses)} hint="por aluno ativo" />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <FidelidadeListas
          ativos={ativos.map((a) => ({
            id: a.id,
            codigo: a.codigo,
            nome: a.nome,
            planoNome: planoNome(a.planoId),
            matriculadoEm: formatData(a.matriculadoEm),
            meses: a.meses,
            faixa: a.faixa,
          }))}
          cancelados={inativos.map((a) => ({
            id: a.id,
            codigo: a.codigo,
            nome: a.nome,
            ultimaPresenca: formatData(a.ultimaPresenca),
            meses: a.meses,
          }))}
        />
      </Reveal>
    </>
  );
}
