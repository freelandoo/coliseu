import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { LeadsFiltro } from "@/components/captacao/LeadsFiltro";
import { NovoCadastro } from "@/components/clientes/NovoCadastro";
import { listarLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CaptacaoPage() {
  const leads = await listarLeads();
  return (
    <>
      <Reveal>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <PageHeader
            step={1}
            title="Captação e Atendimento"
            subtitle="Leads de WhatsApp, redes, balcão e indicação entram no CRM, são qualificados pela recepção e avançam para matrícula ou lista de reativação."
          />
          <NovoCadastro />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <LeadsFiltro leads={leads} />
      </Reveal>
    </>
  );
}
