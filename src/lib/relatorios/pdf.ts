/**
 * Escritor de PDF mínimo — texto, retângulo e linha. Nada mais.
 *
 * É escrito à mão de propósito. As bibliotecas de PDF do Node carregam fontes
 * embutidas e ficam na casa das dezenas de megabytes na imagem do Railway, e o
 * relatório precisa de três primitivas. Aqui usamos as fontes base do formato
 * (Helvetica e Helvetica-Bold), que todo leitor de PDF já traz — não há fonte
 * embutida, o arquivo sai na casa das dezenas de KB e não há dependência nova
 * para auditar.
 *
 * Duas escolhas explicam o resto do arquivo:
 *
 * 1. **Y de cima para baixo.** O PDF conta do rodapé para o topo; o layout de
 *    relatório se escreve do topo para o rodapé. A conversão acontece num lugar
 *    só (`emY`) e quem desenha nunca pensa nisso.
 * 2. **Fluxo 100% ASCII.** Todo byte fora de 32–126 sai escapado em octal
 *    (`\341` para "á"). O arquivo inteiro vira ASCII, então contar caracteres em
 *    JavaScript é contar bytes — e a tabela xref, que é uma lista de posições em
 *    bytes, não tem como sair torta por causa de acento.
 */

/** Cor em RGB de 0 a 1, como o PDF quer. */
export type Cor = readonly [number, number, number];

export type Alinhamento = "esquerda" | "direita" | "centro";

export interface OpcoesTexto {
  tamanho?: number;
  negrito?: boolean;
  cor?: Cor;
  alinhamento?: Alinhamento;
}

export const A4 = { largura: 595.28, altura: 841.89 } as const;

/* ─── codificação ────────────────────────────────────────────────────────── */

/**
 * Caracteres que o WinAnsi guarda na faixa 0x80–0x9F (onde o Latin-1 não tem
 * nada). Sem este mapa, o travessão e as aspas curvas viram "?".
 */
const WINANSI_ALTO: Record<string, number> = {
  "€": 0x80, // €
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85, // …
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95, // •
  "–": 0x96, // –
  "—": 0x97, // —
  "˜": 0x98,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
};

/**
 * Texto → bytes WinAnsi. O que não existe na tabela vira "?" em vez de sumir:
 * um sinal visível no papel manda conferir o cadastro; um buraco silencioso
 * passa despercebido até alguém ligar para o telefone errado.
 */
export function paraWinAnsi(texto: string): number[] {
  const bytes: number[] = [];
  for (const ch of texto) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp);
    else bytes.push(WINANSI_ALTO[ch] ?? 0x3f);
  }
  return bytes;
}

/** String literal de PDF: parênteses e barra escapados, byte alto em octal. */
export function escaparTexto(texto: string): string {
  let saida = "";
  for (const b of paraWinAnsi(texto)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) saida += `\\${String.fromCharCode(b)}`;
    else if (b >= 0x20 && b <= 0x7e) saida += String.fromCharCode(b);
    else saida += `\\${b.toString(8).padStart(3, "0")}`;
  }
  return saida;
}

/* ─── métricas ───────────────────────────────────────────────────────────── */

// Larguras oficiais da Helvetica (milésimos de em), do espaço (32) ao til (126).
const LARGURA_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

const LARGURA_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];

/**
 * Byte acentuado → o caractere ASCII de largura equivalente.
 *
 * Não é gambiarra: na Helvetica a letra acentuada tem exatamente a largura da
 * letra de base (o acento fica por cima, não ao lado), então "á" mede o mesmo
 * que "a". Só os símbolos precisam de escolha aproximada, e errar 20 milésimos
 * num "º" não desalinha coluna nenhuma.
 */
const EQUIVALENTE: Record<number, string> = (() => {
  const mapa: Record<number, string> = {
    0xa0: " ", 0x95: "(", 0x91: "i", 0x92: "i", 0x93: "r", 0x94: "r",
    0x85: "@", 0x96: "0", 0x97: "@", 0x99: "@", 0x80: "0",
    0xaa: "*", 0xba: "*", 0xb0: "*", 0xb7: ".", 0xad: "-", 0xb4: "'",
    0xd7: "+", 0xf7: "+", 0xbf: "?", 0xa1: "!", 0xa7: "0", 0xa9: "W", 0xae: "W",
  };
  const faixa = (de: number, ate: number, ch: string) => {
    for (let b = de; b <= ate; b++) mapa[b] = ch;
  };
  faixa(0xc0, 0xc5, "A");
  mapa[0xc7] = "C";
  faixa(0xc8, 0xcb, "E");
  faixa(0xcc, 0xcf, "I");
  mapa[0xd1] = "N";
  faixa(0xd2, 0xd6, "O");
  mapa[0xd8] = "O";
  faixa(0xd9, 0xdc, "U");
  mapa[0xdd] = "Y";
  faixa(0xe0, 0xe5, "a");
  mapa[0xe7] = "c";
  faixa(0xe8, 0xeb, "e");
  faixa(0xec, 0xef, "i");
  mapa[0xf1] = "n";
  faixa(0xf2, 0xf6, "o");
  mapa[0xf8] = "o";
  faixa(0xf9, 0xfc, "u");
  mapa[0xfd] = "y";
  mapa[0xff] = "y";
  return mapa;
})();

function larguraDoByte(b: number, tabela: number[]): number {
  if (b >= 32 && b <= 126) return tabela[b - 32];
  const equivalente = EQUIVALENTE[b];
  if (equivalente) return tabela[equivalente.charCodeAt(0) - 32];
  return tabela["o".charCodeAt(0) - 32];
}

/** Largura do texto em pontos, na fonte e no corpo dados. */
export function larguraTexto(texto: string, tamanho: number, negrito = false): number {
  const tabela = negrito ? LARGURA_NEGRITO : LARGURA_REGULAR;
  let total = 0;
  for (const b of paraWinAnsi(texto)) total += larguraDoByte(b, tabela);
  return (total * tamanho) / 1000;
}

/** Corta com reticências quando não cabe. Célula de tabela nunca invade a vizinha. */
export function cortarTexto(
  texto: string,
  larguraMax: number,
  tamanho: number,
  negrito = false,
): string {
  if (larguraTexto(texto, tamanho, negrito) <= larguraMax) return texto;
  const chars = [...texto];
  while (chars.length > 1) {
    chars.pop();
    if (larguraTexto(`${chars.join("")}…`, tamanho, negrito) <= larguraMax) {
      return `${chars.join("")}…`;
    }
  }
  return "…";
}

/** Quebra em linhas que cabem na largura. Palavra sozinha maior que a linha é cortada. */
export function quebrarTexto(
  texto: string,
  larguraMax: number,
  tamanho: number,
  negrito = false,
): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (larguraTexto(tentativa, tamanho, negrito) <= larguraMax) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = larguraTexto(palavra, tamanho, negrito) <= larguraMax
      ? palavra
      : cortarTexto(palavra, larguraMax, tamanho, negrito);
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

/* ─── documento ──────────────────────────────────────────────────────────── */

/** Número com no máximo duas casas — o stream não precisa de mais precisão. */
const n = (v: number) => (Math.round(v * 100) / 100).toString();

export interface OpcoesDocumento {
  largura?: number;
  altura?: number;
  titulo?: string;
  autor?: string;
  criadoEm?: Date;
}

export class DocumentoPdf {
  readonly largura: number;
  readonly altura: number;
  private readonly titulo: string;
  private readonly autor: string;
  private readonly criadoEm: Date;
  private readonly streams: string[] = [];
  private atual = -1;

  constructor(opcoes: OpcoesDocumento = {}) {
    this.largura = opcoes.largura ?? A4.largura;
    this.altura = opcoes.altura ?? A4.altura;
    this.titulo = opcoes.titulo ?? "Relatório";
    this.autor = opcoes.autor ?? "Coliseu Team";
    this.criadoEm = opcoes.criadoEm ?? new Date();
    this.novaPagina();
  }

  get totalPaginas(): number {
    return this.streams.length;
  }

  novaPagina(): void {
    this.streams.push("");
    this.atual = this.streams.length - 1;
  }

  private escrever(op: string): void {
    this.streams[this.atual] += `${op}\n`;
  }

  /** Y de topo → Y de PDF. A única conversão de eixo no arquivo. */
  private emY(y: number): number {
    return this.altura - y;
  }

  texto(x: number, y: number, texto: string, opcoes: OpcoesTexto = {}): void {
    const tamanho = opcoes.tamanho ?? 10;
    const negrito = opcoes.negrito ?? false;
    const [r, g, b] = opcoes.cor ?? [0, 0, 0];
    let posX = x;
    if (opcoes.alinhamento === "direita") posX = x - larguraTexto(texto, tamanho, negrito);
    else if (opcoes.alinhamento === "centro") posX = x - larguraTexto(texto, tamanho, negrito) / 2;

    this.escrever(
      `BT ${n(r)} ${n(g)} ${n(b)} rg /${negrito ? "F2" : "F1"} ${n(tamanho)} Tf ` +
        `1 0 0 1 ${n(posX)} ${n(this.emY(y))} Tm (${escaparTexto(texto)}) Tj ET`,
    );
  }

  retangulo(x: number, y: number, largura: number, altura: number, cor: Cor): void {
    const [r, g, b] = cor;
    this.escrever(
      `${n(r)} ${n(g)} ${n(b)} rg ${n(x)} ${n(this.emY(y + altura))} ${n(largura)} ${n(altura)} re f`,
    );
  }

  linha(x1: number, y1: number, x2: number, y2: number, cor: Cor, espessura = 0.5): void {
    const [r, g, b] = cor;
    this.escrever(
      `${n(r)} ${n(g)} ${n(b)} RG ${n(espessura)} w ${n(x1)} ${n(this.emY(y1))} m ${n(x2)} ${n(this.emY(y2))} l S`,
    );
  }

  /**
   * Fecha o documento. `rodape` roda uma vez por página já sabendo o total —
   * é o que permite escrever "Página 2 de 7" sem medir o documento duas vezes.
   */
  finalizar(rodape?: (pagina: number, total: number) => void): Buffer {
    if (rodape) {
      const total = this.streams.length;
      for (let i = 0; i < total; i++) {
        this.atual = i;
        rodape(i + 1, total);
      }
    }

    const totalPaginas = this.streams.length;
    // 1 catálogo, 2 páginas, 3 e 4 fontes; daí em diante, par (página, conteúdo).
    const primeiraPagina = 5;
    const numeroDaPagina = (i: number) => primeiraPagina + i * 2;
    const numeroDoConteudo = (i: number) => primeiraPagina + i * 2 + 1;
    const numeroInfo = primeiraPagina + totalPaginas * 2;

    const objetos: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${Array.from({ length: totalPaginas }, (_, i) => `${numeroDaPagina(i)} 0 R`).join(" ")}] /Count ${totalPaginas} >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ];

    for (let i = 0; i < totalPaginas; i++) {
      objetos.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(this.largura)} ${n(this.altura)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${numeroDoConteudo(i)} 0 R >>`,
      );
      const stream = this.streams[i];
      objetos.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    }

    objetos.push(
      `<< /Title (${escaparTexto(this.titulo)}) /Author (${escaparTexto(this.autor)}) ` +
        `/Producer (Coliseu CRM) /CreationDate (${carimboPdf(this.criadoEm)}) >>`,
    );

    const partes: string[] = ["%PDF-1.4\n"];
    let posicao = partes[0].length;
    const posicoes: number[] = [];
    for (let i = 0; i < objetos.length; i++) {
      const corpo = `${i + 1} 0 obj\n${objetos[i]}\nendobj\n`;
      posicoes.push(posicao);
      partes.push(corpo);
      posicao += corpo.length;
    }

    const inicioXref = posicao;
    let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const p of posicoes) xref += `${String(p).padStart(10, "0")} 00000 n \n`;
    partes.push(xref);
    partes.push(
      `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info ${numeroInfo} 0 R >>\n` +
        `startxref\n${inicioXref}\n%%EOF\n`,
    );

    // Tudo é ASCII (ver o cabeçalho), então caractere e byte são a mesma coisa
    // e as posições da xref batem.
    return Buffer.from(partes.join(""), "latin1");
  }
}

/** "D:20260807143200-03'00'" — o formato de data do PDF, no fuso da academia. */
function carimboPdf(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  const p = (v: number) => String(v).padStart(2, "0");
  return (
    `D:${local.getUTCFullYear()}${p(local.getUTCMonth() + 1)}${p(local.getUTCDate())}` +
    `${p(local.getUTCHours())}${p(local.getUTCMinutes())}${p(local.getUTCSeconds())}-03'00'`
  );
}
