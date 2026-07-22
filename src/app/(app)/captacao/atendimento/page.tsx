import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { AtendimentoInbox } from "@/components/captacao/AtendimentoInbox";
import { CaptacaoTabs } from "@/components/captacao/CaptacaoTabs";
import { ConectarWhatsapp } from "@/components/captacao/ConectarWhatsapp";
import { requireRole } from "@/lib/auth/rbac";
import { contarNaoLidasRepo, listarConversasRepo } from "@/lib/repositories/whatsapp";
import { statusWhatsappLocal } from "@/lib/whatsapp/status";

export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  const user = await requireRole(["ADMIN", "RECEPCAO"]);
  const [conversas, whatsapp, naoLidas] = await Promise.all([
    listarConversasRepo(),
    statusWhatsappLocal(),
    contarNaoLidasRepo(),
  ]);

  return (
    <>
      <Reveal>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            step={1}
            title="Atendimento no WhatsApp"
            subtitle="Toda conversa recebida vira lead e fica registrada aqui. A resposta é sempre manual — nada é respondido automaticamente."
          />
          <ConectarWhatsapp inicial={whatsapp} />
        </div>
      </Reveal>

      <Reveal delay={0.03}>
        <div className="mb-5">
          <CaptacaoTabs naoLidas={naoLidas} />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <AtendimentoInbox
          inicial={conversas}
          conectado={whatsapp.status === "CONNECTED"}
          podeResponder={user.role === "ADMIN" || user.role === "RECEPCAO"}
          podeApagar={user.role === "ADMIN"}
        />
      </Reveal>
    </>
  );
}
