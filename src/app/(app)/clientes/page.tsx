import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { ClientesView } from "@/components/clientes/ClientesView";
import { listarPessoas } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const pessoas = await listarPessoas();

  return (
    <>
      <Reveal>
        <PageHeader
          title="Clientes"
          subtitle="Cadastro único de cada pessoa — do primeiro contato como lead até virar aluno. Busque, filtre por situação e abra a ficha completa."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <ClientesView pessoas={pessoas} />
      </Reveal>
    </>
  );
}
