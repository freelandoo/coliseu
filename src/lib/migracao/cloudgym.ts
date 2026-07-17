/**
 * Task 4 da migração: normaliza os exports CSV do painel do CloudGym.
 *
 * Formatos reais observados (2026-07-17):
 *  - alunos (ativos/bloqueados): Nome,Status,RG,CPF,Email,Celular,Origem,Vendedor,
 *    Plano,Início,Final,Estado,Cidade,CEP,NPS
 *  - inativos: Nome,Nascimento,Email,Celular,Origem,Vendedor,Plano,Início,Final,...
 *    (sem Status e sem CPF — o statusPadrao cobre isso)
 *
 * Tolerante a coluna faltando: acumula avisos, nunca estoura.
 */

import { dataBRparaISO, normalizarCpf, normalizarNome } from "./normalizar";

export type StatusCloudGym = "ATIVO" | "BLOQUEADO" | "INATIVO";

export interface AlunoCloudGym {
  nome: string;
  nomeNorm: string;
  status: StatusCloudGym;
  cpf: string; // só dígitos; "" quando ausente/inválido
  email: string;
  celular: string;
  plano: string;
  inicioISO: string | null;
  fimISO: string | null;
  nascimentoISO: string | null;
  estado: string;
  cidade: string;
  cep: string;
}

export interface ParseCloudGym {
  alunos: AlunoCloudGym[];
  avisos: string[];
}

/** Parser CSV mínimo (RFC 4180): aspas, vírgula dentro de aspas, aspas escapadas. */
export function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroDeAspas = false;
  const s = texto.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; }
        else dentroDeAspas = false;
      } else campo += c;
    } else if (c === '"') dentroDeAspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
  return linhas;
}

/** Cabeçalho canônico: sem acento, minúsculo ("Início" → "inicio"). */
function chaveDeCabecalho(nome: string): string {
  return nome.normalize("NFD").replace(/\p{Mn}/gu, "").trim().toLowerCase();
}

function paraStatus(valor: string, padrao: StatusCloudGym): StatusCloudGym {
  const v = chaveDeCabecalho(valor);
  if (v === "ativo") return "ATIVO";
  if (v === "bloqueado") return "BLOQUEADO";
  if (v === "inativo") return "INATIVO";
  return padrao;
}

export function parseCloudGym(csv: string, statusPadrao: StatusCloudGym = "ATIVO"): ParseCloudGym {
  const avisos: string[] = [];
  const linhas = parseCsv(csv);
  if (linhas.length === 0) return { alunos: [], avisos: ["CSV vazio"] };

  const cab = linhas[0].map(chaveDeCabecalho);
  const idx = (nome: string) => cab.indexOf(nome);
  const col = (linha: string[], nome: string) => {
    const i = idx(nome);
    return i >= 0 && i < linha.length ? linha[i].trim() : "";
  };

  if (idx("nome") < 0) return { alunos: [], avisos: ["CSV sem coluna Nome — formato inesperado"] };
  for (const c of ["status", "cpf", "plano", "final"]) {
    if (idx(c) < 0) avisos.push(`coluna ausente: ${c}`);
  }

  const alunos: AlunoCloudGym[] = [];
  for (let n = 1; n < linhas.length; n++) {
    const l = linhas[n];
    const nome = col(l, "nome");
    if (!nome) { avisos.push(`linha ${n + 1}: sem nome, ignorada`); continue; }

    const cpfBruto = col(l, "cpf");
    const cpf = normalizarCpf(cpfBruto);
    if (cpfBruto && !cpf) avisos.push(`linha ${n + 1} (${nome}): CPF inválido "${cpfBruto}"`);

    const lerData = (campo: string) => {
      const bruto = col(l, campo);
      const iso = dataBRparaISO(bruto);
      if (bruto && !iso) avisos.push(`linha ${n + 1} (${nome}): data inválida em ${campo} "${bruto}"`);
      return iso;
    };

    alunos.push({
      nome,
      nomeNorm: normalizarNome(nome),
      status: paraStatus(col(l, "status"), statusPadrao),
      cpf,
      email: col(l, "email"),
      celular: col(l, "celular"),
      plano: col(l, "plano"),
      inicioISO: lerData("inicio"),
      fimISO: lerData("final"),
      nascimentoISO: lerData("nascimento"),
      estado: col(l, "estado"),
      cidade: col(l, "cidade"),
      cep: col(l, "cep"),
    });
  }
  return { alunos, avisos };
}
