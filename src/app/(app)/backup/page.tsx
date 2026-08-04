import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { BackupView } from "@/components/backup/BackupView";
import { requireDesenvolvedor } from "@/lib/auth/rbac";
import { listarBackupsRepo } from "@/lib/repositories/whatsapp-backup";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  await requireDesenvolvedor();
  const backups = await listarBackupsRepo();

  return (
    <>
      <Reveal>
        <PageHeader
          title="Backup de conversas"
          subtitle="Tudo que o atendimento limpou ou removeu fica guardado aqui e pode voltar."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <BackupView inicial={backups} />
      </Reveal>
    </>
  );
}
