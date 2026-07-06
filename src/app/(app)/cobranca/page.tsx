import { Reveal } from "@/components/ui/Reveal";
import { PageHeader, Stat } from "@/components/ui/primitives";
import {
  CobrancaFiltro,
  type LinhaCobranca,
} from "@/components/cobranca/CobrancaFiltro";
import { diasEntre, formatBRL, formatData } from "@/lib/mock-data";
import { alunoPorId, listarAlunos, listarCobrancas, planoPorId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function CobrancaPage() {
  const alunos = listarAlunos();
  const cobrancas = listarCobrancas();
  // A) Cobrança: atrasadas (mais urgentes) + a vencer
  const atrasadas: LinhaCobranca[] = cobrancas
    .filter((c) => c.status === "atrasado")
    .map((c) => {
      const aluno = alunoPorId(c.alunoId);
      return {
        id: c.id,
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
      const aluno = alunoPorId(c.alunoId);
      return {
        id: c.id,
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
      nome: aluno.nome,
      telefone: aluno.telefone,
      detalhe: `${planoPorId(aluno.planoId)?.nome} · expira em ${dias}d`,
      categoria: "arenovar" as const,
      dias,
    }));

  const linhas = [...atrasadas, ...aVencer, ...aRenovar];
  const totalAtrasado = cobrancas
    .filter((c) => c.status === "atrasado")
    .reduce((s, c) => s + c.valor, 0);

  return (
    <>
      <Reveal>
        <PageHeader
          step={3}
          title="Cobrança e Renovação"
          subtitle="Avisos de vencimento, tratamento de inadimplência e renovação de planos perto de expirar — com cobrança ativa da recepção."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="A vencer" value={aVencer.length} hint="mensalidades pendentes" />
          <Stat
            label="Atrasadas"
            value={atrasadas.length}
            tone="red"
            hint={formatBRL(totalAtrasado)}
          />
          <Stat label="A renovar" value={aRenovar.length} tone="warn" hint="planos em até 15 dias" />
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-10">
          <CobrancaFiltro linhas={linhas} />
        </div>
      </Reveal>
    </>
  );
}
