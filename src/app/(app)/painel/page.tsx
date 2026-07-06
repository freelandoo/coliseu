import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { Badge, Card, Stat } from "@/components/ui/primitives";
import { diasSemPresenca, faixaAusencia, formatBRL } from "@/lib/mock-data";
import { listarAlunos, listarCobrancas, listarLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const [alunos, cobrancas, leads] = await Promise.all([
    listarAlunos(),
    listarCobrancas(),
    listarLeads(),
  ]);

  const leadsAtivos = leads.filter(
    (l) => l.estagio !== "perdido" && l.estagio !== "convertido",
  ).length;
  // Leads convertidos já viraram alunos (fase "aluno"), então a base de
  // convertidos é a de alunos; a taxa considera o total que passou pelo funil.
  const convertidos = alunos.length;
  const taxaConversao = Math.round(
    (convertidos / (convertidos + leadsAtivos || 1)) * 100,
  );

  const ativos = alunos.filter((a) => a.status === "ativo").length;
  const inadimplentes = alunos.filter((a) => a.status === "inadimplente");
  const valorEmAberto = cobrancas
    .filter((c) => c.status !== "pago")
    .reduce((s, c) => s + c.valor, 0);

  const ausentes = alunos.filter((a) => faixaAusencia(diasSemPresenca(a)));

  const stages = [
    {
      step: 1,
      title: "Captação",
      href: "/captacao",
      metric: `${leadsAtivos} leads no funil`,
      desc: "WhatsApp, redes, balcão e indicação entram no CRM e são qualificados.",
    },
    {
      step: 2,
      title: "Matrícula",
      href: "/matriculados/renovar",
      metric: `${alunos.filter((a) => a.status === "pendente").length} aguardando pagamento`,
      desc: "Plano → cadastro → Asaas → link via WhatsApp → webhook confirma.",
    },
    {
      step: 3,
      title: "Cobrança",
      href: "/cobranca",
      metric: `${inadimplentes.length} inadimplentes`,
      desc: "Avisos de vencimento, inadimplência e renovação de plano.",
    },
    {
      step: 4,
      title: "Retenção",
      href: "/matriculados/retencao",
      metric: `${ausentes.length} em risco de evasão`,
      desc: "Monitora presença e dispara campanhas em 7, 14 e 21 dias.",
    },
  ];

  return (
    <>
      <Reveal>
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-red-bright">
            Visão geral
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold uppercase tracking-wide text-ink">
            Painel operacional
          </h1>
          <p className="mt-1 text-sm text-muted">
            Captação, matrícula, cobrança e retenção — integradas com Asaas.
          </p>
        </header>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Leads no funil" value={leadsAtivos} hint={`${taxaConversao}% de conversão`} />
          <Stat label="Alunos ativos" value={ativos} tone="ok" hint={`de ${alunos.length} matrículas`} />
          <Stat label="Em aberto" value={formatBRL(valorEmAberto)} tone="warn" hint={`${cobrancas.filter((c) => c.status !== "pago").length} cobranças`} />
          <Stat label="Risco de evasão" value={ausentes.length} tone="red" hint="ausentes há 7+ dias" />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="mt-10">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
            Pipeline em 4 estágios
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {stages.map((s) => (
              <Link key={s.step} href={s.href} className="group">
                <Card className="flex h-full items-start gap-4 p-5 transition-colors group-hover:border-border-strong group-hover:bg-surface-2">
                  <span className="steel-plate h-9 w-9 shrink-0 rounded-md text-lg">
                    {s.step}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
                        {s.title}
                      </h3>
                      <Badge tone="red">{s.metric}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted">{s.desc}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      {inadimplentes.length > 0 && (
        <Reveal delay={0.15}>
          <section className="mt-10">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
              Atenção imediata
            </h2>
            <Card className="divide-y divide-border">
              {inadimplentes.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{a.nome}</p>
                    <p className="text-xs text-faint">{a.telefone}</p>
                  </div>
                  <Badge tone="red">Inadimplente</Badge>
                </div>
              ))}
            </Card>
          </section>
        </Reveal>
      )}
    </>
  );
}
