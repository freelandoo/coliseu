/**
 * Geometria procedural do Coliseu de Roma — puro TypeScript, sem three.js.
 *
 * Sai daqui tudo o que a cena 3D (`cena.ts`) e o desenho estático
 * (`ArenaWireframe`, via `projecao.ts`) precisam:
 * - `tracos`: segmentos de linha (pares de pontos) com cor RGBA por vértice
 *   e uma marca `arena` (o piso da arena se desenha por varredura angular,
 *   o resto sobe por altura);
 * - `oclusores`: triângulos invisíveis que só escrevem profundidade, para que
 *   as linhas de trás fiquem escondidas atrás das paredes (sem eles o
 *   aramado vira um novelo e o monumento deixa de ser reconhecível).
 *
 * Unidades em metros, com o centro da arena na origem e o chão em y = 0.
 * Proporções do monumento real: elipse externa de ~188 × 156 m, ~48 m de
 * altura, três ordens de arcadas, o ático cego com janelinhas e, no lado
 * sul, o anel externo desabado — sobra o segundo anel, com a borda da ruína
 * descendo em degraus.
 */

/** Semieixos da elipse externa (m). */
export const SEMIEIXO_X = 94;
export const SEMIEIXO_Z = 78;
/** Altura total até a cornija do ático (m). */
export const ALTURA_TOTAL = 48;

/**
 * Enquadramento compartilhado pela cena 3D e pelo SVG estático (que é a
 * mesma geometria projetada desta câmera — o crossfade não "pula").
 */
export const ENQUADRAMENTO = {
  /** Giro de repouso: fachada intacta à esquerda, ruína descendo à direita. */
  rotacaoInicial: 0.85,
  /** Câmera elevada em 3/4 (rad). */
  elevacao: (27 * Math.PI) / 180,
  /** Campo de visão vertical (graus). */
  fov: 26,
  /** Escala do modelo: semieixo maior = 1. */
  escala: 1 / 94,
  /** Deslocamento vertical do modelo (unidades da cena). */
  deslocamentoY: (-48 / 94) * 0.3,
} as const;

/** Distância da câmera à origem para caber o anel girando na proporção dada. */
export function distanciaCamera(aspecto: number): number {
  const meiaV = Math.tan(((ENQUADRAMENTO.fov / 2) * Math.PI) / 180);
  const meiaH = meiaV * aspecto;
  const e = ENQUADRAMENTO.elevacao;
  const largura = 1.08;
  const altura = (Math.sin(e) * 0.86 + Math.cos(e) * 0.32) * 1.12;
  return Math.max(largura / meiaH, altura / meiaV) + 0.9;
}

/** Ordens de arcadas: base e topo de cada nível (m). */
const NIVEIS = [
  { base: 0, topo: 10.5, plinto: 0 },
  { base: 10.5, topo: 22, plinto: 1.4 },
  { base: 22, topo: 33.5, plinto: 1.4 },
] as const;
const ATICO = { base: 33.5, topo: ALTURA_TOTAL } as const;

/** Espessura do anel externo e posição do segundo anel (recuo, m). */
const ESPESSURA = 2.6;
const ANEL2 = 6;
const ESPESSURA_ANEL2 = 2;
/** Altura do segundo anel (no lado intacto fica escondido atrás do externo). */
const ALTURA_ANEL2 = 33.5;

/** Cávea: do alto (recuo 8 m, 31 m de altura) ao pódio (recuo 53 m). */
const CAVEA_TOPO = { recuo: 8.5, y: 31 };
const CAVEA_BASE = { recuo: 52, y: 4.6 };
const PODIO = { recuo: 53, y: 4.6 };

/**
 * Cores em sRGB (0–1) + alfa. A cena converte para linear. `ganho` > 1
 * passa do branco nominal de propósito: é o que alimenta o bloom.
 */
export type Rgba = readonly [number, number, number, number];
const hex = (h: string, a: number, ganho = 1): Rgba => {
  const n = parseInt(h.slice(1), 16);
  return [(((n >> 16) & 255) / 255) * ganho, (((n >> 8) & 255) / 255) * ganho, ((n & 255) / 255) * ganho, a];
};
const BRANCO = "#ffffff";
const VERMELHO = "#ff4b3e";
const MARCA = "#b0121c";

export const COR = {
  cornija: hex(BRANCO, 0.7, 1.2),
  estrutura: hex(BRANCO, 0.38),
  coluna: hex(BRANCO, 0.3),
  faceInterna: hex(BRANCO, 0.16),
  ruina: hex(BRANCO, 0.55),
  janela: hex(BRANCO, 0.42),
  arco: hex(VERMELHO, 1, 1.5),
  arcoInterno: hex(VERMELHO, 0.32),
  arcoAnel2: hex(VERMELHO, 0.75, 1.3),
  degrau: hex(BRANCO, 0.3),
  espelho: hex(BRANCO, 0.12),
  balteo: hex(BRANCO, 0.5),
  escada: hex(BRANCO, 0.22),
  podio: hex(VERMELHO, 0.85, 1.3),
  arena: hex(VERMELHO, 1, 1.7),
  hipogeu: hex(VERMELHO, 0.6, 1.2),
  hipogeuFundo: hex(MARCA, 0.5),
  base: hex(BRANCO, 0.2),
  baseMarca: hex(VERMELHO, 0.6, 1.2),
} as const;

export interface OpcoesGeometria {
  /** Arcos por volta (o real tem 80). */
  vaos: number;
  /** Degraus da cávea. */
  degraus: number;
  /** Segmentos por volta nos anéis contínuos (cávea, arena, base). */
  segmentosAnel: number;
  /** Subdivisões (s × y) de cada vão no oclusor — a borda do arco. */
  gradeOclusor: number;
  /** Detalhes miúdos (face interna, colunas duplas, consolos, hipogeu fundo). */
  detalhado: boolean;
}

export const OPCOES_PADRAO: OpcoesGeometria = {
  vaos: 64,
  degraus: 16,
  segmentosAnel: 256,
  gradeOclusor: 10,
  detalhado: true,
};

export interface GeometriaColiseu {
  /** xyz por vértice; cada par de vértices é um segmento. */
  posicoes: Float32Array;
  /** rgba (sRGB) por vértice. */
  cores: Float32Array;
  /** 1 = elemento da arena (revelado por ângulo), 0 = revelado por altura. */
  arena: Float32Array;
  /** Triângulos dos oclusores, xyz por vértice. */
  oclusores: Float32Array;
}

type V3 = readonly [number, number, number];

/** Ponto na elipse recuada `recuo` metros para dentro, no ângulo paramétrico t. */
function ponto(recuo: number, t: number, y: number): V3 {
  return [(SEMIEIXO_X - recuo) * Math.cos(t), y, (SEMIEIXO_Z - recuo) * Math.sin(t)];
}

/** Ruído determinístico em [0, 1) — a ruína sai igual em toda renderização. */
function ruido(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Ângulos paramétricos que dividem a elipse em arcos de comprimento igual
 * (os vãos do monumento real têm a mesma largura em toda a volta).
 */
function angulosPorPerimetro(n: number): number[] {
  const AMOSTRAS = 4096;
  const acumulado: number[] = [0];
  let anterior = ponto(0, 0, 0);
  for (let i = 1; i <= AMOSTRAS; i++) {
    const p = ponto(0, (i / AMOSTRAS) * Math.PI * 2, 0);
    acumulado.push(acumulado[i - 1] + Math.hypot(p[0] - anterior[0], p[2] - anterior[2]));
    anterior = p;
  }
  const total = acumulado[AMOSTRAS];
  const angulos: number[] = [];
  let k = 0;
  for (let j = 0; j <= n; j++) {
    const alvo = (j / n) * total;
    while (k < AMOSTRAS && acumulado[k + 1] < alvo) k++;
    const f = (alvo - acumulado[k]) / Math.max(1e-9, acumulado[k + 1] - acumulado[k]);
    angulos.push(((k + Math.min(1, Math.max(0, f))) / AMOSTRAS) * Math.PI * 2);
  }
  return angulos;
}

/**
 * Altura do anel externo em cada vão. O lado sul (z > 0, girado um pouco)
 * desabou: perto das pontas a muralha desce em degraus — a ponta "oeste"
 * num declive longo (o contraforte), a "leste" num declive curto.
 */
function alturasDaRuina(vaos: number, centros: number[]): number[] {
  const CENTRO = Math.PI / 2 + 0.25;
  const MEIA_ABERTURA = 0.92;
  const DECLIVE_LONGO = [42, 37, 31, 25, 19, 13, 7];
  const DECLIVE_CURTO = [39, 27, 15, 6];
  const dentro = centros.map((t) => {
    let d = t - CENTRO;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) < MEIA_ABERTURA;
  });
  return centros.map((t, j) => {
    if (!dentro[j]) return ALTURA_TOTAL;
    // distância (em vãos) até a borda da ruína, de cada lado
    let ate = 0;
    while (ate < vaos && dentro[(j - ate - 1 + vaos) % vaos]) ate++;
    let depois = 0;
    while (depois < vaos && dentro[(j + depois + 1) % vaos]) depois++;
    // a escala dos declives acompanha o número de vãos (64 é a referência)
    const k = vaos / 64;
    const iLongo = Math.floor(ate / k);
    const iCurto = Math.floor(depois / k);
    const hLongo = iLongo < DECLIVE_LONGO.length ? DECLIVE_LONGO[iLongo] : 0;
    const hCurto = iCurto < DECLIVE_CURTO.length ? DECLIVE_CURTO[iCurto] : 0;
    return Math.max(hLongo, hCurto);
  });
}

class Construtor {
  readonly pos: number[] = [];
  readonly cor: number[] = [];
  readonly are: number[] = [];
  readonly ocl: number[] = [];

  segmento(a: V3, b: V3, c: Rgba, arena = 0) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    this.cor.push(c[0], c[1], c[2], c[3], c[0], c[1], c[2], c[3]);
    this.are.push(arena, arena);
  }

  polilinha(pts: V3[], c: Rgba, arena = 0) {
    for (let i = 0; i < pts.length - 1; i++) this.segmento(pts[i], pts[i + 1], c, arena);
  }

  quad(a: V3, b: V3, c: V3, d: V3) {
    this.ocl.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
}

export function gerarGeometria(opcoes: Partial<OpcoesGeometria> = {}): GeometriaColiseu {
  const o = { ...OPCOES_PADRAO, ...opcoes };
  const g = new Construtor();
  const N = o.vaos;
  const ang = angulosPorPerimetro(N);
  const centros = ang.slice(0, N).map((t, j) => (t + ang[j + 1]) / 2);
  const alturas = alturasDaRuina(N, centros);
  const larguraVao = (2 * Math.PI * Math.sqrt((SEMIEIXO_X ** 2 + SEMIEIXO_Z ** 2) / 2)) / N;
  const ABERTURA = 0.6; // fração do vão ocupada pelo arco
  const raioArco = (larguraVao * ABERTURA) / 2;
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

  /**
   * Topo da muralha externa ao longo do vão: 4 degraus irregulares entre a
   * altura deste vão e a do vizinho, para a borda da ruína parecer quebrada.
   */
  const SUB = 4;
  const topoVao = (j: number): number[] => {
    const h = alturas[j];
    if (h >= ALTURA_TOTAL) return Array(SUB).fill(ALTURA_TOTAL);
    if (h <= 0) return Array(SUB).fill(0);
    const anterior = alturas[(j - 1 + N) % N];
    const proximo = alturas[(j + 1) % N];
    return Array.from({ length: SUB }, (_, k) => {
      const f = (k + 0.5) / SUB;
      const vizinho = f < 0.5 ? anterior : proximo;
      const peso = Math.abs(f - 0.5) * 0.9;
      const base = lerp(h, Math.min(Math.max(vizinho, 0), ALTURA_TOTAL), peso);
      return Math.max(0.8, Math.min(ALTURA_TOTAL, base + (ruido(j * 7 + k) - 0.5) * 3.2));
    });
  };
  const topos = Array.from({ length: N }, (_, j) => topoVao(j));
  const topoMin = topos.map((t) => Math.min(...t));

  /** Ponto do vão j em fração s ∈ [0,1], no recuo e altura dados. */
  const pv = (j: number, s: number, recuo: number, y: number) => ponto(recuo, lerp(ang[j], ang[j + 1], s), y);

  /** Arco (ombreiras + semicírculo) de um nível, no vão j. */
  const arco = (j: number, recuo: number, yIni: number, yNasc: number, c: Rgba) => {
    const pts: V3[] = [];
    const s0 = 0.5 - ABERTURA / 2;
    pts.push(pv(j, s0, recuo, yIni));
    const PASSOS = 10;
    for (let k = 0; k <= PASSOS; k++) {
      const phi = Math.PI - (k / PASSOS) * Math.PI;
      pts.push(pv(j, 0.5 + (ABERTURA / 2) * Math.cos(phi), recuo, yNasc + raioArco * Math.sin(phi)));
    }
    pts.push(pv(j, 1 - s0, recuo, yIni));
    g.polilinha(pts, c);
  };

  /** A abertura do arco contém o ponto (s, y) do vão? */
  const dentroDoArco = (s: number, y: number, yIni: number, yNasc: number) => {
    const dx = ((s - 0.5) / (ABERTURA / 2)) * raioArco;
    if (Math.abs(dx) > raioArco) return false;
    if (y < yIni) return false;
    if (y <= yNasc) return true;
    return Math.hypot(dx, y - yNasc) < raioArco;
  };

  // ------------------------------------------------------------------
  // Anel externo: três ordens de arcadas + ático, com a ruína no sul.
  // ------------------------------------------------------------------
  for (let j = 0; j < N; j++) {
    const topo = topos[j];
    const hMin = topoMin[j];
    if (alturas[j] <= 0) continue;

    const nascimentos = NIVEIS.map((n) => n.topo - 1.9 - raioArco);

    NIVEIS.forEach((nivel, i) => {
      const yIni = nivel.base + nivel.plinto;
      const yNasc = nascimentos[i];
      if (yNasc + raioArco < hMin) {
        arco(j, 0, yIni, yNasc, COR.arco);
        if (o.detalhado) {
          arco(j, ESPESSURA, yIni, yNasc, COR.arcoInterno);
          // espessura do arco: ligações face externa ↔ interna
          for (const s of [0.5 - ABERTURA / 2, 0.5 + ABERTURA / 2]) {
            g.segmento(pv(j, s, 0, yIni), pv(j, s, ESPESSURA, yIni), COR.faceInterna);
            g.segmento(pv(j, s, 0, yNasc), pv(j, s, ESPESSURA, yNasc), COR.faceInterna);
          }
          g.segmento(pv(j, 0.5, 0, yNasc + raioArco), pv(j, 0.5, ESPESSURA, yNasc + raioArco), COR.faceInterna);
        }
      }
      // cornija e arquitrave no topo do nível; balaustrada (plinto) na base
      if (nivel.topo <= hMin) {
        g.segmento(pv(j, 0, -0.8, nivel.topo), pv(j, 1, -0.8, nivel.topo), COR.cornija);
        g.segmento(pv(j, 0, -0.4, nivel.topo - 0.7), pv(j, 1, -0.4, nivel.topo - 0.7), COR.estrutura);
        g.segmento(pv(j, 0, -0.2, nivel.topo - 1.6), pv(j, 1, -0.2, nivel.topo - 1.6), COR.coluna);
        if (o.detalhado) g.segmento(pv(j, 0, ESPESSURA, nivel.topo), pv(j, 1, ESPESSURA, nivel.topo), COR.faceInterna);
      }
      if (nivel.plinto > 0 && yIni <= hMin) {
        g.segmento(pv(j, 0, -0.3, yIni), pv(j, 1, -0.3, yIni), COR.coluna);
      }
    });

    // ático: parede cega, janelinhas em vãos alternados, consolos no alto
    if (ATICO.topo <= hMin) {
      g.segmento(pv(j, 0, -1, ATICO.topo), pv(j, 1, -1, ATICO.topo), COR.cornija);
      g.segmento(pv(j, 0, -0.6, ATICO.topo - 0.9), pv(j, 1, -0.6, ATICO.topo - 0.9), COR.estrutura);
      g.segmento(pv(j, 0, ESPESSURA, ATICO.topo), pv(j, 1, ESPESSURA, ATICO.topo), COR.faceInterna);
      if (o.detalhado) {
        for (const s of [0.25, 0.5, 0.75]) {
          g.segmento(pv(j, s, -0.5, ATICO.topo - 3.4), pv(j, s, -0.5, ATICO.topo - 2.2), COR.coluna);
        }
      }
    }
    if (j % 2 === 0 && ATICO.base + 6 < hMin) {
      const y0 = ATICO.base + 3.2;
      const y1 = y0 + 2.6;
      const sa = 0.4;
      const sb = 0.6;
      g.polilinha(
        [pv(j, sa, 0, y0), pv(j, sb, 0, y0), pv(j, sb, 0, y1), pv(j, sa, 0, y1), pv(j, sa, 0, y0)],
        COR.janela,
      );
    }

    // pilastras / meias-colunas na divisa com o vão seguinte
    const hDivisa = Math.min(topo[SUB - 1], topos[(j + 1) % N][0]);
    const dt = (ang[j + 1] - ang[j]) * 0.07;
    const tDiv = ang[j + 1];
    const colunas = o.detalhado ? [tDiv - dt, tDiv + dt] : [tDiv];
    for (const t of colunas) {
      g.segmento(ponto(-0.5, t, 0), ponto(-0.5, t, Math.min(hDivisa, ALTURA_TOTAL - 0.9)), COR.coluna);
    }

    // ponta quebrada: topo em degraus nas faces externa e interna + espessura
    if (topo.some((h) => h < ALTURA_TOTAL)) {
      for (const recuo of [0, ESPESSURA]) {
        const pts: V3[] = [];
        for (let k = 0; k < SUB; k++) {
          pts.push(pv(j, k / SUB, recuo, topo[k]), pv(j, (k + 1) / SUB, recuo, topo[k]));
        }
        g.polilinha(pts, recuo === 0 ? COR.ruina : COR.faceInterna);
      }
      for (let k = 0; k <= SUB; k++) {
        const h = k < SUB ? topo[k] : topo[SUB - 1];
        g.segmento(pv(j, k / SUB, 0, h), pv(j, k / SUB, ESPESSURA, h), COR.estrutura);
      }
      // degraus entre sub-trechos (e com os vãos vizinhos)
      for (let k = 1; k < SUB; k++) {
        const a = topo[k - 1];
        const b = topo[k];
        for (const recuo of [0, ESPESSURA]) {
          g.segmento(pv(j, k / SUB, recuo, a), pv(j, k / SUB, recuo, b), recuo === 0 ? COR.ruina : COR.faceInterna);
        }
      }
      const vizinhos: [number, number, number][] = [
        [0, alturas[(j - 1 + N) % N] > 0 ? topos[(j - 1 + N) % N][SUB - 1] : 0, topo[0]],
        [1, alturas[(j + 1) % N] > 0 ? topos[(j + 1) % N][0] : 0, topo[SUB - 1]],
      ];
      for (const [s, hViz, hAqui] of vizinhos) {
        if (Math.abs(hViz - hAqui) < 0.01) continue;
        for (const recuo of [0, ESPESSURA]) {
          g.segmento(pv(j, s, recuo, hViz), pv(j, s, recuo, hAqui), recuo === 0 ? COR.ruina : COR.faceInterna);
        }
        if (hViz === 0) {
          // face do corte, ao rés do chão
          g.segmento(pv(j, s, 0, 0), pv(j, s, ESPESSURA, 0), COR.estrutura);
        }
      }
    }

    // oclusor da muralha (com os buracos dos arcos) e tampa do topo
    const G = o.gradeOclusor;
    const RECUO_OCL = 0.8;
    for (let a = 0; a < G; a++) {
      const s0 = a / G;
      const s1 = (a + 1) / G;
      const hCol = topo[Math.min(SUB - 1, Math.floor(((a + 0.5) / G) * SUB))];
      // faixas verticais: 1 m de resolução, mais fina perto dos arcos
      let y = 0;
      while (y < hCol - 1e-6) {
        const y1 = Math.min(hCol, y + 1);
        const ym = (y + y1) / 2;
        const sm = (s0 + s1) / 2;
        const nivel = NIVEIS.findIndex((n) => ym >= n.base && ym < n.topo);
        const vazado =
          nivel >= 0 &&
          dentroDoArco(sm, ym, NIVEIS[nivel].base + NIVEIS[nivel].plinto, NIVEIS[nivel].topo - 1.9 - raioArco) &&
          NIVEIS[nivel].topo - 1.9 < hMin;
        if (!vazado) {
          g.quad(pv(j, s0, RECUO_OCL, y), pv(j, s1, RECUO_OCL, y), pv(j, s1, RECUO_OCL, y1), pv(j, s0, RECUO_OCL, y1));
        }
        y = y1;
      }
      g.quad(pv(j, s0, 0, hCol), pv(j, s1, 0, hCol), pv(j, s1, ESPESSURA, hCol), pv(j, s0, ESPESSURA, hCol));
    }
    // terraço do pórtico superior, entre o anel externo e o alto da cávea
    if (hMin >= ATICO.base) {
      g.quad(
        pv(j, 0, ESPESSURA, ATICO.base),
        pv(j, 1, ESPESSURA, ATICO.base),
        pv(j, 1, CAVEA_TOPO.recuo, CAVEA_TOPO.y),
        pv(j, 0, CAVEA_TOPO.recuo, CAVEA_TOPO.y),
      );
      if (o.detalhado) {
        // face interna do ático (o que se vê do lado de dentro, lá do fundo)
        g.segmento(pv(j, 0, ESPESSURA, ATICO.base), pv(j, 1, ESPESSURA, ATICO.base), COR.faceInterna);
        g.segmento(pv(j, 1, ESPESSURA, ATICO.base), pv(j, 1, ESPESSURA, ATICO.topo), COR.faceInterna);
      }
    }
  }

  // ------------------------------------------------------------------
  // Segundo anel: só aparece de verdade onde o externo caiu.
  // ------------------------------------------------------------------
  const ruinaAnel2 = (j: number) => {
    if (alturas[j] >= ALTURA_TOTAL) return ALTURA_ANEL2;
    return 26 + ruido(j * 13) * 5;
  };
  for (let j = 0; j < N; j++) {
    const exposto = alturas[j] < NIVEIS[1].topo;
    const hTopo = ruinaAnel2(j);
    if (!exposto && !o.detalhado) continue;
    NIVEIS.forEach((nivel) => {
      const yIni = nivel.base + nivel.plinto * 0.5;
      const yNasc = nivel.topo - 1.6 - raioArco * 0.8;
      if (yNasc + raioArco > hTopo) return;
      arco(j, ANEL2, yIni, yNasc, exposto ? COR.arcoAnel2 : COR.arcoInterno);
      if (exposto) {
        g.segmento(pv(j, 0, ANEL2 - 0.4, nivel.topo), pv(j, 1, ANEL2 - 0.4, nivel.topo), COR.estrutura);
      }
    });
    if (exposto) {
      // topo irregular do segundo anel e da sua face interna
      const hProx = ruinaAnel2((j + 1) % N);
      g.polilinha([pv(j, 0, ANEL2, hTopo), pv(j, 1, ANEL2, hTopo), pv(j, 1, ANEL2, hProx)], COR.ruina);
      g.segmento(pv(j, 0, ANEL2 + ESPESSURA_ANEL2, hTopo), pv(j, 1, ANEL2 + ESPESSURA_ANEL2, hTopo), COR.faceInterna);
      g.segmento(pv(j, 1, ANEL2, 0), pv(j, 1, ANEL2, Math.min(hTopo, hProx)), COR.coluna);
      // fundação do anel externo desaparecido, rente ao chão
      g.segmento(pv(j, 0, 0, 0), pv(j, 1, 0, 0), COR.base);
      g.segmento(pv(j, 0, ESPESSURA, 0), pv(j, 1, ESPESSURA, 0), COR.base);
      // paredes radiais do deambulatório, cortadas a alturas diferentes
      const hRadial = 3 + ruido(j * 3.3) * 9;
      g.polilinha(
        [pv(j, 1, ESPESSURA, 0), pv(j, 1, ESPESSURA, hRadial), pv(j, 1, ANEL2, hRadial + 2)],
        COR.faceInterna,
      );
      g.quad(pv(j, 1, ESPESSURA, 0), pv(j, 1, ANEL2, 0), pv(j, 1, ANEL2, hRadial + 2), pv(j, 1, ESPESSURA, hRadial));
    }
    // oclusor do segundo anel (com arcos vazados)
    const G = o.gradeOclusor;
    for (let a = 0; a < G; a++) {
      const s0 = a / G;
      const s1 = (a + 1) / G;
      let y = 0;
      while (y < hTopo - 1e-6) {
        const y1 = Math.min(hTopo, y + 1);
        const ym = (y + y1) / 2;
        const nivel = NIVEIS.findIndex((n) => ym >= n.base && ym < n.topo);
        const n = NIVEIS[nivel];
        const vazado =
          nivel >= 0 &&
          dentroDoArco((s0 + s1) / 2, ym, n.base + n.plinto * 0.5, n.topo - 1.6 - raioArco * 0.8) &&
          n.topo - 1.6 + raioArco * 0.2 <= hTopo;
        if (!vazado) g.quad(pv(j, s0, ANEL2 + 0.3, y), pv(j, s1, ANEL2 + 0.3, y), pv(j, s1, ANEL2 + 0.3, y1), pv(j, s0, ANEL2 + 0.3, y1));
        y = y1;
      }
      g.quad(pv(j, s0, ANEL2, hTopo), pv(j, s1, ANEL2, hTopo), pv(j, s1, ANEL2 + ESPESSURA_ANEL2, hTopo), pv(j, s0, ANEL2 + ESPESSURA_ANEL2, hTopo));
    }
  }

  // ------------------------------------------------------------------
  // Cávea: degraus em anéis, baltéus entre os menianos, escadas radiais.
  // ------------------------------------------------------------------
  const M = o.segmentosAnel;
  const K = o.degraus;
  /** Altura máxima da cávea no ângulo t (no sul ela também ruiu). */
  const limiteCavea = (t: number) => {
    const tt = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let j = 0;
    while (j < N - 1 && ang[j + 1] <= tt) j++;
    return alturas[j] >= ALTURA_TOTAL ? Infinity : ruinaAnel2(j) - 3;
  };
  const degraus = Array.from({ length: K + 1 }, (_, k) => ({
    recuo: lerp(CAVEA_TOPO.recuo, CAVEA_BASE.recuo, k / K),
    y: lerp(CAVEA_TOPO.y, CAVEA_BASE.y, k / K),
  }));
  const BALTEOS = new Set([Math.round(K * 0.3), Math.round(K * 0.68)]);
  const anelCavea = (recuo: number, y: number, c: Rgba) => {
    for (let m = 0; m < M; m++) {
      const t0 = (m / M) * Math.PI * 2;
      const t1 = ((m + 1) / M) * Math.PI * 2;
      if (y > limiteCavea((t0 + t1) / 2)) continue;
      g.segmento(ponto(recuo, t0, y), ponto(recuo, t1, y), c);
    }
  };
  for (let k = 0; k < K; k++) {
    const a = degraus[k];
    const b = degraus[k + 1];
    anelCavea(b.recuo, a.y, COR.degrau); // quina do piso do degrau
    if (o.detalhado) anelCavea(b.recuo, b.y, COR.espelho); // pé do espelho
    if (BALTEOS.has(k + 1)) anelCavea(b.recuo + 0.2, a.y + 1.1, COR.balteo);
  }
  anelCavea(CAVEA_TOPO.recuo, CAVEA_TOPO.y, COR.estrutura);
  // escadas radiais (scalaria) a cada 4 vãos, em zigue-zague pelos degraus
  for (let j = 0; j < N; j += 4) {
    for (const ds of [-0.012, 0.012]) {
      const t = ang[j] + ds;
      if (CAVEA_TOPO.y > limiteCavea(t)) continue;
      const pts: V3[] = [];
      for (let k = 0; k < K; k++) {
        pts.push(ponto(degraus[k].recuo, t, degraus[k].y), ponto(degraus[k + 1].recuo, t, degraus[k].y));
      }
      g.polilinha(pts, COR.escada);
    }
  }
  // oclusor da cávea: a rampa pelos pés dos espelhos
  for (let m = 0; m < M; m++) {
    const t0 = (m / M) * Math.PI * 2;
    const t1 = ((m + 1) / M) * Math.PI * 2;
    const lim = limiteCavea((t0 + t1) / 2);
    for (let k = 0; k < K; k++) {
      const a = degraus[k];
      const b = degraus[k + 1];
      if (a.y > lim) continue;
      g.quad(ponto(a.recuo, t0, a.y), ponto(a.recuo, t1, a.y), ponto(b.recuo, t1, b.y), ponto(b.recuo, t0, b.y));
    }
    // parede do pódio
    g.quad(ponto(PODIO.recuo, t0, 0), ponto(PODIO.recuo, t1, 0), ponto(PODIO.recuo, t1, PODIO.y), ponto(PODIO.recuo, t0, PODIO.y));
  }

  // pódio: parapeito, terraço e muro até a arena
  for (let m = 0; m < M; m++) {
    const t0 = (m / M) * Math.PI * 2;
    const t1 = ((m + 1) / M) * Math.PI * 2;
    g.segmento(ponto(PODIO.recuo, t0, PODIO.y + 1), ponto(PODIO.recuo, t1, PODIO.y + 1), COR.podio);
    g.segmento(ponto(PODIO.recuo, t0, PODIO.y), ponto(PODIO.recuo, t1, PODIO.y), COR.estrutura);
  }
  for (let j = 0; j < N; j += 2) {
    g.segmento(ponto(PODIO.recuo, ang[j], 0), ponto(PODIO.recuo, ang[j], PODIO.y + 1), COR.coluna);
  }

  // ------------------------------------------------------------------
  // Arena e hipogeu (revelados por varredura angular).
  // ------------------------------------------------------------------
  for (let m = 0; m < M; m++) {
    const t0 = (m / M) * Math.PI * 2;
    const t1 = ((m + 1) / M) * Math.PI * 2;
    g.segmento(ponto(PODIO.recuo, t0, 0), ponto(PODIO.recuo, t1, 0), COR.arena, 1);
    g.segmento(ponto(PODIO.recuo + 4, t0, -0.2), ponto(PODIO.recuo + 4, t1, -0.2), COR.hipogeu, 1);
  }
  // hipogeu: corredores paralelos ao eixo maior, recortados por uma elipse
  const HA = SEMIEIXO_X - PODIO.recuo - 5;
  const HB = SEMIEIXO_Z - PODIO.recuo - 5;
  const PROF = -5;
  const corredores = [-16.5, -13, -9.5, -6, -2.2, 2.2, 6, 9.5, 13, 16.5];
  for (const z of corredores) {
    const meia = HA * Math.sqrt(Math.max(0, 1 - (z / HB) ** 2));
    if (meia < 4) continue;
    const xa = -meia;
    const xb = meia;
    g.segmento([xa, 0, z], [xb, 0, z], COR.hipogeu, 1);
    if (o.detalhado) {
      g.segmento([xa, PROF, z], [xb, PROF, z], COR.hipogeuFundo, 1);
      g.segmento([xa, 0, z], [xa, PROF, z], COR.hipogeuFundo, 1);
      g.segmento([xb, 0, z], [xb, PROF, z], COR.hipogeuFundo, 1);
    }
  }
  // travessas e as celas das bordas
  for (let x = -30; x <= 30; x += 7.5) {
    const meia = HB * Math.sqrt(Math.max(0, 1 - (x / HA) ** 2));
    g.segmento([x, 0, -meia], [x, 0, meia], COR.hipogeuFundo, 1);
  }

  // ------------------------------------------------------------------
  // Base holográfica: anéis no chão com marcas por vão.
  // ------------------------------------------------------------------
  for (let m = 0; m < M; m++) {
    const t0 = (m / M) * Math.PI * 2;
    const t1 = ((m + 1) / M) * Math.PI * 2;
    g.segmento(ponto(-2, t0, 0), ponto(-2, t1, 0), COR.estrutura);
    g.segmento(ponto(-12, t0, 0), ponto(-12, t1, 0), COR.base);
    if (m % 2 === 0) g.segmento(ponto(-16, t0, 0), ponto(-16, t1, 0), COR.base);
  }
  for (let j = 0; j < N; j++) {
    const longa = j % 8 === 0;
    g.segmento(ponto(-12, ang[j], 0), ponto(longa ? -17 : -13.5, ang[j], 0), longa ? COR.baseMarca : COR.base);
  }

  return {
    posicoes: new Float32Array(g.pos),
    cores: new Float32Array(g.cor),
    arena: new Float32Array(g.are),
    oclusores: new Float32Array(g.ocl),
  };
}
