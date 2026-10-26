/**
 * Importa a planilha "Visitas + Experimental" (jun–out/2026) para
 * AulaExperimentalLegado — o registro de quem já fez aula antes do sistema.
 *
 * A planilha tem dados pessoais e fica fora do repositório. Converta antes o
 * .xlsx num JSON cru: [{ aba, linha, c: { "<cabeçalho>": valor } }] (datas
 * "AAAA-MM-DD"). Idempotente pela chave (aba, linha).
 *
 *   npx tsx scripts/importar-aulas-planilha.ts <planilha.json>            # prévia
 *   npx tsx scripts/importar-aulas-planilha.ts <planilha.json> --aplicar
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { ehDataISO, horaDaPlanilha, presencaDaPlanilha } from "../src/lib/aula-experimental";

type Linha = { aba: string; linha: number; c: Record<string, string | null> };

const [arquivo, flag] = process.argv.slice(2);
if (!arquivo) throw new Error("uso: importar-aulas-planilha.ts <planilha.json> [--aplicar]");
const aplicar = flag === "--aplicar";

const texto = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t && !/^[*?-]+$/.test(t) ? t : null;
};
const data = (v: string | null | undefined) => (ehDataISO(v ?? "") ? (v as string) : null);

const brutas = JSON.parse(readFileSync(arquivo, "utf8")) as Linha[];
const linhas = brutas
  .filter((r) => texto(r.c["Nome do Aluno"]) && r.c["Nome do Aluno"]!.trim() !== "Nome do Aluno")
  .map((r) => {
    const status = texto(r.c["Status"]);
    return {
      aba: r.aba.trim(),
      linha: r.linha,
      nome: r.c["Nome do Aluno"]!.trim().replace(/\s+/g, " "),
      telefone: (r.c["Fone"] ?? "").replace(/\D/g, ""),
      modalidade: texto(r.c["Modalidade"]),
      dataVisita: data(r.c["Visita / Atendimento"]),
      dataAula: data(r.c["Aula experimental"]),
      hora: horaDaPlanilha(r.c["Horario"]),
      presenca: presencaDaPlanilha(status),
      statusOriginal: status,
      canal: texto(r.c["Atendido Por: Visita/ Redes"]),
      atendente: texto(r.c["Atendente"]),
      comoConheceu: texto(r.c["Como conheceu?"]),
      andamento: texto(r.c["Andamento"]),
    };
  });

const comAula = linhas.filter((l) => l.dataAula);
console.log(
  `${linhas.length} linhas · ${comAula.length} com aula · veio ${comAula.filter((l) => l.presenca === "veio").length}` +
    ` · faltou ${comAula.filter((l) => l.presenca === "faltou").length} · sem status ${comAula.filter((l) => !l.presenca).length}` +
    ` · sem telefone ${linhas.filter((l) => !l.telefone).length}`,
);

async function gravar() {
  const prisma = new PrismaClient();
  let n = 0;
  for (const l of linhas) {
    const { aba, linha, ...dados } = l;
    await prisma.aulaExperimentalLegado.upsert({
      where: { aba_linha: { aba, linha } },
      create: l,
      update: dados,
    });
    n++;
  }
  console.log(`${n} linhas gravadas`);
  await prisma.$disconnect();
}

if (aplicar) {
  gravar().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.log("prévia — nada gravado (use --aplicar)");
}
