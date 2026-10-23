import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { ConectarWhatsapp } from "@/components/captacao/ConectarWhatsapp";
import { LeadsFiltro } from "@/components/captacao/LeadsFiltro";
import { listarAulasExperimentaisEntre, listarLeads, listarPlanos } from "@/lib/store";
import { hojeNaAcademia } from "@/lib/aula-experimental";
import { statusWhatsappLocal } from "@/lib/whatsapp/status";
import { requireModulo } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * O funil, e só ele. A agenda de aulas experimentais era a segunda aba daqui e
 * virou tela própria (/aula-experimental) — são leituras diferentes: aqui se
 * trabalha o estágio do lead, lá se olha o relógio.
 *
 * O que ficou dessa mudança é o aviso de quem vem hoje: quem abre a Captação de
 * manhã precisa saber que tem gente marcada, mesmo com a agenda morando noutra
 * tela.
 */
export default async function CaptacaoPage() {
  await requireModulo("captacao");
  // O dia é do relógio da academia, não do servidor (UTC) nem do celular.
  const hoje = hojeNaAcademia();
  // Para o aviso basta o dia de hoje — a agenda inteira mora em /aula-experimental.
  const [leads, planos, aulasDeHoje, whatsapp] = await Promise.all([
    listarLeads(),
    listarPlanos(),
    listarAulasExperimentaisEntre(hoje, hoje),
    statusWhatsappLocal(),
  ]);
  const aulasHoje = aulasDeHoje.length;

  return (
    <>
      <Reveal>
        <PageHeader title="Captação" acoes={<ConectarWhatsapp inicial={whatsapp} compacto />} />
      </Reveal>

      {aulasHoje > 0 && (
        <Reveal delay={0.03}>
          <Link
            href="/aula-experimental"
            className="mb-4 flex items-center gap-2 rounded-lg border border-brand/40 bg-brand-soft px-4 py-2.5 text-sm text-ink transition-colors hover:border-brand/60"
          >
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-brand px-1 text-xs font-semibold text-white">
              {aulasHoje}
            </span>
            <span>
              aula{aulasHoje > 1 ? "s" : ""} experimental{aulasHoje > 1 ? "is" : ""} marcada
              {aulasHoje > 1 ? "s" : ""} para hoje
            </span>
            <span className="ml-auto text-xs font-semibold text-destaque">Ver agenda →</span>
          </Link>
        </Reveal>
      )}

      <Reveal delay={0.05}>
        <LeadsFiltro leads={leads} planos={planos.filter((p) => p.ativo !== false)} />
      </Reveal>
    </>
  );
}
