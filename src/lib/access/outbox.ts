import { evaluateAccessEligibility } from "@/lib/access/policy";
import { carregarContextoAcesso } from "@/lib/access/context";
import { provisionarAcessoDePessoa } from "@/lib/access/provision";
import { enfileirarComandoAcesso } from "@/lib/repositories/access";

/** Reavalia o acesso de uma pessoa e enfileira ENABLE/DISABLE por device mapeado. */
export async function recalcularAcessoDePessoa(personId: string): Promise<void> {
  // Auto-provisiona aluno ainda sem vínculo com as catracas (cobre a base que
  // existia antes da Fase 6 no primeiro pagamento/recalculo). Idempotente.
  await provisionarAcessoDePessoa(personId);
  const { ctx, mappings } = await carregarContextoAcesso(personId);

  const decisao = evaluateAccessEligibility(ctx);
  if (decisao.reason === "CORTESIA") return; // cortesia = decisão online por giro, não ENABLE durável
  const tipo = decisao.allow ? "ENABLE" : "DISABLE";

  for (const m of mappings) {
    await enfileirarComandoAcesso({
      deviceId: m.deviceId, personId, type: tipo,
      payload: { externalUserId: m.externalUserId, reason: decisao.reason },
    });
  }
}
