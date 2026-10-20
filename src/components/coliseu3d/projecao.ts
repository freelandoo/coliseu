/**
 * Gera o desenho estático do `ArenaWireframe`: a mesma geometria da cena 3D
 * (`geometria.ts`), projetada da mesma câmera, com as linhas escondidas
 * removidas por um z-buffer em software (os oclusores rasterizados).
 *
 * Não roda no app — o resultado fica gravado como constante em
 * `aula-experimental/ArenaWireframe.tsx`. Para regerar depois de mexer na
 * geometria ou no enquadramento:
 *
 *   npx esbuild src/components/coliseu3d/projecao.ts --bundle --platform=node \
 *     --format=cjs --outfile=<tmp>/projecao.cjs
 *   node -e "console.log(JSON.stringify(require('<tmp>/projecao.cjs').projetarArena()))"
 *
 * e cole `viewBox` e `tracos` no componente.
 */
import { ENQUADRAMENTO, distanciaCamera, gerarGeometria } from "./geometria";

export interface TracoSvg {
  /** "tinta" = currentColor; "vivo" = #ff4b3e; "marca" = #b0121c. */
  cor: "tinta" | "vivo" | "marca";
  opacidade: number;
  d: string;
}

export interface ArenaProjetada {
  viewBox: string;
  tracos: TracoSvg[];
}

const LARGURA = 320;
const ALTURA = 190;
/** Resolução do z-buffer (múltiplo do viewBox: oclusão mais fina). */
const SUPER = 6;

export function projetarArena(): ArenaProjetada {
  const geo = gerarGeometria({ vaos: 48, degraus: 10, segmentosAnel: 128, gradeOclusor: 10, detalhado: false });
  const aspecto = LARGURA / ALTURA;
  const dist = distanciaCamera(aspecto);
  const e = ENQUADRAMENTO.elevacao;
  const cam = [0, Math.sin(e) * dist, Math.cos(e) * dist];
  // base da câmera (lookAt na origem, "up" = +y)
  const zc = [cam[0] / dist, cam[1] / dist, cam[2] / dist];
  const xc = [zc[2], 0, -zc[0]];
  const nx = Math.hypot(xc[0], xc[2]);
  xc[0] /= nx;
  xc[2] /= nx;
  const yc = [zc[1] * xc[2] - zc[2] * xc[1], zc[2] * xc[0] - zc[0] * xc[2], zc[0] * xc[1] - zc[1] * xc[0]];
  const tanV = Math.tan(((ENQUADRAMENTO.fov / 2) * Math.PI) / 180);
  const tanH = tanV * aspecto;
  const cosR = Math.cos(ENQUADRAMENTO.rotacaoInicial);
  const senR = Math.sin(ENQUADRAMENTO.rotacaoInicial);

  /** metros → [x tela, y tela, profundidade]. */
  const projetar = (px: number, py: number, pz: number): [number, number, number] => {
    const s = ENQUADRAMENTO.escala;
    const x0 = px * s;
    const y0 = py * s + ENQUADRAMENTO.deslocamentoY;
    const z0 = pz * s;
    const x = x0 * cosR + z0 * senR;
    const z = -x0 * senR + z0 * cosR;
    const dx = x - cam[0];
    const dy = y0 - cam[1];
    const dz = z - cam[2];
    const vx = dx * xc[0] + dy * xc[1] + dz * xc[2];
    const vy = dx * yc[0] + dy * yc[1] + dz * yc[2];
    const prof = -(dx * zc[0] + dy * zc[1] + dz * zc[2]);
    return [((vx / prof / tanH + 1) / 2) * LARGURA, ((1 - vy / prof / tanV) / 2) * ALTURA, prof];
  };

  // ---------------------------------------------------------- z-buffer
  const W = LARGURA * SUPER;
  const H = ALTURA * SUPER;
  const zbuf = new Float32Array(W * H).fill(0); // guarda 1/profundidade (maior = mais perto)
  const o = geo.oclusores;
  for (let i = 0; i < o.length; i += 9) {
    const a = projetar(o[i], o[i + 1], o[i + 2]);
    const b = projetar(o[i + 3], o[i + 4], o[i + 5]);
    const c = projetar(o[i + 6], o[i + 7], o[i + 8]);
    const ax = a[0] * SUPER, ay = a[1] * SUPER, bx = b[0] * SUPER, by = b[1] * SUPER, cx = c[0] * SUPER, cy = c[1] * SUPER;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    const ia = 1 / a[2], ib = 1 / b[2], ic = 1 / c[2];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const inv = w0 * ia + w1 * ib + w2 * ic;
        const k = y * W + x;
        if (inv > zbuf[k]) zbuf[k] = inv;
      }
    }
  }
  /** Ponto visível? Folga de ~0,45 m (o "polygonOffset" do software). */
  const FOLGA = 0.45 * ENQUADRAMENTO.escala;
  const visivel = (x: number, y: number, prof: number) => {
    const cx = Math.floor(x * SUPER);
    const cy = Math.floor(y * SUPER);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    // o pixel e os vizinhos: a linha não some por um pixel de serrilhado
    let maisPerto = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const v = zbuf[yy * W + xx];
        if (v > 0 && (maisPerto === 0 || v < maisPerto)) maisPerto = v;
      }
    }
    if (maisPerto === 0) return true;
    return prof <= 1 / maisPerto + FOLGA;
  };

  // ------------------------------------------------- traços visíveis
  const grupos = new Map<string, { cor: TracoSvg["cor"]; opacidade: number; trechos: [number, number][][] }>();
  const pos = geo.posicoes;
  const cores = geo.cores;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let v = 0; v < pos.length / 3; v += 2) {
    const a = projetar(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    const b = projetar(pos[v * 3 + 3], pos[v * 3 + 4], pos[v * 3 + 5]);
    const r = cores[v * 4];
    const g = cores[v * 4 + 1];
    const alfa = cores[v * 4 + 3];
    const cor: TracoSvg["cor"] = g > 0.6 * r ? "tinta" : r > 0.9 ? "vivo" : "marca";
    // fundo mais apagado que a frente, como na cena
    const fundo = Math.min(1, Math.max(0, ((a[2] + b[2]) / 2 - (dist - 0.9)) / 1.8));
    const opacidade = Math.max(0.2, Math.round(Math.min(1, alfa * (1 - fundo * 0.55)) * 10) / 10);
    if (opacidade <= 0) continue;
    const chave = `${cor}:${opacidade}`;
    if (!grupos.has(chave)) grupos.set(chave, { cor, opacidade, trechos: [] });
    const grupo = grupos.get(chave)!;

    const passos = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4));
    let trecho: [number, number][] | null = null;
    for (let i = 0; i <= passos; i++) {
      const f = i / passos;
      const x = a[0] + (b[0] - a[0]) * f;
      const y = a[1] + (b[1] - a[1]) * f;
      // profundidade perspectiva-correta ao longo do segmento
      const prof = 1 / ((1 - f) / a[2] + f / b[2]);
      if (visivel(x, y, prof)) {
        if (!trecho) {
          trecho = [];
          grupo.trechos.push(trecho);
        }
        trecho.push([x, y]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      } else {
        trecho = null;
      }
    }
  }

  // ----------------------------------------------------------- saída
  const MARGEM = 2;
  const ox = minX - MARGEM;
  const oy = minY - MARGEM;
  const n = (x: number) => Math.round(x * 10) / 10;
  const tracos: TracoSvg[] = [];
  /** Número curto: uma casa, sem zero à esquerda (".5", "-.5"). */
  const num = (x: number) => {
    const v = Math.round(x * 10) / 10;
    const t = String(Object.is(v, -0) ? 0 : v);
    return t.replace(/^(-?)0\./, "$1.");
  };
  /** Par relativo, com separador só quando o sinal não separa. */
  const par = (dx: number, dy: number) => {
    const b = num(dy);
    return `${num(dx)}${b.startsWith("-") ? "" : " "}${b}`;
  };
  for (const g of grupos.values()) {
    // caminho relativo (m/l); trechos que continuam o anterior viram só "l"
    let d = "";
    let cur: [number, number] | null = null; // posição atual já arredondada
    for (const t of g.trechos) {
      if (t.length < 2) continue;
      const ini = t[0];
      const fim = t[t.length - 1];
      if (Math.hypot(fim[0] - ini[0], fim[1] - ini[1]) < 0.35) continue;
      const a: [number, number] = [n(ini[0] - ox), n(ini[1] - oy)];
      const b: [number, number] = [n(fim[0] - ox), n(fim[1] - oy)];
      if (!cur) d += `M${num(a[0])} ${num(a[1])}`;
      else if (a[0] !== cur[0] || a[1] !== cur[1]) d += `m${par(a[0] - cur[0], a[1] - cur[1])}`;
      d += `l${par(b[0] - a[0], b[1] - a[1])}`;
      cur = b;
    }
    if (d) tracos.push({ cor: g.cor, opacidade: g.opacidade, d });
  }
  tracos.sort((a, b) => a.opacidade - b.opacidade);
  return {
    viewBox: `0 0 ${n(maxX - minX + MARGEM * 2)} ${n(maxY - minY + MARGEM * 2)}`,
    tracos,
  };
}
