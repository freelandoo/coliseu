import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { renderizarRelatorioPdf } from "@/lib/relatorios/documento";
import { carregarDadosRelatorio } from "@/lib/relatorios/dados";
import { relatorioFinanceiro } from "@/lib/relatorios/financeiro";
import { relatorioMarketing } from "@/lib/relatorios/marketing";
import { ehPreset, resolverPeriodo } from "@/lib/relatorios/periodo";
import { nomeBase, planilhasEmZip } from "@/lib/relatorios/planilha";
import type { TipoRelatorio } from "@/lib/relatorios/tipos";

/**
 * Exportação dos relatórios — um documento por vez, marketing OU financeiro.
 *
 *   GET /api/relatorios/exportar?tipo=marketing&periodo=mes-anterior&formato=pdf
 *   GET /api/relatorios/exportar?tipo=financeiro&periodo=personalizado&de=…&ate=…&formato=planilha
 *
 * Só ADMIN, como o resto de Relatórios e Custos: o PDF traz faturamento, e o
 * .zip traz nome, telefone e situação de pagamento de aluno — sai do sistema
 * como arquivo e não volta atrás, então quem baixa é quem responde por ele.
 */

const TIPOS: TipoRelatorio[] = ["marketing", "financeiro"];

export async function GET(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;

  const params = new URL(req.url).searchParams;

  const tipo = params.get("tipo") as TipoRelatorio | null;
  if (!tipo || !TIPOS.includes(tipo)) {
    return NextResponse.json(
      { erro: "Informe tipo=marketing ou tipo=financeiro" },
      { status: 400 },
    );
  }

  const formato = params.get("formato") ?? "pdf";
  if (formato !== "pdf" && formato !== "planilha") {
    return NextResponse.json({ erro: "Formato deve ser pdf ou planilha" }, { status: 400 });
  }

  const preset = params.get("periodo");
  const periodo = resolverPeriodo(
    ehPreset(preset) ? preset : "mes-atual",
    { de: params.get("de"), ate: params.get("ate") },
  );

  const dados = await carregarDadosRelatorio();
  const ctx = { geradoPor: g.user.nome };
  const relatorio =
    tipo === "marketing"
      ? relatorioMarketing(dados, periodo, ctx)
      : relatorioFinanceiro(dados, periodo, ctx);

  const base = nomeBase(tipo, periodo);

  if (formato === "planilha") {
    const zip = await planilhasEmZip(relatorio, periodo);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdf = renderizarRelatorioPdf(relatorio);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${base}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
