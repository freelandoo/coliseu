import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import {
  RelatoriosView,
  type RelatoriosData,
} from "@/components/relatorios/RelatoriosView";
import { diasSemPresenca, faixaAusencia, serieMensal } from "@/lib/mock-data";
import {
  listarAlunos,
  listarCobrancas,
  listarLeads,
  listarPlanos,
  totalDespesas,
} from "@/lib/store";
import {
  LEAD_ESTAGIO_LABEL,
  type LeadEstagio,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const [alunos, cobrancas, leads, planos, despesas] = await Promise.all([
    listarAlunos(),
    listarCobrancas(),
    listarLeads(),
    listarPlanos(),
    totalDespesas(),
  ]);
  const planoById = new Map(planos.map((p) => [p.id, p]));

  // ---------- base ----------
  const naoCancelados = alunos.filter((a) => a.status !== "cancelado");
  const base = naoCancelados.length;
  const inadimplentes = naoCancelados.filter((a) => a.status === "inadimplente");

  const valorMensal = (planoId: string) => planoById.get(planoId)?.valorMensal ?? 0;

  // ---------- financeiro ----------
  const mrr = naoCancelados.reduce((s, a) => s + valorMensal(a.planoId), 0);
  const receitaRisco = inadimplentes.reduce(
    (s, a) => s + valorMensal(a.planoId),
    0,
  );
  const taxaInadimplencia = base ? (inadimplentes.length / base) * 100 : 0;
  const ticketMedio = base ? mrr / base : 0;

  // ---------- lucro (receita − despesas) ----------
  const lucro = mrr - despesas;
  const margemLucro = mrr > 0 ? (lucro / mrr) * 100 : 0;

  // ---------- captação ----------
  const totalLeads = leads.length;
  const convertidos = leads.filter((l) => l.estagio === "convertido").length;
  const taxaConversao = totalLeads ? (convertidos / totalLeads) * 100 : 0;

  // ---------- presença / evasão ----------
  const comFaixa = naoCancelados.map((a) => {
    const dias = diasSemPresenca(a);
    return { dias, faixa: faixaAusencia(dias) };
  });
  const evasao = comFaixa.filter((x) => x.dias >= 21).length;
  const frequentes = comFaixa.filter((x) => x.faixa === null).length;
  const taxaEvasao = base ? (evasao / base) * 100 : 0;

  // ---------- gráficos ----------
  const funilTone: Record<LeadEstagio, RelatoriosData["funil"][number]["tone"]> = {
    novo: "neutral",
    qualificado: "warn",
    interesse: "red",
    convertido: "ok",
    perdido: "neutral",
  };
  const ordemFunil: LeadEstagio[] = [
    "novo",
    "qualificado",
    "interesse",
    "convertido",
    "perdido",
  ];
  const funil = ordemFunil.map((e) => ({
    label: LEAD_ESTAGIO_LABEL[e],
    valor: leads.filter((l) => l.estagio === e).length,
    tone: funilTone[e],
  }));

  const planosData = planos.map((p) => ({
    label: p.nome,
    valor: naoCancelados.filter((a) => a.planoId === p.id).length,
    tone: "neutral" as const,
  }));

  const financeiro = [
    {
      label: "Pago",
      valor: cobrancas.filter((c) => c.status === "pago").length,
      tone: "ok" as const,
    },
    {
      label: "Pendente",
      valor: cobrancas.filter((c) => c.status === "pendente").length,
      tone: "warn" as const,
    },
    {
      label: "Atrasado",
      valor: cobrancas.filter((c) => c.status === "atrasado").length,
      tone: "red" as const,
    },
  ];

  const retencao = [
    { label: "Em dia", valor: frequentes, tone: "ok" as const },
    {
      label: "7 dias",
      valor: comFaixa.filter((x) => x.faixa === 7).length,
      tone: "warn" as const,
    },
    {
      label: "14 dias",
      valor: comFaixa.filter((x) => x.faixa === 14).length,
      tone: "red" as const,
    },
    {
      label: "21 dias",
      valor: comFaixa.filter((x) => x.faixa === 21).length,
      tone: "red" as const,
    },
  ];

  const data: RelatoriosData = {
    kpis: [
      {
        label: "Receita recorrente (MRR)",
        valor: mrr,
        formato: "moeda",
        hint: `Ticket médio ${ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      },
      {
        label: "Taxa de inadimplência",
        valor: taxaInadimplencia,
        formato: "pct",
        tone: "red",
        hint: `${receitaRisco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em risco`,
      },
      {
        label: "Taxa de conversão",
        valor: taxaConversao,
        formato: "pct",
        tone: "ok",
        hint: `${convertidos} de ${totalLeads} leads`,
      },
      {
        label: "Risco de evasão",
        valor: taxaEvasao,
        formato: "pct",
        tone: "warn",
        hint: `${evasao} alunos há 21+ dias`,
      },
      {
        label: "Lucro do mês",
        valor: lucro,
        formato: "moeda",
        tone: lucro >= 0 ? "ok" : "red",
        hint: `Margem ${margemLucro.toFixed(1).replace(".", ",")}%`,
      },
      {
        label: "Base ativa",
        valor: base,
        formato: "int",
        hint: `${inadimplentes.length} inadimplentes`,
      },
    ],
    funil,
    planos: planosData,
    financeiro,
    retencao,
    resultado: [
      { label: "Receita", valor: mrr, tone: "ok" },
      { label: "Despesas", valor: despesas, tone: "red" },
      { label: "Lucro", valor: lucro, tone: lucro >= 0 ? "ok" : "red" },
    ],
    serie: serieMensal(),
  };

  return (
    <>
      <Reveal>
        <PageHeader
          step={5}
          title="Relatórios e Indicadores"
          subtitle="Saúde do negócio em números: receita, inadimplência, conversão, evasão e retenção — atualizado a partir dos dados do CRM."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <RelatoriosView data={data} />
      </Reveal>
    </>
  );
}
