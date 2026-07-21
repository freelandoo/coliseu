/**
 * One-off (2026-07-20): monta o fragmento de conciliação dos 19 órfãos que
 * casaram no automático na revisita dos 263 (typo/subseq/exato contra o export
 * "info coliseu"). Reconstrói o `aluno` completo a partir da melhor fonte de
 * cada match e grava usuarios/migracao/conciliacao-19.json no mesmo shape que
 * scripts/migracao/adotar.ts consome.
 *
 * Fontes por match (coluna matchFonte do CSV): ativos/inativos (dados completos),
 * contratos (nome+plano+data), pagamentos (nome+valor+vencido — sem plano/datas),
 * audiencia (lead). Os fracos entram com plano placeholder e são sinalizados.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCloudGym, type AlunoCloudGym } from "../../src/lib/migracao/cloudgym";
import { normalizarNome, dataBRparaISO, normalizarCpf } from "../../src/lib/migracao/normalizar";
import type { ItemConciliacao } from "../../src/lib/migracao/conciliar";

const U = resolve(__dirname, "../../usuarios");
const NOVO = resolve(U, "info coliseu/info coliseu");
const rd = (p: string) => readFileSync(p, "utf8");

// pool de alunos completos, indexado por nome normalizado (melhor status vence)
const rank: Record<string, number> = { ATIVO: 5, BLOQUEADO: 4, AUSENTE: 3, INATIVO: 0 };
const porNome = new Map<string, AlunoCloudGym>();
function add(csv: string, statusPadrao: "ATIVO" | "INATIVO") {
  for (const a of parseCloudGym(csv, statusPadrao).alunos) {
    const atual = porNome.get(a.nomeNorm);
    if (!atual || (rank[a.status] ?? 1) > (rank[atual.status] ?? 1)) porNome.set(a.nomeNorm, a);
  }
}
add(rd(resolve(NOVO, "clientes/ativos/csv.csv")), "ATIVO");
add(rd(resolve(NOVO, "clientes/inativos/csv.csv")), "INATIVO");

// contratos: Nome,Plano,Data,Email,Celular  → aluno ATIVO com plano
function parseSimples(csv: string): string[][] {
  return csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => {
    const m = [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((x) => x[1].replace(/""/g, '"'));
    return m;
  });
}
const contratos = new Map<string, { plano: string; data: string; email: string; cel: string }>();
for (const r of parseSimples(rd(resolve(NOVO, "contratos/csv.csv"))).slice(1)) {
  if (r[0]) contratos.set(normalizarNome(r[0]), { plano: r[1] || "", data: r[2] || "", email: r[3] || "", cel: r[4] || "" });
}
// pagamentos: Nome,Email,Celular,Forma,Vencido,UltimaFreq,Valor
const pagamentos = new Map<string, { email: string; cel: string; vencido: string }>();
for (const r of parseSimples(rd(resolve(NOVO, "pagamentos/csv.csv"))).slice(1)) {
  if (r[0]) pagamentos.set(normalizarNome(r[0]), { email: r[1] || "", cel: r[2] || "", vencido: r[4] || "" });
}
// audiencia: ID,Nome,Tipo,Data,Celular,Email,Status...
const audiencia = new Map<string, { cel: string; email: string }>();
for (const r of parseSimples(rd(resolve(NOVO, "audiencia/csv.csv"))).slice(1)) {
  if (r[1]) audiencia.set(normalizarNome(r[1]), { cel: r[4] || "", email: r[5] || "" });
}

function alunoPlaceholder(nome: string, extra: Partial<AlunoCloudGym>): AlunoCloudGym {
  return {
    nome, nomeNorm: normalizarNome(nome), status: "ATIVO", cpf: "", rg: "", vendedor: "",
    email: "", celular: "", plano: "", inicioISO: null, fimISO: null, nascimentoISO: null,
    estado: "", cidade: "", cep: "", ...extra,
  };
}

// carrega os 19 matches do CSV de decisão
const dec = parseSimples(rd(resolve(U, "migracao/orfaos-263-decisao.csv")));
const cols = dec[0];
const idx = (c: string) => cols.indexOf(c);
const linhas = dec.slice(1).filter((r) => r[idx("decisao")] === "ADOTAR");

const itens: ItemConciliacao[] = [];
const avisos: string[] = [];
for (const r of linhas) {
  const deviceId = Number(r[idx("deviceId")]);
  const nomeDevice = r[idx("nomeDevice")];
  const matchNome = r[idx("matchNome")];
  const via = r[idx("via")];
  const fonte = r[idx("matchFonte")];
  const nn = normalizarNome(matchNome);

  let aluno = porNome.get(nn) ?? null;
  if (!aluno) {
    const c = contratos.get(nn);
    const p = pagamentos.get(nn);
    const a = audiencia.get(nn);
    if (c) {
      aluno = alunoPlaceholder(matchNome, { plano: c.plano, email: c.email, celular: c.cel, inicioISO: dataBRparaISO(c.data) });
      avisos.push(`${matchNome}: só em CONTRATOS — sem CPF/vencimento, membership nasce sem data Final`);
    } else if (p) {
      aluno = alunoPlaceholder(matchNome, { email: p.email, celular: p.cel, fimISO: dataBRparaISO(p.vencido) });
      avisos.push(`${matchNome}: só em PAGAMENTOS (vencido) — sem plano, entra com plano placeholder; vencimento=${p.vencido || "hoje"}`);
    } else if (a) {
      aluno = alunoPlaceholder(matchNome, { email: a.email, celular: a.cel });
      avisos.push(`${matchNome}: só em AUDIENCIA (lead convertido) — sem plano/CPF/datas`);
    }
  }
  if (!aluno) { avisos.push(`${matchNome}: NÃO reconstruído — pulado`); continue; }

  // device: recupera imageTimestamp/lastAccess do conciliacao.json original
  itens.push({
    device: { id: deviceId, registration: "", name: nomeDevice, nomeNorm: normalizarNome(nomeDevice), imageTimestamp: 0, lastAccess: 0 },
    aluno,
    personIdExistente: null,
    via: via.startsWith("EXATO") ? "NOME_EXATO" : "NOME_CURINGA",
    confianca: "MEDIA",
    situacao: "ADOTAR",
    motivo: `revisita 263 (${via}) — conferido, adotar`,
  } as ItemConciliacao);
}

// re-hidrata imageTimestamp/lastAccess do device a partir do conciliacao.json original
const orig = JSON.parse(rd(resolve(U, "migracao/conciliacao.json"))) as { itens: ItemConciliacao[] };
const porDeviceId = new Map(orig.itens.map((i) => [i.device.id, i.device]));
for (const it of itens) {
  const d = porDeviceId.get(it.device.id);
  if (d) { it.device.imageTimestamp = d.imageTimestamp; it.device.lastAccess = d.lastAccess; it.device.name = d.name; it.device.nomeNorm = d.nomeNorm; }
}

const saida = { geradoEm: new Date().toISOString(), origem: "revisita-263 (2026-07-20)", itens, avisos };
const dest = resolve(U, "migracao/conciliacao-19.json");
writeFileSync(dest, JSON.stringify(saida, null, 2), "utf8");
console.log(`montados ${itens.length} itens ADOTAR → ${dest}`);
if (avisos.length) { console.log(`\navisos (${avisos.length}):`); for (const a of avisos) console.log("  - " + a); }
for (const it of itens) console.log(`  ${String(it.device.id).padStart(9)}  ${it.device.name}  →  ${it.aluno!.nome}  [${it.aluno!.status}] ${it.aluno!.plano || "(sem plano)"}`);
