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
    ["situacao", "id_no_aparelho", "nome_no_aparelho", "ultimo_acesso", "casou_com", "status_cloudgym", "motivo", "decisao_da_recepcao"].join(";"),
  ];
  const pendentes = r.itens
    .filter((i) => i.situacao !== "ADOTAR")
    .sort((a, b) => b.device.lastAccess - a.device.lastAccess);
  for (const i of pendentes) {
    linhas.push([
      i.situacao, i.device.id, csvCampo(i.device.name.trim()), dataDe(i.device.lastAccess),
      csvCampo(i.aluno?.nome ?? ""), i.aluno?.status ?? "", csvCampo(i.motivo), "",
    ].join(";"));
  }
  for (const a of r.semFace) {
    linhas.push(["SEM_FACE", "", csvCampo(a.nome), "", "", a.status, "ativo no CloudGym sem face cadastrada no aparelho", ""].join(";"));
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
