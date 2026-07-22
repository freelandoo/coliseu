import { prisma } from "@/lib/db";
import { requireUser, podePapel, type Papel } from "@/lib/auth/rbac";
import { kitDisponivel, kitInfo } from "@/lib/agent/kit";
import { Badge, Card } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { AlterarSenhaCard } from "@/components/perfil/AlterarSenhaCard";
import { AgentKitCard } from "@/components/perfil/AgentKitCard";
import { ColaboradoresCard } from "@/components/perfil/ColaboradoresCard";
import { BotaoSair } from "@/components/perfil/BotaoSair";
import { listarColaboradoresRepo } from "@/lib/repositories/colaboradores";

export const dynamic = "force-dynamic";

const PAPEL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  RECEPCAO: "Recepção",
  TECNICO: "Técnico",
};

export default async function PerfilPage() {
  const user = await requireUser();
  const isAdmin = podePapel(user.role as Papel, ["ADMIN"]);

  const [unit, devices, colaboradores] = await Promise.all([
    prisma.unit.findUnique({ where: { id: user.unitId }, select: { nome: true } }),
    isAdmin
      ? prisma.accessDevice.findMany({
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    isAdmin ? listarColaboradoresRepo() : Promise.resolve([]),
  ]);

  return (
    <>
      <Reveal>
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-widest text-red-bright">
            Conta
          </p>
          <h1 className="mt-1 font-display text-4xl font-semibold uppercase tracking-wide text-ink">
            Perfil
          </h1>
          <p className="mt-1 text-sm text-muted">
            Seus dados de acesso e as ferramentas da sua conta.
          </p>
        </header>
      </Reveal>

      <div className="flex max-w-2xl flex-col gap-4">
        <Reveal delay={0.05}>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
                {user.nome}
              </h3>
              <Badge tone="red">{PAPEL_LABEL[user.role] ?? user.role}</Badge>
            </div>
            <p className="mt-1.5 text-sm text-muted">{user.email ?? `login: ${user.login}`}</p>
            {unit && <p className="mt-1 text-xs text-faint">Unidade: {unit.nome}</p>}

            {/* Sair fica aqui, no cartão da conta: é a única saída do sistema —
                o balcão é compartilhado e a troca de turno precisa dela. */}
            <div className="mt-4 border-t border-border pt-4">
              <BotaoSair />
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <AlterarSenhaCard />
        </Reveal>

        {isAdmin && (
          <Reveal delay={0.12}>
            <ColaboradoresCard iniciais={colaboradores} meuId={user.id} />
          </Reveal>
        )}

        {isAdmin && (
          <Reveal delay={0.15}>
            <AgentKitCard
              kitDisponivel={kitDisponivel()}
              kitInfo={kitInfo()}
              tokenConfigurado={Boolean(process.env.AGENT_TOKEN)}
              devices={devices}
            />
          </Reveal>
        )}
      </div>
    </>
  );
}
