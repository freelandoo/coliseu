import { Reveal } from "@/components/ui/Reveal";
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
    <Reveal>
      {/* O cabeçalho vai como prop porque no mobile ele pertence à tela de lista:
          com uma conversa aberta, o inbox o esconde e fica só a conversa. */}
      <AtendimentoInbox
        inicial={conversas}
        conectado={whatsapp.status === "CONNECTED"}
        podeResponder={user.role === "ADMIN" || user.role === "RECEPCAO"}
        podeApagar={user.role === "ADMIN"}
        cabecalho={
          /* Enxuto: sem headline nem descrição, só as abas e o indicador de
             conexão — assim o inbox sobe e a caixa de resposta cabe na tela. */
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <CaptacaoTabs naoLidas={naoLidas} />
            <ConectarWhatsapp inicial={whatsapp} compacto />
          </div>
        }
      />
    </Reveal>
  );
}
