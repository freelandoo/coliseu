import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { CustosView } from "@/components/custos/CustosView";
import { listarDespesas, receitaRecorrente } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function CustosPage() {
  const [despesas, receita] = await Promise.all([listarDespesas(), receitaRecorrente()]);

  return (
    <>
      <Reveal>
        <PageHeader
          title="Custos e Lucro"
          subtitle="Lance as despesas da academia (luz, água, internet, aluguel…) e acompanhe o lucro do mês cruzando a receita recorrente com os custos lançados."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <CustosView despesas={despesas} receita={receita} />
      </Reveal>
    </>
  );
}
