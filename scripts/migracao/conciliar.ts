/**
 * Conciliação da migração CloudGym → Coliseu (Task 5) — SÓ GERA RELATÓRIO.
 *
 * Uso:  npx tsx scripts/migracao/conciliar.ts
 *
 * Lê os exports de `usuarios/` (fora do git — biometria/LGPD) e escreve em
 * `usuarios/migracao/`:
 *   - conciliacao.json      → entrada da adoção (Task 6)
 *   - resumo.txt            → visão executiva
 *   - revisao-recepcao.csv  → planilha para revisar com quem conhece os alunos
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseCloudGym, type AlunoCloudGym } from "../../src/lib/migracao/cloudgym";
import { conciliar, type UsuarioDevice } from "../../src/lib/migracao/conciliar";
import { normalizarCpf, normalizarNome } from "../../src/lib/migracao/normalizar";

const RAIZ = resolve(__dirname, "../..");
const DIR_USUARIOS = resolve(RAIZ, "usuarios");
const DIR_SAIDA = resolve(DIR_USUARIOS, "migracao");
const ARQ_DEVICE = resolve(DIR_USUARIOS, "control id/Coliseu/Coliseu/controlid-export/controlid-users.json");
const ARQ_ATIVOS = resolve(DIR_USUARIOS, "couldgym/alunos1.csv");
const ARQ_INATIVOS = resolve(DIR_USUARIOS, "couldgym/alunosinativos.csv");

/** Órfão "recente" = passou na catraca em 2026. */
const ACESSO_RECENTE_DESDE = Date.UTC(2026, 0, 1) / 1000;

function dataDe(epoch: number): string {
  return epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : "";
}

async function pessoasDoColiseu(): Promise<{ id: string; cpf: string }[]> {
  try {
    const { prisma } = await import("../../src/lib/db");
    const rows = await prisma.person.findMany({ select: { id: true, cpf: true } });
    await prisma.$disconnect();
    return rows.map((r) => ({ id: r.id, cpf: normalizarCpf(r.cpf) })).filter((r) => r.cpf);
  } catch {
    console.warn("aviso: banco do Coliseu inacessível — conciliando sem Persons existentes");
    return [];
  }
}

function csvCampo(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Levenshtein ciente do curinga: substituir envolvendo `#` (acento perdido no
 * export) custa 0. Pega typos de digitação no aparelho ("henrrique", "parecida").
 */
function distancia(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] || a[i - 1] === "#" || b[j - 1] === "#" ? 0 : 1;
      atual[j] = Math.min(prev[j] + 1, atual[j - 1] + 1, prev[j - 1] + custo);
    }
    prev = atual;
  }
  return prev[n];
}

/**
 * Sugestão automática para órfão — SÓ DICA para a revisão humana, nunca adoção:
 *  - id negativo + nome curto → provável staff cadastrado à mão no aparelho;
 *  - typo: distância ≤2 (com folga p/ nomes longos) e única no melhor candidato;
 *  - primeiro+último nome iguais e únicos (abrevia/omite nome do meio).
 */
function sugerirParaOrfao(nomeNormDevice: string, idDevice: number, alunos: AlunoCloudGym[]): string {
  if (idDevice < 0 && nomeNormDevice.split(" ").length <= 2) {
    return "provável STAFF (cadastro manual no aparelho — id negativo)";
  }
  let melhor: AlunoCloudGym | null = null;
  let d1 = 99, d2 = 99;
  for (const a of alunos) {
    const d = distancia(nomeNormDevice, a.nomeNorm);
    if (d < d1) { d2 = d1; d1 = d; melhor = a; }
    else if (d < d2) { d2 = d; }
  }
  const limite = nomeNormDevice.length >= 20 ? 3 : 2;
  if (melhor && d1 <= limite && d1 < d2) {
    return `TYPO? distância ${d1}: ${melhor.nome} (${melhor.status})`;
  }

  // Nome do meio omitido/abreviado: TODOS os nomes do lado mais curto precisam
  // aparecer, na ordem, no lado mais longo (conectivos fora). "João Silva" casa
  // "João Pedro Silva"; "Maria Rafaela P. Silva" NÃO casa "Maria Clara B. Silva".
  const tokensDevice = tokensSignificativos(nomeNormDevice);
  if (tokensDevice.length >= 2) {
    const candidatos = alunos.filter((a) => {
      const t = tokensSignificativos(a.nomeNorm);
      const [curto, longo] = tokensDevice.length <= t.length ? [tokensDevice, t] : [t, tokensDevice];
      return curto.length >= 2 && curto.length < longo.length && ehSubsequencia(curto, longo);
    });
    if (candidatos.length === 1) {
      return `NOME DO MEIO? ${candidatos[0].nome} (${candidatos[0].status})`;
    }
  }
  return "";
}

const CONECTIVOS = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "D"]);

function tokensSignificativos(nomeNorm: string): string[] {
  return nomeNorm.split(" ").filter((t) => t && !CONECTIVOS.has(t));
}

function ehSubsequencia(curto: string[], longo: string[]): boolean {
  let j = 0;
  for (const token of longo) {
    if (j < curto.length && (token === curto[j] || token[0] === "#" || curto[j][0] === "#")) j++;
  }
  return j === curto.length;
}

async function main() {
  for (const arq of [ARQ_DEVICE, ARQ_ATIVOS, ARQ_INATIVOS]) {
    if (!existsSync(arq)) throw new Error(`export não encontrado: ${arq}`);
  }

  const brutoDevice = JSON.parse(readFileSync(ARQ_DEVICE, "utf8")) as {
    users: { id: number; registration: string; name: string; image_timestamp: number; last_access: number }[];
  };
  const device: UsuarioDevice[] = brutoDevice.users.map((u) => ({
    id: u.id,
    registration: (u.registration ?? "").trim(),
    name: u.name,
    nomeNorm: normalizarNome(u.name),
    imageTimestamp: u.image_timestamp,
    lastAccess: u.last_access,
  }));

  const ativos = parseCloudGym(readFileSync(ARQ_ATIVOS, "utf8"), "ATIVO");
  const inativos = parseCloudGym(readFileSync(ARQ_INATIVOS, "utf8"), "INATIVO");
  const alunos: AlunoCloudGym[] = [...ativos.alunos, ...inativos.alunos];
  const avisos = [...ativos.avisos, ...inativos.avisos];

  const pessoas = await pessoasDoColiseu();
  const r = conciliar(device, alunos, pessoas, ACESSO_RECENTE_DESDE);

  mkdirSync(DIR_SAIDA, { recursive: true });
  writeFileSync(resolve(DIR_SAIDA, "conciliacao.json"), JSON.stringify({
    geradoEm: new Date().toISOString(),
    fontes: { device: ARQ_DEVICE, ativos: ARQ_ATIVOS, inativos: ARQ_INATIVOS },
    avisosDeParse: avisos,
    resumo: r.resumo,
    itens: r.itens,
    semFace: r.semFace,
  }, null, 2));

  // Planilha de revisão: tudo que NÃO é adoção automática, em ordem de urgência
  // (quem ainda passa na catraca primeiro). Separador ";" + BOM = Excel pt-BR.
  const linhas = [
    ["situacao", "id_no_aparelho", "nome_no_aparelho", "ultimo_acesso", "casou_com", "status_cloudgym", "motivo", "sugestao_automatica", "decisao_da_recepcao"].join(";"),
  ];
  const pendentes = r.itens
    .filter((i) => i.situacao !== "ADOTAR")
    .sort((a, b) => b.device.lastAccess - a.device.lastAccess);
  let sugestoes = 0;
  for (const i of pendentes) {
    const sugestao = i.situacao === "ORFAO" ? sugerirParaOrfao(i.device.nomeNorm, i.device.id, alunos) : "";
    if (sugestao) sugestoes++;
    linhas.push([
      i.situacao, i.device.id, csvCampo(i.device.name.trim()), dataDe(i.device.lastAccess),
      csvCampo(i.aluno?.nome ?? ""), i.aluno?.status ?? "", csvCampo(i.motivo), csvCampo(sugestao), "",
    ].join(";"));
  }
  for (const a of r.semFace) {
    linhas.push(["SEM_FACE", "", csvCampo(a.nome), "", "", a.status, "ativo no CloudGym sem face cadastrada no aparelho", "", ""].join(";"));
  }
  writeFileSync(resolve(DIR_SAIDA, "revisao-recepcao.csv"), "﻿" + linhas.join("\r\n"), "utf8");

  const s = r.resumo;
  const resumo = [
    `Conciliação CloudGym → Coliseu — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `${s.totalDevice} usuários no aparelho | ${alunos.filter((a) => a.status !== "INATIVO").length} ativos no CloudGym | ${pessoas.length} Persons com CPF no Coliseu`,
    `── ${s.adotar} ADOTAR (nome exato e único)`,
    `── ${s.revisar} REVISAR (curinga de acento ou inativo com face)`,
    `── ${s.ambiguos} AMBÍGUOS (nunca casar no automático)`,
    `── ${s.orfaos} ÓRFÃOS no aparelho — ${s.orfaosComAcessoRecente} passaram na catraca em 2026 (prioridade!)`,
    `   └─ ${sugestoes} órfãos com sugestão automática na planilha (typo/staff/nome do meio)`,
    `── ${s.cloudGymSemFace} ativos no CloudGym sem face (recadastro de face quando aparecerem)`,
    ``,
    `avisos de parse: ${avisos.length}`,
    `Próximo passo: revisar usuarios/migracao/revisao-recepcao.csv com a recepção,`,
    `preencher a coluna "decisao_da_recepcao" e rodar a adoção (Task 6).`,
  ].join("\n");
  writeFileSync(resolve(DIR_SAIDA, "resumo.txt"), resumo, "utf8");
  console.log(resumo);
}

main().catch((e) => { console.error(e); process.exit(1); });
