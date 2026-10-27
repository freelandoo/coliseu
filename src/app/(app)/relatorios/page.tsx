import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { ExportarRelatorio } from "@/components/relatorios/ExportarRelatorio";
import { RelatoriosView, type RelatoriosData } from "@/components/relatorios/RelatoriosView";
import { diasSemPresenca, faixaAusencia, formatBRL } from "@/lib/mock-data";
import { serieMensalRepo } from "@/lib/repositories/relatorios";
import { contarCobrancasPorStatusRepo } from "@/lib/repositories/cobrancas";
import { contarLeadsPorEstagioRepo } from "@/lib/repositories/pessoas";
import { pontoDeEvasao, retencaoPorCoorte } from "@/lib/fidelidade";
import { listarAlunos, listarPlanos, totalDespesas } from "@/lib/store";
import { contaComoAtivo } from "@/lib/billing/regua";
import { LEAD_ESTAGIO_LABEL, type LeadEstagio } from "@/lib/types";
import { requireModulo } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const ORDEM_FUNIL: LeadEstagio[] = ["novo", "qualificado", "interesse", "convertido", "perdido"];

export default async function RelatoriosPage() {
  await requireModulo("relatorios");
  // Leads e cobranças entram só como contagem (no banco): a tela não lista
  // nenhum deles, e eram ~1.400 leads com matrículas + ~800 cobranças lidos
  // inteiros para virar seis números.
  const [alunos, cobrancas, leadsPorEstagio, planos, despesas, serie] = await Promise.all([
    listarAlunos(),
    contarCobrancasPorStatusRepo(),
    contarLeadsPorEstagioRepo(),
    listarPlanos(),
    totalDespesas(),
    serieMensalRepo(),
  ]);
  const planoById = new Map(planos.map((p) => [p.id, p]));

  // ---------- base ----------
  const naoCancelados = alunos.filter((a) => contaComoAtivo(a));
  const base = naoCancelados.length;
  const inadimplentes = naoCancelados.filter((a) => a.status === "inadimplente");

  const valorMensal = (planoId: string) => planoById.get(planoId)?.valorMensal ?? 0;

  // ---------- financeiro ----------
  const mrr = naoCancelados.reduce((s, a) => s + valorMensal(a.planoId), 0);
  const receitaRisco = inadimplentes.reduce((s, a) => s + valorMensal(a.planoId), 0);
  const taxaInadimplencia = base ? (inadimplentes.length / base) * 100 : 0;
  const ticketMedio = base ? mrr / base : 0;

  // ---------- lucro (receita − despesas) ----------
  const lucro = mrr - despesas;
  const margemLucro = mrr > 0 ? (lucro / mrr) * 100 : 0;

  // ---------- captação ----------
  const totalLeads = ORDEM_FUNIL.reduce((s, e) => s + leadsPorEstagio[e], 0);
  const convertidos = leadsPorEstagio.convertido;
  const taxaConversao = totalLeads ? (convertidos / totalLeads) * 100 : 0;

  // ---------- presença / evasão ----------
  const comFaixa = naoCancelados.map((a) => {
    const dias = diasSemPresenca(a);
    return { dias, faixa: faixaAusencia(dias) };
  });
  const evasao = comFaixa.filter((x) => x.dias >= 21).length;
  const frequentes = comFaixa.filter((x) => x.faixa === null).length;
  const taxaEvasao = base ? (evasao / base) * 100 : 0;

  // ---------- distribuições ----------
  const funil = ORDEM_FUNIL.map((e) => ({
    label: LEAD_ESTAGIO_LABEL[e],
    valor: leadsPorEstagio[e],
    destaque: e === "convertido",
  }));

  const planosData = planos.map((p) => ({
    label: p.nome,
    valor: naoCancelados.filter((a) => a.planoId === p.id).length,
  }));

  const financeiro = [
    { label: "Pago", valor: cobrancas.pago },
    { label: "Pendente", valor: cobrancas.pendente },
    { label: "Atrasado", valor: cobrancas.atrasado, destaque: true },
  ];

  const evasao_ = pontoDeEvasao(alunos);
  const evasaoTempo = evasao_.dist.map((d) => ({
    label: d.label,
    valor: d.count,
    // Empate no pico: todas as faixas empatadas são o ponto de evasão.
    destaque: d.count > 0 && d.count === evasao_.pico.count,
  }));
  const retencaoCoorte = retencaoPorCoorte(alunos).map((c) => ({ label: c.label, valor: Math.round(c.pct) }));

  const retencao = [
    { label: "Em dia", valor: frequentes },
    { label: "7 dias", valor: comFaixa.filter((x) => x.faixa === 7).length },
    { label: "14 dias", valor: comFaixa.filter((x) => x.faixa === 14).length },
    { label: "21+ dias", valor: comFaixa.filter((x) => x.faixa === 21).length, destaque: true },
  ];

  const data: RelatoriosData = {
    kpis: [
      { label: "Receita recorrente (MRR)", valor: mrr, formato: "moeda", hint: `Ticket médio ${formatBRL(ticketMedio)}` },
      {
        label: "Taxa de inadimplência",
        valor: taxaInadimplencia,
        formato: "pct",
        tom: inadimplentes.length ? "ruim" : "neutro",
        hint: `${formatBRL(receitaRisco)} em risco`,
      },
      {
        label: "Taxa de conversão",
        valor: taxaConversao,
        formato: "pct",
        hint: `${convertidos} de ${totalLeads.toLocaleString("pt-BR")} leads`,
      },
      {
        label: "Risco de evasão",
        valor: taxaEvasao,
        formato: "pct",
        tom: evasao ? "alerta" : "neutro",
        hint: `${evasao} alunos há 21+ dias sem aparecer`,
      },
      {
        label: "Lucro do mês",
        valor: lucro,
        formato: "moeda",
        tom: lucro >= 0 ? "bom" : "ruim",
        hint: `Margem ${margemLucro.toFixed(1).replace(".", ",")}%`,
      },
      { label: "Base ativa", valor: base, formato: "int", hint: `${inadimplentes.length} inadimplentes` },
    ],
    resultado: { receita: mrr, despesas, lucro },
    funil,
    planos: planosData,
    financeiro,
    retencao,
    serie,
    evasaoTempo,
    retencaoCoorte,
  };

  return (
    <>
      <Reveal>
        <PageHeader title="Relatórios" />
      </Reveal>

      <Reveal delay={0.05}>
        <div className="mb-6">
          <ExportarRelatorio />
        </div>
      </Reveal>

      <RelatoriosView data={data} />
    </>
  );
}
