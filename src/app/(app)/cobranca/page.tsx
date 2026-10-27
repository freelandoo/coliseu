import { Reveal } from "@/components/ui/Reveal";
import { PageHeader, Stat } from "@/components/ui/primitives";
import { type LinhaCobranca } from "@/components/cobranca/CobrancaFiltro";
import { CobrancaTabs } from "@/components/cobranca/CobrancaTabs";
import { type PlanoComContagem } from "@/components/cobranca/GestaoPlanos";
import { diasEntre, formatBRL, formatData } from "@/lib/mock-data";
import {
  listarAlunos,
  listarCobrancas,
  listarPlanos,
} from "@/lib/store";
import { requireModulo } from "@/lib/auth/rbac";
import { contaComoAtivo } from "@/lib/billing/regua";
import type { ContratoAVencer, Duracao } from "@/components/cobranca/ContratosAVencer";

/** Duração do contrato pela do plano (dias → anual, semestral…). */
function duracaoDoPlano(dias: number | undefined): Duracao {
  if (!dias) return "outro";
  const meses = Math.round(dias / 30);
  if (meses >= 12) return "anual";
  if (meses >= 6) return "semestral";
  if (meses >= 3) return "trimestral";
  if (meses <= 1) return "mensal";
  return "outro";
}

export const dynamic = "force-dynamic";

export default async function CobrancaPage() {
  await requireModulo("cobranca");
  // Só o que está em aberto: pagas, canceladas e estornadas não aparecem aqui.
  const [alunos, cobrancas, planos] = await Promise.all([
    listarAlunos(),
    listarCobrancas(["pendente", "atrasado"]),
    listarPlanos(),
  ]);
  const alunoById = new Map(alunos.map((a) => [a.id, a]));
  const planoById = new Map(planos.map((p) => [p.id, p]));
  // A) Cobrança: atrasadas (mais urgentes) + a vencer
  const atrasadas: LinhaCobranca[] = cobrancas
    .filter((c) => c.status === "atrasado")
    .map((c) => {
      const aluno = alunoById.get(c.alunoId);
      return {
        id: c.id,
        pessoaId: aluno ? c.alunoId : undefined,
        nome: aluno?.nome ?? "—",
        telefone: aluno?.telefone ?? "",
        detalhe: `${formatBRL(c.valor)} · vence ${formatData(c.vencimento)}`,
        categoria: "atrasada" as const,
        dias: diasEntre(c.vencimento),
      };
    })
    .sort((a, b) => b.dias - a.dias);

  const aVencer: LinhaCobranca[] = cobrancas
    .filter((c) => c.status === "pendente")
    .map((c) => {
      const aluno = alunoById.get(c.alunoId);
      return {
        id: c.id,
        pessoaId: aluno ? c.alunoId : undefined,
        nome: aluno?.nome ?? "—",
        telefone: aluno?.telefone ?? "",
        detalhe: `${formatBRL(c.valor)} · vence ${formatData(c.vencimento)}`,
        categoria: "avencer" as const,
        dias: -diasEntre(c.vencimento),
      };
    })
    .sort((a, b) => a.dias - b.dias);

  // B) Renovação: planos a expirar em <= 15 dias
  const aRenovar: LinhaCobranca[] = alunos
    .filter((a) => a.status !== "cancelado")
    .map((a) => ({ aluno: a, dias: -diasEntre(a.vencimentoPlano) }))
    .filter((x) => x.dias >= 0 && x.dias <= 15)
    .sort((a, b) => a.dias - b.dias)
    .map(({ aluno, dias }) => ({
      id: `renov-${aluno.id}`,
      pessoaId: aluno.id,
      nome: aluno.nome,
      telefone: aluno.telefone,
      detalhe: `${planoById.get(aluno.planoId)?.nome ?? "Sem plano"} · expira em ${dias}d`,
      categoria: "arenovar" as const,
      dias,
    }));

  const linhas = [...atrasadas, ...aVencer, ...aRenovar];

  // Contratos (aba "Contratos"): matrícula ativa que vence nos próximos 30 dias.
  const contratos: ContratoAVencer[] = alunos
    .filter((a) => contaComoAtivo(a))
    .map((a) => ({ aluno: a, dias: -diasEntre(a.vencimentoPlano) }))
    .filter((x) => x.dias >= 0 && x.dias <= 30)
    .sort((a, b) => a.dias - b.dias)
    .map(({ aluno, dias }) => {
      const plano = planoById.get(aluno.planoId);
      return {
        pessoaId: aluno.id,
        nome: aluno.nome,
        codigo: aluno.codigo,
        telefone: aluno.telefone,
        plano: plano?.nome ?? "Sem plano",
        duracao: duracaoDoPlano(plano?.duracaoDias),
        inicio: aluno.matriculadoEm,
        vencimento: aluno.vencimentoPlano,
        dias,
      };
    });
  const totalAtrasado = cobrancas
    .filter((c) => c.status === "atrasado")
    .reduce((s, c) => s + c.valor, 0);

  // Planos com contagem de alunos ativos (para a aba "Planos")
  const contagemPorPlano = new Map<string, number>();
  for (const a of alunos) {
    if (a.status === "cancelado") continue;
    contagemPorPlano.set(a.planoId, (contagemPorPlano.get(a.planoId) ?? 0) + 1);
  }
  const planosComContagem: PlanoComContagem[] = planos.map((p) => ({
    ...p,
    alunos: contagemPorPlano.get(p.id) ?? 0,
  }));

  return (
    <>
      <Reveal>
        <PageHeader title="Cobrança" />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="A vencer" value={aVencer.length} hint="mensalidades pendentes" />
          <Stat
            label="Atrasadas"
            value={atrasadas.length}
            tone="danger"
            hint={formatBRL(totalAtrasado)}
          />
          <Stat label="A renovar" value={aRenovar.length} tone="warn" hint="planos em até 15 dias" />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-6">
          <CobrancaTabs linhas={linhas} planos={planosComContagem} contratos={contratos} />
        </div>
      </Reveal>
    </>
  );
}
