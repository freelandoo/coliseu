/**
 * Regras de limpeza da importação completa do CloudGym (export de 2026-10-05).
 * Funções puras: nada aqui toca o banco. Ver
 * docs/superpowers/plans/2026-10-05-importacao-cloudgym-analytics.md.
 */

/** Formas de pagamento do CloudGym, confirmadas no código das telas do painel. */
export const FORMAS_PAGAMENTO = {
  CC: "Débito Recorrente",
  ECC: "Cartão de Crédito",
  ECD: "Cartão de Débito",
  BT: "PIX/TED/Transf",
  PIXA: "PIX Automático",
  OC: "Pendura",
  BL: "Boleto",
  DN: "Dinheiro",
  CH: "Cheque",
  DC: "Débito em conta",
  LC: "Local",
  GP: "Gympass",
  TP: "TotalPass",
  OT: "Outros",
} as const;

export type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

/** Código conhecido ou null (o chamador registra a issue). CC ≠ ECC: só CC é recorrente. */
export function formaPagamento(codigo: string | null | undefined): FormaPagamento | null {
  const c = (codigo ?? "").trim().toUpperCase();
  return c in FORMAS_PAGAMENTO ? (c as FormaPagamento) : null;
}

/** Os relatórios do CloudGym somam PIX Automático junto com PIX/TED/Transf. */
export function grupoDaForma(forma: FormaPagamento): FormaPagamento {
  return forma === "PIXA" ? "BT" : forma;
}

/**
 * `tipo` da parcela, deduzido dos dados e conferido na tela do aluno no CloudGym:
 * `i` = mensalidade do plano (existe desde 08/2020), `e` = taxa de adesão
 * (bate com `registrationFee`/`installreg` do plano), vazio = parcela antiga.
 * Estorno NÃO é tipo: é `status = canceled`.
 */
export const TIPOS_PARCELA = { i: "mensalidade", e: "adesao" } as const;

export function tipoParcela(bruto: string | null | undefined): "mensalidade" | "adesao" | "legado" {
  const t = (bruto ?? "").trim() as keyof typeof TIPOS_PARCELA;
  return TIPOS_PARCELA[t] ?? "legado";
}

/** Plano aposentado no CloudGym: `status=deleted` ou nome com prefixo "W NÃO USAR". */
export function planoAposentado(nome: string, status: string | null | undefined): boolean {
  return (status ?? "").trim() === "deleted" || /^w\s+nao\s+usar\b/.test(chaveNome(nome));
}

/** Dígitos verificadores do CPF. Sequências repetidas (111…) são inválidas. */
export function cpfValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(digitos[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(digitos[9]) && dv(10) === Number(digitos[10]);
}

/** Só dígitos, zero à esquerda até 11, DV conferido. null quando vazio ou inválido. */
export function limparCpf(bruto: string | null | undefined): string | null {
  const d = (bruto ?? "").replace(/\D/g, "");
  if (!d || d.length > 11) return null;
  const cpf = d.padStart(11, "0");
  return cpfValido(cpf) ? cpf : null;
}

/**
 * Telefone em E.164 (+55DDDNUMERO). Aceita "+5511…", "(11) 9xxxx-xxxx", "11…";
 * "(11) -" e números sem DDD viram null.
 */
export function limparTelefone(bruto: string | null | undefined): string | null {
  let d = (bruto ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length !== 10 && d.length !== 11) return null;
  if (Number(d.slice(0, 2)) < 11) return null;
  return `+55${d}`;
}

/** Chave de casamento por celular: os 11 (ou 10) dígitos nacionais. */
export function chaveTelefone(bruto: string | null | undefined): string {
  return limparTelefone(bruto)?.slice(3) ?? "";
}

/** Lowercase + trim; formato inválido vira null. */
export function limparEmail(bruto: string | null | undefined): string | null {
  const e = (bruto ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e : null;
}

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

/** trim, espaços colapsados e Title Case preservando partículas (da, de, dos…). */
export function nomeTitleCase(bruto: string): string {
  return bruto
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((p, i) =>
      i > 0 && PARTICULAS.has(p)
        ? p
        : p
            .split(/([-'])/)
            .map((s) => (s.length ? s[0].toLocaleUpperCase("pt-BR") + s.slice(1) : s))
            .join(""),
    )
    .join(" ");
}

/** Chave sem acento/caixa/espaço extra para casar nomes (lowercase, como o prompt pede). */
export function chaveNome(bruto: string | null | undefined): string {
  return (bruto ?? "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CIDADES: Record<string, string> = {
  "sao bernardo do campo": "São Bernardo do Campo",
  "santo andre": "Santo André",
  "sao caetano do sul": "São Caetano do Sul",
  diadema: "Diadema",
  maua: "Mauá",
  "sao paulo": "São Paulo",
  "rio de janeiro": "Rio de Janeiro",
};

/** Unifica grafias ("SAO BERNARDO DO CAMPO" = "São Bernardo do Campo"); desconhecida vira Title Case. */
export function limparCidade(bruto: string | null | undefined): string | null {
  const chave = chaveNome(bruto);
  if (chave.length < 3) return null;
  return CIDADES[chave] ?? nomeTitleCase(bruto ?? "");
}

/**
 * Data ISO (YYYY-MM-DD, aceita sufixo de hora) dentro de [min, max]; fora disso
 * null. Os exports trazem nascimentos em 0001 e 8198.
 */
export function limparData(
  bruto: string | null | undefined,
  min = "1900-01-01",
  max = "2100-12-31",
): string | null {
  const m = (bruto ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  return iso >= min && iso <= max ? iso : null;
}

/** Valor monetário em centavos (inteiro) — evita erro de ponto flutuante nas somas. */
export function centavos(bruto: string | null | undefined): number | null {
  const s = (bruto ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Só os 4 últimos dígitos do cartão. O número completo nunca é gravado. */
export function finalCartao(bruto: string | null | undefined): string | null {
  const d = (bruto ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : null;
}

/**
 * A coluna `plan` traz o histórico de planos separado por "|", do mais recente
 * para o mais antigo. Devolve os nomes limpos, sem vazios.
 */
export function explodirPlanos(bruto: string | null | undefined): string[] {
  return (bruto ?? "")
    .split("|")
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

/** Chave para casar nome de plano do cliente com o catálogo. */
export function chavePlano(bruto: string): string {
  return chaveNome(bruto).replace(/[^a-z0-9+]/g, "");
}

/**
 * Mensalidade de um plano do CloudGym. `price` é cobrado a cada `months` meses e
 * o contrato dura `duration` meses: FULL ANUAL (1788, 1, 12) = R$ 149/mês;
 * "1 Luta Anual Recorrente" (140, 12, 12) = R$ 140/mês. Em centavos.
 */
export function mensalidadeDoPlano(priceCent: number, months: number, duration: number): number {
  const dur = duration > 0 ? duration : 1;
  return Math.round((priceCent * (months > 0 ? months : 1)) / dur);
}
