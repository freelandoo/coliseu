import { notFound } from "next/navigation";
import { Reveal } from "@/components/ui/Reveal";
import { FichaCliente } from "@/components/clientes/FichaCliente";
import { obterPessoa, planoPorId } from "@/lib/store";
import { prisma } from "@/lib/db";
import { requireUser, podePapel, type Papel } from "@/lib/auth/rbac";
import type { AcessoDaPessoa } from "@/components/clientes/AcessoDoCadastro";
import { retornoDaFicha } from "@/lib/navegacao";

const umValor = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const dynamic = "force-dynamic";

export default async function MatriculadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /**
   * `de` (origem, por allowlist), `c` (conversa, quando veio do Atendimento) e
   * `faixa` (filtro da Retenção a restaurar na volta).
   */
  searchParams: Promise<{ de?: string | string[]; c?: string | string[]; faixa?: string | string[] }>;
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams]);
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
        retorno={retornoDaFicha(umValor(busca.de), umValor(busca.c), user.role as Papel, umValor(busca.faixa))}
      />
    </Reveal>
  );
}
