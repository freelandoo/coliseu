import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { TreinosView, type LinhaTreino } from "@/components/treinos/TreinosView";
import { requireModulo } from "@/lib/auth/rbac";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";
import { situacaoTreino } from "@/lib/freelandoo/rotulos";
import { listarPessoas } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Aba Treinos: quem precisa de treino novo na Freelandoo — vencido, vencendo
 * ou sem treino. A cópia local é a da sincronização de 10 em 10 minutos; quem
 * monta a ficha é o professor, lá (o modal da fila abre para ele ao entrar).
 * Matrícula cancelada fica de fora, como na fila de lá.
 */
export default async function TreinosPage() {
  await requireModulo("treinos");
  const pessoas = await listarPessoas(["aluno"]);
  const agora = new Date();

  const linhas: LinhaTreino[] = [];
  for (const p of pessoas) {
    if (!p.status || p.status === "cancelado") continue;
    const situacao = situacaoTreino(p.freelandoo, agora);
    if (!situacao) continue;
    linhas.push({
      id: p.id,
      nome: p.nome,
      fotoUrl: p.freelandoo?.fotoUrl,
      treinoNome: p.freelandoo?.treinoNome,
      treinoVenceEm: p.freelandoo?.treinoVenceEm,
      treinoValidadeDias: p.freelandoo?.treinoValidadeDias,
      situacao,
    });
  }
  // Mais urgente primeiro: o vencido há mais tempo, depois o que vence antes.
  linhas.sort(
    (a, b) =>
      (a.treinoVenceEm ? Date.parse(a.treinoVenceEm) : Infinity) -
        (b.treinoVenceEm ? Date.parse(b.treinoVenceEm) : Infinity) || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  return (
    <>
      <Reveal>
        <PageHeader title="Treinos" />
      </Reveal>
      <Reveal delay={0.03}>
        <TreinosView linhas={linhas} configurado={freelandooConfigurado()} />
      </Reveal>
    </>
  );
}
