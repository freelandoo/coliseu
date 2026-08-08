import { Reveal } from "@/components/ui/Reveal";
import { AbasAtendimento } from "@/components/captacao/AbasAtendimento";
import { AtendimentoInbox } from "@/components/captacao/AtendimentoInbox";
import { ConectarWhatsapp } from "@/components/captacao/ConectarWhatsapp";
import { requireRole } from "@/lib/auth/rbac";
import { listarConversasRepo } from "@/lib/repositories/whatsapp";
import { statusWhatsappLocal } from "@/lib/whatsapp/status";

export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  const user = await requireRole(["ADMIN", "RECEPCAO"]);
  const [conversas, whatsapp] = await Promise.all([listarConversasRepo(), statusWhatsappLocal()]);

  return (
    <Reveal>
      {/* O cabeçalho vai como prop porque no mobile ele pertence à tela de lista:
          com uma conversa aberta, o inbox o esconde e fica só a conversa. */}
      <AtendimentoInbox
        inicial={conversas}
        assinatura={user.login}
        // Preferência de teclado da conta, não da máquina — a chave que a muda
        // fica logo abaixo deste título.
        enterEnviaInicial={user.enterEnvia}
        conectado={whatsapp.status === "CONNECTED"}
        podeResponder={user.role === "ADMIN" || user.role === "RECEPCAO"}
        podeApagar={user.role === "ADMIN"}
        cabecalho={
          /* Enxuto: título discreto, as abas e o indicador de conexão — assim o
             inbox sobe e a caixa de resposta cabe na tela. */
          <AbasAtendimento
            ativa="conversas"
            podeVerUso={user.role === "ADMIN"}
            acao={<ConectarWhatsapp inicial={whatsapp} compacto />}
          />
        }
      />
    </Reveal>
  );
}
