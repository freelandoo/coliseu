import { Reveal } from "@/components/ui/Reveal";
import { AbasAtendimento } from "@/components/captacao/AbasAtendimento";
import { UsoPainel } from "@/components/captacao/UsoPainel";
import { requireRole } from "@/lib/auth/rbac";
import { indicadoresUsoRepo } from "@/lib/repositories/uso";
import { ehPeriodo } from "@/lib/uso";

export const dynamic = "force-dynamic";

/**
 * Quadro de uso do atendimento: quanto cada colaborador respondeu, classificou,
 * marcou e fechou no período — e quanto tempo ficou no sistema.
 *
 * Só ADMIN entra. É a tela que compara colaboradores entre si; num balcão
 * compartilhado, deixá-la à mão de quem está sendo medido transforma o quadro
 * em placar. Para abrir à recepção, basta somar "RECEPCAO" aqui e no
 * `podeVerUso` da aba.
 */
export default async function AtendimentoUsoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { periodo } = await searchParams;
  const dados = await indicadoresUsoRepo(ehPeriodo(periodo) ? periodo : "hoje");

  return (
    <Reveal>
      <AbasAtendimento ativa="uso" podeVerUso />
      <UsoPainel dados={dados} />
    </Reveal>
  );
}
