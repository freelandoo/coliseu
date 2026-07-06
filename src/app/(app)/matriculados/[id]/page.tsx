import { notFound } from "next/navigation";
import { Reveal } from "@/components/ui/Reveal";
import { FichaCliente } from "@/components/clientes/FichaCliente";
import { obterPessoa, planoPorId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MatriculadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pessoa = await obterPessoa(id);
  if (!pessoa) notFound();

  const plano = pessoa.planoId ? await planoPorId(pessoa.planoId) : undefined;

  return (
    <Reveal>
      <FichaCliente pessoa={pessoa} plano={plano} />
    </Reveal>
  );
}
