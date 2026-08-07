/**
 * A outra metade da exportação: as listas.
 *
 * O PDF responde "como foi o mês"; a planilha responde "para quem eu mando
 * mensagem hoje". São públicos diferentes do mesmo relatório, então as duas
 * saídas nascem do mesmo objeto `Relatorio` — o que está no papel e o que está
 * na planilha nunca podem discordar.
 *
 * Cada relatório traz várias listas, e várias listas viram um .zip (o mesmo
 * caminho do kit do agente, em `lib/agent/kit.ts`): baixar cinco arquivos é
 * cinco cliques, e um deles sempre fica para trás.
 */

import JSZip from "jszip";
import type { Periodo } from "./periodo";
import type { Planilha, Relatorio, TipoRelatorio } from "./tipos";

/**
 * Separador ponto e vírgula e BOM no começo.
 *
 * Não é preferência: o Excel em português abre CSV com vírgula jogando a linha
 * inteira numa célula só, e sem o BOM come os acentos. O arquivo é para o dono
 * clicar duas vezes, não para importar num script.
 */
const SEPARADOR = ";";
const BOM = "﻿";

function celula(valor: string): string {
  const v = valor ?? "";
  if (v.includes(SEPARADOR) || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replaceAll('"', '""')}"`;
  }
  return v;
}

export function paraCsv(colunas: string[], linhas: string[][]): string {
  const corpo = [colunas, ...linhas]
    .map((linha) => linha.map(celula).join(SEPARADOR))
    .join("\r\n");
  return `${BOM}${corpo}\r\n`;
}

export function csvDaPlanilha(planilha: Planilha): string {
  return paraCsv(planilha.colunas, planilha.linhas);
}

/** "coliseu-marketing-2026-08-01-a-2026-08-07" — nome sem extensão. */
export function nomeBase(tipo: TipoRelatorio, periodo: Periodo): string {
  return `coliseu-${tipo}-${periodo.de}-a-${periodo.ate}`;
}

/**
 * Junta as listas num zip, com um LEIA-ME que diz de qual período e de qual
 * corte cada arquivo saiu — a planilha viaja solta por WhatsApp e daqui a duas
 * semanas ninguém lembra se aquela lista era de junho ou de julho.
 */
export async function planilhasEmZip(rel: Relatorio, periodo: Periodo): Promise<Buffer> {
  const zip = new JSZip();
  const base = nomeBase(rel.tipo, periodo);

  for (const planilha of rel.planilhas) {
    zip.file(`${base}-${planilha.nome}.csv`, csvDaPlanilha(planilha));
  }

  const leiame = [
    `${rel.titulo} — ${rel.periodo}`,
    `Gerado em ${rel.geradoEm} por ${rel.geradoPor}.`,
    "",
    "Arquivos:",
    ...rel.planilhas.map(
      (p) => `  ${base}-${p.nome}.csv — ${p.titulo} (${p.linhas.length} linha(s))`,
    ),
    "",
    "Como ler:",
    ...rel.observacoes.map((o) => `  - ${o}`),
    "",
    "Separador: ponto e vírgula. Codificação: UTF-8 com BOM (abre direto no Excel).",
    "Contém dados pessoais de alunos e leads — trate conforme a LGPD e não repasse.",
  ].join("\r\n");
  zip.file(`${base}-LEIA-ME.txt`, `${BOM}${leiame}\r\n`);

  return zip.generateAsync({ type: "nodebuffer" });
}
