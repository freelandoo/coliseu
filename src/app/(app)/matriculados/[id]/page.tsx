import { notFound } from "next/navigation";
import { Reveal } from "@/components/ui/Reveal";
import { FichaCliente } from "@/components/clientes/FichaCliente";
import { obterPessoa, planoPorId } from "@/lib/store";
import { prisma } from "@/lib/db";
import { requireUser, podePapel, type Papel } from "@/lib/auth/rbac";
import type { AcessoDaPessoa } from "@/components/clientes/AcessoDoCadastro";

export const dynamic = "force-dynamic";

export default async function MatriculadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, pessoa] = await Promise.all([requireUser(), obterPessoa(id)]);
  if (!pessoa) notFound();

  const isAdmin = podePapel(user.role as Papel, ["ADMIN"]);
  const [plano, acesso] = await Promise.all([
    pessoa.planoId ? planoPorId(pessoa.planoId) : Promise.resolve(undefined),
    isAdmin
      ? prisma.user.findUnique({
          where: { personId: id },
          select: { id: true, login: true, role: true, ativo: true, senhaProvisoria: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <Reveal>
      <FichaCliente
        pessoa={pessoa}
        plano={plano}
        podeGerirAcesso={isAdmin}
        acesso={(acesso as AcessoDaPessoa | null) ?? undefined}
      />
    </Reveal>
  );
}
