"use client";

import {
  CobrancaFiltro,
  type LinhaCobranca,
} from "@/components/cobranca/CobrancaFiltro";
import {
  GestaoPlanos,
  type PlanoComContagem,
} from "@/components/cobranca/GestaoPlanos";
import { VencimentoMatriculas } from "@/components/cobranca/VencimentoMatriculas";
import { ListaAbas, PainelAba, useIdAbas, useParametroUrl } from "@/components/ui/Abas";
import { ABAS_COBRANCA, type AbaCobranca } from "@/lib/navegacao";

const ABAS: { chave: AbaCobranca; rotulo: string }[] = [
  { chave: "cobrancas", rotulo: "Cobranças" },
  { chave: "vencimentos", rotulo: "Vencimentos" },
  { chave: "planos", rotulo: "Planos" },
];

/**
 * A seção vai na URL (`?aba=vencimentos`): dá para voltar, recarregar e mandar
 * o link. Só o painel ativo monta — Vencimentos busca a prévia ao montar, e
 * passar o foco pela aba não deve disparar essa consulta.
 */
export function CobrancaTabs({
  linhas,
  planos,
}: {
  linhas: LinhaCobranca[];
  planos: PlanoComContagem[];
}) {
  const [aba, setAba] = useParametroUrl("aba", ABAS_COBRANCA, "cobrancas");
  const idBase = useIdAbas();

  return (
    <div className="flex flex-col gap-4">
      <ListaAbas rotulo="Seções da cobrança" abas={ABAS} ativa={aba} onAtivar={setAba} idBase={idBase} />
      <PainelAba idBase={idBase} chave={aba}>
        {aba === "cobrancas" && <CobrancaFiltro linhas={linhas} />}
        {aba === "vencimentos" && <VencimentoMatriculas />}
        {aba === "planos" && <GestaoPlanos planos={planos} />}
      </PainelAba>
    </div>
  );
}
