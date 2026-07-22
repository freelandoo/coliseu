import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { CaptacaoTabs } from "@/components/captacao/CaptacaoTabs";
import { ConectarWhatsapp } from "@/components/captacao/ConectarWhatsapp";
import { LeadsFiltro } from "@/components/captacao/LeadsFiltro";
import { NovoCadastro } from "@/components/clientes/NovoCadastro";
import { listarLeads } from "@/lib/store";
import { contarNaoLidasRepo } from "@/lib/repositories/whatsapp";
import { statusWhatsappLocal } from "@/lib/whatsapp/status";

export const dynamic = "force-dynamic";

export default async function CaptacaoPage() {
  const [leads, whatsapp, naoLidas] = await Promise.all([
    listarLeads(),
    statusWhatsappLocal(),
    contarNaoLidasRepo(),
  ]);

  return (
    <>
      <Reveal>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            step={1}
            title="Captação e Atendimento"
            subtitle="Leads de WhatsApp, redes, balcão e indicação entram no CRM, são qualificados pela recepção e avançam para matrícula ou lista de reativação."
          />
          <div className="flex flex-wrap items-center gap-3">
            <ConectarWhatsapp inicial={whatsapp} />
            <NovoCadastro variante="secundaria" />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.03}>
        <div className="mb-5">
          <CaptacaoTabs naoLidas={naoLidas} />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <LeadsFiltro leads={leads} />
      </Reveal>
    </>
  );
}
