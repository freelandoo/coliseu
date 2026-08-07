/**
 * O relatório desenhado em papel A4.
 *
 * Só conhece a estrutura de `tipos.ts` — nunca marketing nem financeiro. Um
 * relatório novo aparece aqui sem uma linha de mudança.
 *
 * O papel é claro mesmo com o sistema sendo escuro: este arquivo sai do
 * navegador para o WhatsApp do contador e para a impressora da sala, e fundo
 * preto em papel é toner queimado e leitura pior.
 */

import { A4, DocumentoPdf, cortarTexto, quebrarTexto, type Cor } from "./pdf";
import type { Bloco, Relatorio, Tom } from "./tipos";

const MARGEM = 42;
const LARGURA_UTIL = A4.largura - MARGEM * 2;
const RODAPE = 58;

const TINTA: Cor = [0.11, 0.12, 0.13];
const SUAVE: Cor = [0.42, 0.44, 0.47];
const FRACO: Cor = [0.58, 0.6, 0.63];
const LINHA: Cor = [0.85, 0.86, 0.88];
const CHAPA: Cor = [0.96, 0.965, 0.97];
const VERMELHO: Cor = [0.66, 0.16, 0.14];
const VERDE: Cor = [0.16, 0.53, 0.35];
const AMBAR: Cor = [0.65, 0.48, 0.11];
const BRANCO: Cor = [1, 1, 1];

const COR_TOM: Record<Tom, Cor> = {
  neutro: SUAVE,
  ok: VERDE,
  alerta: AMBAR,
  risco: VERMELHO,
};

const ORGANIZACAO = "Academia Coliseu Team";

/** Estado do desenho: onde a caneta está e o que repetir a cada página. */
interface Pagina {
  doc: DocumentoPdf;
  y: number;
  rel: Relatorio;
}

export function renderizarRelatorioPdf(rel: Relatorio): Buffer {
  const doc = new DocumentoPdf({
    titulo: `${rel.titulo} — ${rel.periodo}`,
    autor: ORGANIZACAO,
  });
  const p: Pagina = { doc, y: 0, rel };

  capa(p);
  for (const bloco of rel.blocos) desenharBloco(p, bloco);
  observacoes(p);

  return doc.finalizar((pagina, total) => {
    doc.linha(MARGEM, A4.altura - 44, A4.largura - MARGEM, A4.altura - 44, LINHA, 0.5);
    doc.texto(MARGEM, A4.altura - 30, `${ORGANIZACAO} · documento interno`, {
      tamanho: 7,
      cor: FRACO,
    });
    doc.texto(A4.largura - MARGEM, A4.altura - 30, `Página ${pagina} de ${total}`, {
      tamanho: 7,
      cor: FRACO,
      alinhamento: "direita",
    });
  });
}

/* ─── moldura ────────────────────────────────────────────────────────────── */

function capa(p: Pagina): void {
  const { doc, rel } = p;
  doc.retangulo(0, 0, A4.largura, 7, VERMELHO);
  doc.texto(MARGEM, 64, rel.titulo.toUpperCase(), { tamanho: 21, negrito: true, cor: TINTA });
  doc.texto(MARGEM, 86, `${ORGANIZACAO} · ${rel.periodo}`, { tamanho: 11, cor: VERMELHO });
  doc.texto(MARGEM, 103, `Gerado em ${rel.geradoEm} por ${rel.geradoPor}`, {
    tamanho: 8,
    cor: FRACO,
  });
  doc.linha(MARGEM, 116, A4.largura - MARGEM, 116, LINHA, 0.8);
  p.y = 140;
}

function cabecalhoDeContinuacao(p: Pagina): void {
  const { doc, rel } = p;
  doc.retangulo(0, 0, A4.largura, 4, VERMELHO);
  doc.texto(MARGEM, 32, `${rel.titulo} · ${rel.periodo}`, { tamanho: 8, cor: FRACO });
  doc.linha(MARGEM, 40, A4.largura - MARGEM, 40, LINHA, 0.5);
  p.y = 62;
}

/** Garante espaço na página; se não couber, vira a folha e repete o cabeçalho. */
function garantir(p: Pagina, altura: number): void {
  if (p.y + altura <= A4.altura - RODAPE) return;
  p.doc.novaPagina();
  cabecalhoDeContinuacao(p);
}

function tituloDeSecao(p: Pagina, titulo: string, nota?: string): void {
  garantir(p, nota ? 46 : 34);
  p.doc.texto(MARGEM, p.y, titulo.toUpperCase(), { tamanho: 10, negrito: true, cor: VERMELHO });
  p.doc.linha(MARGEM, p.y + 6, A4.largura - MARGEM, p.y + 6, LINHA, 0.5);
  p.y += 18;
  if (nota) {
    for (const linha of quebrarTexto(nota, LARGURA_UTIL, 7.5)) {
      p.doc.texto(MARGEM, p.y, linha, { tamanho: 7.5, cor: FRACO });
      p.y += 10;
    }
    p.y += 2;
  }
}

/* ─── blocos ─────────────────────────────────────────────────────────────── */

function desenharBloco(p: Pagina, bloco: Bloco): void {
  switch (bloco.tipo) {
    case "indicadores":
      return indicadores(p, bloco);
    case "barras":
      return barras(p, bloco);
    case "tabela":
      return tabela(p, bloco);
    case "texto":
      return texto(p, bloco);
  }
}

function indicadores(p: Pagina, bloco: Extract<Bloco, { tipo: "indicadores" }>): void {
  tituloDeSecao(p, bloco.titulo, bloco.nota);

  const colunas = 3;
  const vao = 9;
  const largura = (LARGURA_UTIL - vao * (colunas - 1)) / colunas;
  const altura = 54;

  for (let i = 0; i < bloco.itens.length; i += colunas) {
    garantir(p, altura + 8);
    const linha = bloco.itens.slice(i, i + colunas);
    linha.forEach((item, coluna) => {
      const x = MARGEM + coluna * (largura + vao);
      const cor = COR_TOM[item.tom ?? "neutro"];
      p.doc.retangulo(x, p.y, largura, altura, CHAPA);
      p.doc.retangulo(x, p.y, 2.5, altura, cor);

      p.doc.texto(x + 10, p.y + 15, cortarTexto(item.rotulo.toUpperCase(), largura - 18, 6.8, true), {
        tamanho: 6.8,
        negrito: true,
        cor: SUAVE,
      });
      p.doc.texto(x + 10, p.y + 34, cortarTexto(item.valor, largura - 18, 15, true), {
        tamanho: 15,
        negrito: true,
        cor: item.tom && item.tom !== "neutro" ? cor : TINTA,
      });
      if (item.apoio) {
        p.doc.texto(x + 10, p.y + 46, cortarTexto(item.apoio, largura - 18, 6.5), {
          tamanho: 6.5,
          cor: FRACO,
        });
      }
    });
    p.y += altura + vao;
  }
  p.y += 10;
}

function barras(p: Pagina, bloco: Extract<Bloco, { tipo: "barras" }>): void {
  tituloDeSecao(p, bloco.titulo, bloco.nota);

  const larguraRotulo = 108;
  const larguraValor = 150;
  const inicioTrilho = MARGEM + larguraRotulo + 8;
  const larguraTrilho = LARGURA_UTIL - larguraRotulo - larguraValor - 16;
  const maximo = Math.max(...bloco.itens.map((i) => Math.abs(i.valor)), 1);
  const alturaLinha = 19;

  for (const item of bloco.itens) {
    garantir(p, alturaLinha);
    const cor = COR_TOM[item.tom ?? "neutro"];
    p.doc.texto(MARGEM, p.y + 9, cortarTexto(item.rotulo, larguraRotulo, 8), {
      tamanho: 8,
      cor: TINTA,
    });
    p.doc.retangulo(inicioTrilho, p.y + 2, larguraTrilho, 10, CHAPA);
    const preenchido = (Math.max(item.valor, 0) / maximo) * larguraTrilho;
    if (preenchido > 0.5) p.doc.retangulo(inicioTrilho, p.y + 2, preenchido, 10, cor);
    p.doc.texto(A4.largura - MARGEM, p.y + 9, cortarTexto(item.exibicao, larguraValor, 8, true), {
      tamanho: 8,
      negrito: true,
      cor: TINTA,
      alinhamento: "direita",
    });
    p.y += alturaLinha;
  }
  p.y += 12;
}

function tabela(p: Pagina, bloco: Extract<Bloco, { tipo: "tabela" }>): void {
  tituloDeSecao(p, bloco.titulo, bloco.nota);

  if (bloco.linhas.length === 0) {
    garantir(p, 22);
    p.doc.texto(MARGEM, p.y + 8, bloco.vazio ?? "Sem dados no período.", {
      tamanho: 8,
      cor: FRACO,
    });
    p.y += 24;
    return;
  }

  const pesos = bloco.colunas.map((c) => c.peso ?? 1);
  const somaPesos = pesos.reduce((s, v) => s + v, 0);
  const larguras = pesos.map((peso) => (peso / somaPesos) * LARGURA_UTIL);
  const inicios = larguras.map((_, i) => MARGEM + larguras.slice(0, i).reduce((s, v) => s + v, 0));
  const alturaLinha = 15;

  const cabecalho = () => {
    p.doc.retangulo(MARGEM, p.y, LARGURA_UTIL, 16, CHAPA);
    bloco.colunas.forEach((coluna, i) => {
      const direita = coluna.alinhamento === "direita";
      const x = direita ? inicios[i] + larguras[i] - 6 : inicios[i] + 6;
      p.doc.texto(x, p.y + 11, cortarTexto(coluna.rotulo.toUpperCase(), larguras[i] - 12, 6.8, true), {
        tamanho: 6.8,
        negrito: true,
        cor: SUAVE,
        alinhamento: direita ? "direita" : "esquerda",
      });
    });
    p.y += 16;
  };

  garantir(p, 16 + alturaLinha * 2);
  cabecalho();

  bloco.linhas.forEach((linha, indice) => {
    if (p.y + alturaLinha > A4.altura - RODAPE) {
      p.doc.novaPagina();
      cabecalhoDeContinuacao(p);
      cabecalho();
    }
    if (indice % 2 === 1) p.doc.retangulo(MARGEM, p.y, LARGURA_UTIL, alturaLinha, BRANCO);
    bloco.colunas.forEach((coluna, i) => {
      const conteudo = linha[i] ?? "";
      const direita = coluna.alinhamento === "direita";
      const x = direita ? inicios[i] + larguras[i] - 6 : inicios[i] + 6;
      p.doc.texto(x, p.y + 10, cortarTexto(conteudo, larguras[i] - 12, 8, i === 0), {
        tamanho: 8,
        negrito: i === 0,
        cor: i === 0 ? TINTA : SUAVE,
        alinhamento: direita ? "direita" : "esquerda",
      });
    });
    p.doc.linha(MARGEM, p.y + alturaLinha, A4.largura - MARGEM, p.y + alturaLinha, LINHA, 0.3);
    p.y += alturaLinha;
  });
  p.y += 14;
}

function texto(p: Pagina, bloco: Extract<Bloco, { tipo: "texto" }>): void {
  tituloDeSecao(p, bloco.titulo);
  const recuo = 12;
  for (const paragrafo of bloco.paragrafos) {
    const linhas = quebrarTexto(paragrafo, LARGURA_UTIL - recuo, 8.5);
    garantir(p, linhas.length * 11 + 6);
    p.doc.retangulo(MARGEM, p.y + 3, 3, 3, VERMELHO);
    linhas.forEach((linha, i) => {
      p.doc.texto(MARGEM + recuo, p.y + 8, linha, { tamanho: 8.5, cor: TINTA });
      if (i < linhas.length - 1) p.y += 11;
    });
    p.y += 17;
  }
  p.y += 4;
}

function observacoes(p: Pagina): void {
  if (!p.rel.observacoes.length) return;
  tituloDeSecao(p, "Como ler este relatório");
  for (const obs of p.rel.observacoes) {
    const linhas = quebrarTexto(obs, LARGURA_UTIL - 10, 7.5);
    garantir(p, linhas.length * 10 + 4);
    linhas.forEach((linha, i) => {
      p.doc.texto(MARGEM + 10, p.y + 7, `${i === 0 ? "— " : "  "}${linha}`, {
        tamanho: 7.5,
        cor: FRACO,
      });
      if (i < linhas.length - 1) p.y += 10;
    });
    p.y += 14;
  }
}
