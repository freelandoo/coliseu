import { CabecalhoEditorial, CartaoIndicador, PainelAngular } from "@/components/ui/editorial";

/**
 * Carregando: o layout final com cada valor trocado por uma barra cinza do
 * tamanho real (sem shimmer) — nada pula quando os dados chegam, e nenhum
 * número aparece antes de ser contado.
 */
export default function CarregandoAulaExperimental() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8" aria-busy="true">
      <CabecalhoEditorial
        categoria="Relacionamento / Aula experimental"
        titulo="Aula experimental"
        faixa="Da primeira visita ao próximo aluno"
        descricao={<span className="block h-4 w-72 max-w-full bg-surface-2" aria-hidden />}
      />
      <p className="sr-only" role="status">
        Carregando a agenda…
      </p>
      <section aria-label="Indicadores" className="grid gap-2 sm:grid-cols-3 sm:gap-4">
        <CartaoIndicador numero="01" rotulo="Agendadas no mês" periodo="mês do calendário" estado={{ tipo: "carregando" }} />
        <CartaoIndicador numero="02" rotulo="Visitas hoje" periodo="hoje" estado={{ tipo: "carregando" }} />
        <CartaoIndicador numero="03" rotulo="Próximos 7 dias" periodo="a partir de hoje" estado={{ tipo: "carregando" }} />
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(19rem,1fr)] lg:gap-6">
        <PainelAngular tom="papel" className="order-1 h-72 lg:order-2" aria-hidden>
          <span className="m-5 block h-9 w-48 bg-surface-2" />
        </PainelAngular>
        <PainelAngular tom="escuro" className="order-2 h-[28rem] lg:order-1" aria-hidden>
          <span className="m-5 block h-8 w-56 bg-surface-2" />
        </PainelAngular>
      </div>
    </div>
  );
}
