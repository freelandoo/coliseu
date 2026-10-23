import { requireModulo } from "@/lib/auth/rbac";

/**
 * Guard de toda a área de alunos (lista, ficha, matrícula, retenção,
 * fidelidade). Esconder o link no menu não basta: sem isto o técnico abria
 * qualquer uma digitando o endereço.
 */
export default async function MatriculadosLayout({ children }: { children: React.ReactNode }) {
  await requireModulo("matriculados");
  return children;
}
