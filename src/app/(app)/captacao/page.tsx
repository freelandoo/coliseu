import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { ConectarWhatsapp } from "@/components/captacao/ConectarWhatsapp";
import { LeadsFiltro } from "@/components/captacao/LeadsFiltro";
import { listarLeads, listarPlanos } from "@/lib/store";
import { statusWhatsappLocal } from "@/lib/whatsapp/status";

export const dynamic = "force-dynamic";

export default async function CaptacaoPage() {
  const [leads, planos, whatsapp] = await Promise.all([
    listarLeads(),
    listarPlanos(),
    statusWhatsappLocal(),
  ]);

  return (
    <>
      <Reveal>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <PageHeader step={1} title="Captação" />
          <ConectarWhatsapp inicial={whatsapp} compacto />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <LeadsFiltro leads={leads} planos={planos.filter((p) => p.ativo !== false)} />
      </Reveal>
    </>
  );
}
