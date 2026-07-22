import { instanciaAtualRepo } from "@/lib/repositories/whatsapp";
import { configEvolution } from "@/lib/whatsapp/evolution";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
import type { WhatsappStatus } from "@/lib/types";

export interface StatusWhatsapp {
  configurado: boolean;
  existe: boolean;
  status: WhatsappStatus;
  numero: string;
}

/**
 * Status para a renderização inicial da página: lê só o banco, sem ir à
 * Evolution — a página não pode esperar rede externa. O componente cliente
 * reconcilia com a Evolution logo após montar.
 */
export async function statusWhatsappLocal(): Promise<StatusWhatsapp> {
  const cfg = configEvolution();
  const instancia = await instanciaAtualRepo();
  return {
    configurado: !!cfg,
    existe: !!instancia,
    status: instancia?.status ?? "DISCONNECTED",
    numero: formatarTelefone(instancia?.numeroConectado),
  };
}
