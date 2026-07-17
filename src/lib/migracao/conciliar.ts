/**
 * Task 5 da migração: conciliação 3-vias — usuários do iDFace × export do
 * CloudGym × Person já existente no Coliseu. SÓ PRODUZ RELATÓRIO; nada é escrito.
 *
 * Realidade verificada no aparelho (2026-07-17): `registration` está vazio em
 * todos os usuários, então a cascata por matrícula não se aplica — a chave
 * device↔CloudGym é o nome normalizado (com curinga para acentos perdidos).
 * CPF só existe do lado CloudGym e une CloudGym↔Person.
 */

import type { AlunoCloudGym } from "./cloudgym";
import { regexDeCuringa, temCuringa } from "./normalizar";

export interface UsuarioDevice {
  id: number;
  registration: string;
  name: string;
  nomeNorm: string;
  imageTimestamp: number;
  lastAccess: number;
}

export interface PessoaExistente {
  id: string;
  cpf: string; // já normalizado (só dígitos)
}

export type Via = "NOME_EXATO" | "NOME_CURINGA";
export type Confianca = "ALTA" | "MEDIA" | "NENHUMA";
export type Situacao = "ADOTAR" | "REVISAR" | "AMBIGUO" | "ORFAO";

export interface ItemConciliacao {
  device: UsuarioDevice;
  aluno: AlunoCloudGym | null;
  personIdExistente: string | null;
  via: Via | null;
  confianca: Confianca;
  situacao: Situacao;
  motivo: string;
}

export interface ResumoConciliacao {
  totalDevice: number;
  adotar: number;
  revisar: number;
  ambiguos: number;
  orfaos: number;
  orfaosComAcessoRecente: number;
  cloudGymSemFace: number;
}

export interface Conciliacao {
  itens: ItemConciliacao[];
  semFace: AlunoCloudGym[];
  resumo: ResumoConciliacao;
}

/**
 * `acessoRecenteDesde`: epoch (s); órfãos com last_access a partir daí são
 * destacados no resumo — gente que ainda passa na catraca e ninguém sabe quem é.
 */
export function conciliar(
  device: UsuarioDevice[],
  alunos: AlunoCloudGym[],
  pessoas: PessoaExistente[],
  acessoRecenteDesde: number,
): Conciliacao {
  // A mesma pessoa aparece no export de ativos E no de inativos (renovou depois
  // de um período parada). Para o mesmo nome, ATIVO/BLOQUEADO engole o INATIVO;
  // dois registros não-inativos com o mesmo nome são pessoas distintas → ambíguo.
  const porNome = new Map<string, AlunoCloudGym[]>();
  for (const a of alunos) {
    const grupo = porNome.get(a.nomeNorm) ?? [];
    grupo.push(a);
    porNome.set(a.nomeNorm, grupo);
  }
  const candidatos = new Map<string, { aluno: AlunoCloudGym | null; ambiguo: boolean }>();
  for (const [nome, grupo] of porNome) {
    const vivos = grupo.filter((a) => a.status !== "INATIVO");
    if (vivos.length > 1) candidatos.set(nome, { aluno: null, ambiguo: true });
    else candidatos.set(nome, { aluno: vivos[0] ?? grupo[0], ambiguo: vivos.length === 0 && grupo.length > 1 });
  }

  const pessoaPorCpf = new Map<string, string>();
  for (const p of pessoas) if (p.cpf) pessoaPorCpf.set(p.cpf, p.id);

  const nomesDeviceDuplicados = new Set<string>();
  {
    const vistos = new Set<string>();
    for (const d of device) {
      if (vistos.has(d.nomeNorm)) nomesDeviceDuplicados.add(d.nomeNorm);
      vistos.add(d.nomeNorm);
    }
  }

  const nomesSemCuringa = [...candidatos.keys()].filter((n) => !temCuringa(n));
  const nomesCasados = new Set<string>();
  const itens: ItemConciliacao[] = [];

  for (const d of device) {
    itens.push(conciliarUm(d));
  }

  function conciliarUm(d: UsuarioDevice): ItemConciliacao {
    const base = { device: d, aluno: null, personIdExistente: null, via: null } as const;

    if (nomesDeviceDuplicados.has(d.nomeNorm)) {
      return { ...base, confianca: "NENHUMA", situacao: "AMBIGUO", motivo: "nome duplicado no próprio aparelho — decidir qual id é de quem" };
    }

    // 1) nome exato
    let hit = candidatos.get(d.nomeNorm) ?? null;
    let via: Via = "NOME_EXATO";

    // 2) nome com curinga (acentos perdidos no export): match único ou nada
    if (!hit && temCuringa(d.nomeNorm)) {
      const rx = regexDeCuringa(d.nomeNorm);
      const matches = nomesSemCuringa.filter((n) => rx.test(n));
      if (matches.length > 1) {
        return { ...base, confianca: "NENHUMA", situacao: "AMBIGUO", motivo: `curinga casa com ${matches.length} nomes do CloudGym` };
      }
      if (matches.length === 1) { hit = candidatos.get(matches[0]) ?? null; via = "NOME_CURINGA"; nomesCasados.add(matches[0]); }
    }

    if (!hit) {
      const recente = d.lastAccess >= acessoRecenteDesde;
      return {
        ...base, confianca: "NENHUMA", situacao: "ORFAO",
        motivo: recente ? "sem par no CloudGym, mas COM acesso recente — identificar com a recepção" : "sem par no CloudGym e sem acesso recente",
      };
    }

    nomesCasados.add(d.nomeNorm);
    if (hit.ambiguo || !hit.aluno) {
      return { ...base, confianca: "NENHUMA", situacao: "AMBIGUO", motivo: "mais de um aluno com esse nome no CloudGym" };
    }

    const aluno = hit.aluno;
    const personIdExistente = aluno.cpf ? pessoaPorCpf.get(aluno.cpf) ?? null : null;

    if (aluno.status === "INATIVO") {
      return { ...base, aluno, personIdExistente, via, confianca: "MEDIA", situacao: "REVISAR", motivo: "casou, mas está INATIVO no CloudGym e tem face no aparelho — confirmar se adota" };
    }
    if (via === "NOME_CURINGA") {
      return { ...base, aluno, personIdExistente, via, confianca: "MEDIA", situacao: "REVISAR", motivo: "casamento por curinga de acento — conferência rápida de nome" };
    }
    return { ...base, aluno, personIdExistente, via, confianca: "ALTA", situacao: "ADOTAR", motivo: "nome exato e único nos dois lados" };
  }

  const semFace = alunos.filter((a) => a.status !== "INATIVO" && !nomesCasados.has(a.nomeNorm));

  const resumo: ResumoConciliacao = {
    totalDevice: device.length,
    adotar: itens.filter((i) => i.situacao === "ADOTAR").length,
    revisar: itens.filter((i) => i.situacao === "REVISAR").length,
    ambiguos: itens.filter((i) => i.situacao === "AMBIGUO").length,
    orfaos: itens.filter((i) => i.situacao === "ORFAO").length,
    orfaosComAcessoRecente: itens.filter((i) => i.situacao === "ORFAO" && i.device.lastAccess >= acessoRecenteDesde).length,
    cloudGymSemFace: semFace.length,
  };
  return { itens, semFace, resumo };
}
