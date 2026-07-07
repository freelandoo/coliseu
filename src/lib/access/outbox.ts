import { evaluateAccessEligibility } from "@/lib/access/policy";
import { carregarContextoAcesso } from "@/lib/access/context";
import { enfileirarComandoAcesso } from "@/lib/repositories/access";

/** Reavalia o acesso de uma pessoa e enfileira ENABLE/DISABLE por device mapeado. */
export async function recalcularAcessoDePessoa(personId: string): Promise<void> {
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
