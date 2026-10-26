import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import { AsaasError, carneDoParcelamento } from "@/lib/asaas";

type Ctx = { params: Promise<{ id: string }> };

/** Carnê (PDF com todos os boletos) do boleto parcelado ativo — para imprimir no balcão. */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados");
  if (g.erro) return g.erro;
  const { id } = await params;

  const parcelamento = await prisma.billingSubscription.findFirst({
    where: { customer: { personId: id }, cycle: "INSTALLMENT", status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!parcelamento) {
    return NextResponse.json({ erro: "Nenhum boleto parcelado ativo" }, { status: 404 });
  }
  try {
    const pdf = await carneDoParcelamento(parcelamento.asaasSubscriptionId);
    if (!pdf) {
      return NextResponse.json({ erro: "Carnê só existe com o Asaas configurado" }, { status: 404 });
    }
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="carne-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[carne]", e);
    return NextResponse.json(
      { erro: e instanceof AsaasError ? e.message : "Falha ao baixar o carnê no Asaas" },
      { status: 502 },
    );
  }
}
