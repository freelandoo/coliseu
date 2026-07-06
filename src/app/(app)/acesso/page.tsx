import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { AcessoDashboard } from "@/components/acesso/AcessoDashboard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AcessoPage() {
  const [devices, pendentesBio, pendentesSync, comandos, eventos] = await Promise.all([
    prisma.accessDevice.findMany({ orderBy: { name: "asc" } }),
    prisma.person.count({ where: { fase: "aluno", credentials: { none: { status: "ENROLLED" } } } }),
    prisma.deviceUserMapping.count({ where: { syncStatus: { not: "IN_SYNC" } } }),
    prisma.deviceCommand.findMany({ where: { status: { in: ["PENDING", "DISPATCHED"] } }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.accessEvent.findMany({ take: 20, orderBy: { serverTime: "desc" }, include: { person: { select: { nome: true } } } }),
  ]);
  const dados = {
    devices: devices.map((d) => ({ id: d.id, name: d.name, status: d.status, firmware: d.firmware ?? "—", lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null })),
    pendentesBio, pendentesSync,
    comandos: comandos.map((c) => ({ id: c.id, type: c.type, status: c.status, createdAt: c.createdAt.toISOString() })),
    eventos: eventos.map((e) => ({ id: e.id, nome: e.person?.nome ?? "—", decision: e.decision, reason: e.reason ?? "", deviceTime: e.deviceTime.toISOString(), physicallyPassed: e.physicallyPassed })),
  };
  return (
    <>
      <Reveal>
        <PageHeader step={5} title="Controle de Acesso" subtitle="Catracas, sincronização, comandos pendentes e acessos recentes." />
      </Reveal>
      <Reveal delay={0.05}>
        <AcessoDashboard dados={dados} />
      </Reveal>
    </>
  );
}
