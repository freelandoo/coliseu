import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { AulaExperimentalAbas } from "@/components/aula-experimental/AulaExperimentalAbas";
import { listarAulasExperimentais } from "@/lib/store";
import { ehDataISO, hojeNaAcademia } from "@/lib/aula-experimental";
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
export default async function AulaExperimentalPage({
  searchParams,
}: {
  /** `dia`: "AAAA-MM-DD" vindo da central — abre o calendário nesse dia. */
  searchParams: Promise<{ dia?: string | string[] }>;
}) {
  await requireModulo("aula-experimental");
  const { dia } = await searchParams;
  const pedido = Array.isArray(dia) ? dia[0] : dia;
  const aulas = await listarAulasExperimentais();
  const hoje = hojeNaAcademia();

  return (
    <>
      <Reveal>
        <PageHeader
          title="Aula experimental"
          subtitle="Visitas marcadas por dia. Para marcar, abra a conversa da pessoa no Atendimento e use “Aula experimental” — o envio da confirmação é sempre revisado antes."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <AulaExperimentalAbas
          aulas={aulas}
          // O dia é do relógio da academia, não do servidor (UTC) nem do celular.
          hoje={hoje}
          // Data inválida ou ausente: o calendário abre em hoje, como sempre.
          diaInicial={ehDataISO(pedido) ? pedido : hoje}
        />
      </Reveal>
    </>
  );
}
