import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { MatriculadosTabs } from "@/components/matriculados/MatriculadosTabs";
import { ClientesView } from "@/components/clientes/ClientesView";
import { listarPessoas, listarPlanos } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function MatriculadosPage() {
  const [todas, planos] = await Promise.all([listarPessoas(), listarPlanos()]);
  const pessoas = todas.filter((p) => p.fase === "aluno");

  return (
    <>
      <Reveal>
        <MatriculadosTabs />
      </Reveal>

      <Reveal>
        <PageHeader
          title="Matriculados"
          subtitle="Alunos matriculados na academia. Busque, filtre por situação e abra a ficha completa de cada um."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <ClientesView pessoas={pessoas} planos={planos} />
      </Reveal>
    </>
  );
}
