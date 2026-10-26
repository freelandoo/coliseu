import { NextResponse } from "next/server";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import { registrarAudit } from "@/lib/access/audit";
import { criarClienteFreelandoo } from "@/lib/freelandoo/cliente";
import { marcarChaveFreelandoo } from "@/lib/freelandoo/situacao";

/**
 * "Avisar professores" da aba Treinos: a Freelandoo reabre o modal da fila de
 * treinos para os professores da academia — na hora, para quem está com o app
 * aberto; na próxima entrada, para os outros.
 */
export async function POST() {
  const g = await exigirModuloApi("treinos");
  if (g.erro) return g.erro;

  const r = await criarClienteFreelandoo().avisarProfessores();
  if (!r.ok) {
    if (r.erro === "chave_invalida") await marcarChaveFreelandoo("invalida");
    const erro =
      r.erro === "sem_professor"
        ? "Nenhum professor cadastrado na academia da Freelandoo. Cadastre os professores lá primeiro."
        : r.erro === "nao_configurado"
          ? "A integração com a Freelandoo não está configurada."
          : r.erro === "chave_invalida"
            ? "A Freelandoo recusou a chave de parceiro do Coliseu."
            : "A Freelandoo não respondeu. Tente de novo em instantes.";
    return NextResponse.json({ erro }, { status: r.erro === "sem_professor" ? 409 : 502 });
  }

  await registrarAudit({
    actorType: "USER", actorId: g.user!.id, action: "FREELANDOO_AVISAR_PROFESSORES",
    entity: "IntegracaoFreelandoo", after: { ...r.dados },
  });
  return NextResponse.json(r.dados);
}
