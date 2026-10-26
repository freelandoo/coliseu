/**
 * Contrato de matrícula: o modelo da academia com os dados do aluno no lugar
 * dos campos entre chaves. Sem banco — a página monta `DadosContrato` e chama
 * `preencherContrato`; a recepção ainda pode editar o resultado antes de
 * imprimir (a versão editada fica guardada por matrícula).
 */

export interface DadosContrato {
  nome: string;
  rg: string | null;
  cpf: string | null;
  endereco: string | null;
  /** Início e fim da matrícula ("AAAA-MM-DD" ou Date). */
  inicio: Date;
  fim: Date;
  plano: string;
  /** Meses de vigência (1, 3, 6, 12…) — marca o prazo no contrato. */
  meses: number;
  valorTotal: number;
  parcelas: number;
  valorParcela: number;
  formaPagamento: string;
  /** Dia de hoje, no rodapé ("São Bernardo do Campo, {data}"). */
  hoje: Date;
  /** Menor de idade: o rodapé pede a assinatura do responsável. */
  menor: boolean;
  empresa?: string;
}

const FUSO = "America/Sao_Paulo";

function dataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: FUSO });
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatarCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (cpf ?? "");
}

/** Idade na data de hoje, a partir de "AAAA-MM-DD". Sem data, null. */
export function idade(nascimento: string | null | undefined, hoje: Date): number | null {
  const m = (nascimento ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [a, me, di] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = new Date(hoje.toLocaleString("en-US", { timeZone: FUSO }));
  let anos = h.getFullYear() - a;
  if (h.getMonth() + 1 < me || (h.getMonth() + 1 === me && h.getDate() < di)) anos--;
  return anos;
}

/** O prazo marcado com X na linha "Mensal ( ), 3 Meses ( ), 6 Meses ( ), 1 ano ( )". */
function rotuloPrazo(meses: number): string | null {
  if (meses <= 1) return "Mensal";
  if (meses === 3) return "3 Meses";
  if (meses === 6) return "6 Meses";
  if (meses === 12) return "1 ano";
  return null;
}

export function nomePrazo(meses: number): string {
  if (meses <= 1) return "Mensal";
  if (meses === 3) return "Trimestral";
  if (meses === 6) return "Semestral";
  if (meses === 12) return "Anual";
  return `${meses} meses`;
}

const VAZIO = "____________________";

export function preencherContrato(modelo: string, d: DadosContrato): string {
  const campos: Record<string, string> = {
    nome: d.nome.toUpperCase(),
    rg: d.rg?.trim() || VAZIO,
    cpf: formatarCpf(d.cpf) || VAZIO,
    endereco: d.endereco?.trim() || VAZIO,
    inicio: dataBR(d.inicio),
    fim: dataBR(d.fim),
    plano: `${d.plano} (${nomePrazo(d.meses)})`,
    valortotal: brl(d.valorTotal),
    parcelas: String(d.parcelas),
    valor: brl(d.valorParcela),
    metodo_pagamento: d.formaPagamento,
    data: dataBR(d.hoje),
    empresa: d.empresa ?? "ACADEMIA COLISEU TEAM",
  };
  let html = modelo;
  // Rodapé "{nome} / {responsável}": adulto assina sozinho; menor, com o responsável.
  html = html.replace(/\s*\/\s*\{respons[aá]vel\}/g, d.menor ? ` / Responsável legal: ${VAZIO}` : "");
  html = html.replace(/\{([a-z_]+)\}/g, (inteiro, chave: string) =>
    chave in campos ? escapar(campos[chave]) : inteiro,
  );
  const prazo = rotuloPrazo(d.meses);
  if (prazo) {
    // "Mensal (&nbsp; &nbsp;)" → "Mensal ( X )" — só a primeira ocorrência (o quadro do topo).
    const re = new RegExp(`(${prazo.replace(" ", "(?:\\s|&nbsp;)+")}\\s*)\\((?:\\s|&nbsp;)*\\)`);
    html = html.replace(re, "$1( <strong>X</strong> )");
  }
  return html;
}

/**
 * Limpa o HTML editado na tela antes de gravar: só texto e formatação. Tira
 * script, style, iframe, objetos, atributos de evento e links javascript: —
 * o contrato é aberto por outras pessoas da equipe.
 */
export function limparHtmlContrato(html: string): string {
  return html
    // Com conteúdo: some a tag e o que está dentro.
    .replace(/<\s*(script|style|iframe|object|form|button|textarea|select)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    // Soltas (ou abertas sem fechar): some só a tag.
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)\b[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "")
    .slice(0, 300_000);
}
