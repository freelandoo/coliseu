import { SubnavRota } from "@/components/ui/SubnavRota";
import { SECOES_ALUNOS } from "@/lib/navegacao";

/** Seções de Alunos — lista, matrículas/renovações, retenção e fidelidade. */
export function MatriculadosTabs() {
  return <SubnavRota rotulo="Seções de Alunos" secoes={SECOES_ALUNOS} />;
}
