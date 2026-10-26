import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/rbac";
import { contratoDoAluno } from "@/lib/contrato/contrato-aluno";
import { ContratoEditor } from "@/components/contrato/ContratoEditor";

export const dynamic = "force-dynamic";

/**
 * Contrato do aluno para conferir, editar e imprimir. Fora do layout do app
 * (sem menu) para a impressão sair só com o contrato; abre numa aba nova a
 * partir da ficha ("Ver contrato").
 */
export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulo("matriculados");
  const { id } = await params;
  const contrato = await contratoDoAluno(id);
  if (!contrato) notFound();
  return <ContratoEditor inicial={contrato} />;
}
