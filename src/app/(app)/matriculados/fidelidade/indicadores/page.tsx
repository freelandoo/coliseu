import { Reveal } from "@/components/ui/Reveal";
import { Badge, Card, PageHeader, Stat } from "@/components/ui/primitives";
import { MatriculadosTabs } from "@/components/matriculados/MatriculadosTabs";
import { FidelidadeSubTabs } from "@/components/matriculados/FidelidadeSubTabs";
import { formatBRL } from "@/lib/mock-data";
import {
  altoValorEmRisco,
  churnEstimado,
  formatMeses,
  janelaReativacao,
  ltvMedio,
  mixFidelidade,
} from "@/lib/fidelidade";
import { listarAlunos, listarPlanos } from "@/lib/store";

export const dynamic = "force-dynamic";

const MIX_TONE: Record<string, string> = {
  novato: "bg-surface-2",
  firmando: "bg-gradient-to-r from-[#8a6a24] to-warn",
  fiel: "bg-gradient-to-r from-[#2c6f4c] to-ok",
  veterano: "bg-gradient-to-r from-red-deep to-red-bright",
};

export default async function IndicadoresFidelidadePage() {
  const [alunos, planos] = await Promise.all([listarAlunos(), listarPlanos()]);
  const valorMensal = (id: string) => planos.find((p) => p.id === id)?.valorMensal ?? 0;

  const mix = mixFidelidade(alunos);
  const risco = altoValorEmRisco(alunos);
  const reativacao = janelaReativacao(alunos);
  const ltv = ltvMedio(alunos, valorMensal);
  const churn = churnEstimado(alunos);
  const totalMix = mix.reduce((s, m) => s + m.count, 0) || 1;

  return (
    <>
      <Reveal>
        <MatriculadosTabs />
      </Reveal>

      <Reveal>
        <PageHeader
          title="Fidelidade"
          subtitle="Indicadores de gestão: valor do tempo de vida, evasão, mix de lealdade e oportunidades de reativação."
        />
      </Reveal>

      <Reveal delay={0.03}>
        <FidelidadeSubTabs />
      </Reveal>

      {/* #6 LTV + #7 churn */}
      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="LTV médio" value={formatBRL(ltv.ltv)} tone="ok" hint="valor por aluno no ciclo de vida" />
          <Stat label="Ticket médio" value={formatBRL(ltv.ticketMedio)} hint="mensalidade média ativa" />
          <Stat label="Vida média" value={formatMeses(ltv.vidaMediaMeses)} hint={`base: ${ltv.baseadoEm}`} />
          <Stat
            label="Churn mensal (est.)"
            value={`${churn.mensalPct.toFixed(1).replace(".", ",")}%`}
            tone="warn"
            hint={`~${churn.anualPct.toFixed(0)}% ao ano · ${churn.saiuUltimoMes} saíram no mês`}
          />
        </section>
      </Reveal>

      {/* #3 mix de fidelidade */}
      <Reveal delay={0.1}>
        <div className="mt-10">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted">
            Mix de fidelidade — composição da base ativa
          </h2>
          <Card className="p-6">
            <div className="flex h-8 w-full overflow-hidden rounded-lg">
              {mix.map((m) =>
                m.count === 0 ? null : (
                  <div
                    key={m.faixa}
                    className={MIX_TONE[m.faixa]}
                    style={{ width: `${(m.count / totalMix) * 100}%` }}
                    title={`${m.label}: ${m.count}`}
                  />
                ),
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {mix.map((m) => (
                <div key={m.faixa} className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-faint">{m.label}</span>
                  <span className="font-display text-2xl font-semibold text-ink">
                    {m.pct.toFixed(0)}%
                  </span>
                  <span className="text-xs text-muted">{m.count} alunos</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-faint">
              Novato &lt; 3m · Firmando 3–6m · Fiel 6–12m · Veterano 12m+. Base concentrada em novatos
              é frágil; peso em fiéis e veteranos indica receita estável.
            </p>
          </Card>
        </div>
      </Reveal>

      {/* #4 alto valor em risco */}
      <Reveal delay={0.12}>
        <div className="mt-10">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted">
            Fiéis e veteranos em risco
          </h2>
          <Card className="overflow-hidden">
            {risco.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-faint">
                Nenhum aluno de 6+ meses ausente há 7+ dias. 👏
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <Th>Código</Th>
                      <Th>Nome</Th>
                      <Th>Tempo de casa</Th>
                      <Th>Ausente há</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {risco.map(({ aluno, meses, diasAusente }) => (
                      <tr key={aluno.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-xs text-faint">{aluno.codigo}</td>
                        <td className="px-4 py-3 font-medium text-ink">{aluno.nome}</td>
                        <td className="px-4 py-3 text-muted">{formatMeses(meses)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={diasAusente >= 14 ? "red" : "warn"}>{diasAusente} dias</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="mt-2 text-xs text-faint">
            Alunos antigos são os mais caros de repor — priorize contato pessoal, não campanha em massa.
          </p>
        </div>
      </Reveal>

      {/* #5 janela de reativação */}
      <Reveal delay={0.14}>
        <div className="mt-10">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted">
            Janela de reativação — cancelados por tempo de saída
          </h2>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <JanelaCard
              titulo="Recentes"
              hint="saíram há menos de 2 meses · win-back fácil"
              alunos={reativacao.recentes}
              tone="ok"
            />
            <JanelaCard
              titulo="Mornos"
              hint="2 a 6 meses · campanha com oferta"
              alunos={reativacao.mornos}
              tone="warn"
            />
            <JanelaCard
              titulo="Frios"
              hint="6+ meses · reengajamento difícil"
              alunos={reativacao.frios}
              tone="red"
            />
          </section>
        </div>
      </Reveal>
    </>
  );
}

function JanelaCard({
  titulo,
  hint,
  alunos,
  tone,
}: {
  titulo: string;
  hint: string;
  alunos: { aluno: { id: string; nome: string }; meses: number }[];
  tone: "ok" | "warn" | "red";
}) {
  const cor = { ok: "text-ok", warn: "text-warn", red: "text-red-bright" }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">{titulo}</h3>
        <span className={`font-display text-2xl font-semibold ${cor}`}>{alunos.length}</span>
      </div>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {alunos.length === 0 ? (
          <li className="text-xs text-faint">—</li>
        ) : (
          alunos.map(({ aluno, meses }) => (
            <li key={aluno.id} className="flex items-center justify-between text-sm">
              <span className="text-muted">{aluno.nome}</span>
              <span className="text-xs text-faint">{formatMeses(meses)}</span>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-faint">
      {children}
    </th>
  );
}
