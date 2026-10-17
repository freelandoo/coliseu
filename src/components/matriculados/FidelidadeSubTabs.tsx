import { SubnavRota } from "@/components/ui/SubnavRota";
import { SECOES_FIDELIDADE } from "@/lib/navegacao";

export function FidelidadeSubTabs() {
  return <SubnavRota rotulo="Seções de Fidelidade" secoes={SECOES_FIDELIDADE} variante="segmentos" />;
}
