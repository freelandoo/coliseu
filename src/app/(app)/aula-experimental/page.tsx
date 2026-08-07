import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { AulaExperimentalAbas } from "@/components/aula-experimental/AulaExperimentalAbas";
import { listarAulasExperimentais } from "@/lib/store";
import { hojeNaAcademia } from "@/lib/aula-experimental";
import { requireModulo } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * A agenda das visitas, em tela própria.
 *
 * Saiu de dentro da Captação porque não é a mesma leitura: lá se trabalha o
 * funil (quem é lead, em que estágio está), aqui se olha o relógio — quem vem
 * hoje, que dia ainda cabe gente. Era uma aba escondida atrás de outra tela e
 * virava consulta que ninguém fazia.
 */
export default async function AulaExperimentalPage() {
  await requireModulo("aula-experimental");
  const aulas = await listarAulasExperimentais();

  return (
    <>
      <Reveal>
        <PageHeader
          title="Aula experimental"
          subtitle="Calendário e visitas marcadas. Marcar continua sendo pela conversa do WhatsApp, no retrátil em cima da caixa de texto."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <AulaExperimentalAbas
          aulas={aulas}
          // O dia é do relógio da academia, não do servidor (UTC) nem do celular.
          hoje={hojeNaAcademia()}
        />
      </Reveal>
    </>
  );
}
