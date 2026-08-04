import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { ConectarWhatsapp } from "@/components/captacao/ConectarWhatsapp";
import { CaptacaoAbas } from "@/components/captacao/CaptacaoAbas";
import { listarAulasExperimentais, listarLeads, listarPlanos } from "@/lib/store";
import { hojeNaAcademia } from "@/lib/aula-experimental";
import { statusWhatsappLocal } from "@/lib/whatsapp/status";

export const dynamic = "force-dynamic";

export default async function CaptacaoPage() {
  const [leads, planos, aulas, whatsapp] = await Promise.all([
    listarLeads(),
    listarPlanos(),
    listarAulasExperimentais(),
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
        <CaptacaoAbas
          leads={leads}
          planos={planos.filter((p) => p.ativo !== false)}
          aulas={aulas}
          // O dia é do relógio da academia, não do servidor (UTC) nem do celular.
          hoje={hojeNaAcademia()}
        />
      </Reveal>
    </>
  );
}
