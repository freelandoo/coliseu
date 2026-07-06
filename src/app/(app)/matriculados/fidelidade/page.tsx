import { Reveal } from "@/components/ui/Reveal";
import { Badge, Card, PageHeader, Stat } from "@/components/ui/primitives";
import { MatriculadosTabs } from "@/components/matriculados/MatriculadosTabs";
import { diasEntre, formatData } from "@/lib/mock-data";
import { listarAlunos, listarPlanos } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Duração legível a partir de um total de meses. */
function formatMeses(m: number): string {
  if (m < 1) return "menos de 1 mês";
  if (m === 1) return "1 mês";
  if (m < 12) return `${m} meses`;
  const anos = Math.floor(m / 12);
  const resto = m % 12;
  const anosStr = `${anos} ano${anos > 1 ? "s" : ""}`;
  return resto ? `${anosStr} e ${resto} ${resto > 1 ? "meses" : "mês"}` : anosStr;
}

/** Faixa de fidelidade pelo tempo de casa (em meses). */
function faixaFidelidade(meses: number): { rotulo: string; tone: "neutral" | "ok" | "warn" | "red" } {
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
        <PageHeader
          title="Fidelidade"
          subtitle="Mede a lealdade dos matriculados: há quanto tempo cada aluno ativo está na casa e há quanto tempo os cancelados deixaram de frequentar."
        />
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
        <div className="mt-10">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted">
            Ativos — tempo de casa
          </h2>
          <Card className="overflow-hidden">
            {ativos.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-faint">Nenhum aluno ativo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <Th>Código</Th>
                      <Th>Nome</Th>
                      <Th>Plano</Th>
                      <Th>Matriculado em</Th>
                      <Th>Tempo de casa</Th>
                      <Th>Fidelidade</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativos.map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-faint">{a.codigo}</td>
                        <td className="px-4 py-3 font-medium text-ink">{a.nome}</td>
                        <td className="px-4 py-3 text-muted">{planoNome(a.planoId)}</td>
                        <td className="px-4 py-3 text-muted">{formatData(a.matriculadoEm)}</td>
                        <td className="px-4 py-3 font-medium text-ink">{formatMeses(a.meses)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={a.faixa.tone}>{a.faixa.rotulo}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </Reveal>

      <Reveal delay={0.15}>
        <div className="mt-10">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted">
            Cancelados — há quanto tempo saíram
          </h2>
          <Card className="overflow-hidden">
            {inativos.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-faint">
                Nenhum matriculado cancelado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <Th>Código</Th>
                      <Th>Nome</Th>
                      <Th>Última presença</Th>
                      <Th>Inativo há</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {inativos.map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-faint">{a.codigo}</td>
                        <td className="px-4 py-3 font-medium text-ink">{a.nome}</td>
                        <td className="px-4 py-3 text-muted">{formatData(a.ultimaPresenca)}</td>
                        <td className="px-4 py-3 font-medium text-red-bright">{formatMeses(a.meses)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </Reveal>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-faint">
      {children}
    </th>
  );
}
