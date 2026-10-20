/**
 * Cena three.js do Coliseu holográfico. Carregada sob demanda por
 * `Coliseu3D` (import dinâmico), então o three NÃO entra no pacote principal.
 *
 * WebGPURenderer de 'three/webgpu': usa WebGPU quando existe e cai sozinho
 * para WebGL2 quando não. Se nem isso inicializar, `montarCena` rejeita e o
 * componente segue mostrando o SVG estático.
 *
 * Tudo é aramado: linhas translúcidas (brancas na estrutura, vermelhas nos
 * arcos e na arena) com brilho (bloom TSL). Paredes invisíveis que só
 * escrevem profundidade escondem as linhas de trás.
 *
 * Movimento: constrói de baixo para cima (arena primeiro, ático por último,
 * ~2,5 s), depois gira devagar (1 volta / 40 s), inclina até ±8° seguindo o
 * ponteiro e, de tempos em tempos, uma linha de varredura sobe pelo modelo.
 * Em movimento reduzido: um único quadro, pronto e parado.
 */
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicNodeMaterial,
  LineSegments,
  Mesh,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  PostProcessing,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import {
  abs,
  atan,
  attribute,
  clamp,
  exp,
  float,
  max,
  min,
  mix,
  pass,
  sRGBTransferOETF,
  positionLocal,
  positionView,
  screenUV,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ALTURA_TOTAL, ENQUADRAMENTO, distanciaCamera, gerarGeometria } from "./geometria";

export type Intensidade = "destaque" | "discreto";

export interface OpcoesCena {
  intensidade: Intensidade;
  /** prefers-reduced-motion: um quadro estático, montado e parado. */
  reduzido: boolean;
  /** Chamado uma vez, depois que o primeiro quadro foi desenhado. */
  aoPrimeiroQuadro: () => void;
  /** Chamado uma vez, quando a construção termina (na hora, em movimento reduzido). */
  aoConstruido?: () => void;
  /** O render falhou depois de pronto (ex.: dispositivo da GPU perdido): o laço já parou. */
  aoFalhar?: () => void;
  /** Desmontagem durante a inicialização assíncrona (StrictMode, navegação). */
  sinal?: AbortSignal;
  /** Força o backend WebGL2 (testes). */
  forcarWebGL?: boolean;
  /** Começa a animação deste instante (s) — para inspecionar quadros em testes. */
  tempoInicial?: number;
}

const ROTACAO_INICIAL = ENQUADRAMENTO.rotacaoInicial;
const VOLTA_SEGUNDOS = 40;
const INCLINACAO_MAX = (8 * Math.PI) / 180;
const ELEVACAO = ENQUADRAMENTO.elevacao;

const DURACAO_ARENA = 0.75;
const INICIO_SUBIDA = 0.35;
const DURACAO_TOTAL = 2.5;
const INTERVALO_VARREDURA = 7.5;
/** "discreto" (cabeçalho de tela de trabalho): o giro desacelera até parar em 8s. */
const PARADA_DISCRETO = 8;
const DURACAO_VARREDURA = 2.6;

const BLOOM: Record<Intensidade, { forca: number; raio: number; limiar: number }> = {
  destaque: { forca: 1.05, raio: 0.45, limiar: 0.1 },
  discreto: { forca: 0.5, raio: 0.25, limiar: 0.2 },
};

const saida = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const suave = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** sRGB (0–1) → linear, para as cores dos vértices. */
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export async function montarCena(hospedeiro: HTMLElement, opcoes: OpcoesCena): Promise<() => void> {
  const { intensidade, reduzido, aoPrimeiroQuadro, aoConstruido, aoFalhar, sinal } = opcoes;
  const descartaveis: { dispose(): void }[] = [];

  const renderer = new WebGPURenderer({ antialias: true, alpha: true, forceWebGL: opcoes.forcarWebGL ?? false });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  // absoluto: o tamanho do buffer nunca empurra o layout (nem realimenta o ResizeObserver)
  Object.assign(canvas.style, { position: "absolute", inset: "0", display: "block", width: "100%", height: "100%" });

  try {
    await renderer.init();
  } catch (erro) {
    try {
      renderer.dispose();
    } catch {
      // nada a liberar de um renderer que não chegou a iniciar
    }
    throw erro;
  }
  if (sinal?.aborted) {
    renderer.dispose();
    return () => {};
  }

  // ---------------------------------------------------------------- cena
  const scene = new Scene();
  const camera = new PerspectiveCamera(ENQUADRAMENTO.fov, 1, 0.05, 50);
  const inclinacao = new Group(); // segue o ponteiro
  const giro = new Group(); // rotação contínua
  const modelo = new Group();
  modelo.scale.setScalar(ENQUADRAMENTO.escala);
  modelo.position.y = ENQUADRAMENTO.deslocamentoY;
  giro.rotation.y = ROTACAO_INICIAL;
  scene.add(inclinacao);
  inclinacao.add(giro);
  giro.add(modelo);

  const geo = gerarGeometria();

  // uniforms que conduzem a animação
  const uRevelado = uniform(reduzido ? ALTURA_TOTAL + 10 : -2); // altura (m) já construída
  const uBorda = uniform(reduzido ? 0 : 1); // brilho na frente da construção
  const uArena = uniform(reduzido ? 1.01 : 0); // fração angular da arena
  const uVarredura = uniform(-100); // altura (m) da linha de varredura
  const uForcaVarredura = uniform(0);
  const uPerto = uniform(1);
  const uLonge = uniform(3);

  // ------------------------------------------------------------- linhas
  const geoLinhas = new BufferGeometry();
  geoLinhas.setAttribute("position", new Float32BufferAttribute(geo.posicoes, 3));
  const cores = geo.cores.slice();
  for (let i = 0; i < cores.length; i += 4) {
    cores[i] = linear(cores[i]);
    cores[i + 1] = linear(cores[i + 1]);
    cores[i + 2] = linear(cores[i + 2]);
  }
  geoLinhas.setAttribute("cor", new Float32BufferAttribute(cores, 4));
  geoLinhas.setAttribute("arena", new Float32BufferAttribute(geo.arena, 1));
  descartaveis.push(geoLinhas);

  const cor = attribute("cor", "vec4");
  const ehArena = attribute("arena", "float");
  const y = positionLocal.y;
  // construção por altura (estrutura) ou por varredura angular (arena)
  const porAltura = float(1).sub(smoothstep(uRevelado.sub(0.6), uRevelado.add(0.6), y));
  const angulo = atan(positionLocal.z, positionLocal.x).div(Math.PI * 2).add(0.5);
  const porAngulo = float(1).sub(smoothstep(uArena.sub(0.015), uArena, angulo));
  const mascara = mix(porAltura, porAngulo, ehArena);
  const frente = exp(abs(y.sub(uRevelado)).div(1.8).negate()).mul(uBorda).mul(float(1).sub(ehArena));
  const varredura = exp(y.sub(uVarredura).div(1.1).pow(2).negate()).mul(uForcaVarredura);
  // profundidade: o fundo do anel fica mais apagado que a frente
  const distancia = positionView.z.negate();
  const profundidade = smoothstep(uLonge, uPerto, distancia).mul(0.6).add(0.4);
  const realce = float(1).add(varredura.mul(1.3)).add(frente.mul(2.5));

  const matLinhas = new LineBasicNodeMaterial({ transparent: true, depthWrite: false });
  matLinhas.colorNode = cor.rgb.mul(realce);
  matLinhas.opacityNode = clamp(cor.a.mul(profundidade).mul(realce), 0, 1).mul(mascara);
  descartaveis.push(matLinhas);
  const linhas = new LineSegments(geoLinhas, matLinhas);
  linhas.frustumCulled = false;
  linhas.renderOrder = 1;
  modelo.add(linhas);

  // ----------------------------------------------------------- oclusores
  const geoOcl = new BufferGeometry();
  geoOcl.setAttribute("position", new Float32BufferAttribute(geo.oclusores, 3));
  descartaveis.push(geoOcl);
  const matOcl = new MeshBasicNodeMaterial({
    colorWrite: false,
    depthWrite: true,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  // a parede "cresce" junto com a construção
  matOcl.positionNode = vec3(positionLocal.x, min(positionLocal.y, uRevelado), positionLocal.z);
  descartaveis.push(matOcl);
  const oclusores = new Mesh(geoOcl, matOcl);
  oclusores.frustumCulled = false;
  oclusores.renderOrder = 0;
  modelo.add(oclusores);

  // -------------------------------------------------------- pós-processo
  const pos = new PostProcessing(renderer);
  const passe = pass(scene, camera);
  const corCena = passe.getTextureNode("output");
  const b = BLOOM[intensidade];
  const brilho = bloom(corCena, b.forca, b.raio, b.limiar);
  // Canvas transparente e pré-multiplicado: a cor só vira sRGB depois de
  // despremultiplicada. Converter direto (o padrão do PostProcessing) faz o
  // resto quase nulo do bloom virar um véu cinza sobre a página inteira.
  // O brilho some antes da borda do canvas (senão o halo é cortado num
  // retângulo visível) e perde a cauda quase nula, que só suja o fundo.
  const bordaX = smoothstep(0, 0.06, screenUV.x).mul(smoothstep(1, 0.94, screenUV.x));
  const bordaY = smoothstep(0, 0.08, screenUV.y).mul(smoothstep(1, 0.92, screenUV.y));
  const halo = max(brilho.rgb.sub(0.002), 0).mul(bordaX).mul(bordaY);
  const somaLinear = corCena.rgb.add(halo);
  const alfa = clamp(max(corCena.a, max(somaLinear.r, max(somaLinear.g, somaLinear.b))), 0, 1);
  const reta = somaLinear.div(max(alfa, 1e-4));
  pos.outputColorTransform = false;
  pos.outputNode = vec4(sRGBTransferOETF(reta).mul(alfa), alfa);
  descartaveis.push(pos, passe, brilho);

  // ------------------------------------------------------------- tamanho
  const enquadrar = () => {
    const w = Math.max(1, hospedeiro.clientWidth);
    const h = Math.max(1, hospedeiro.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const dist = distanciaCamera(camera.aspect);
    camera.position.set(0, Math.sin(ELEVACAO) * dist, Math.cos(ELEVACAO) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    uPerto.value = dist - 0.9;
    uLonge.value = dist + 0.9;
  };
  enquadrar();
  hospedeiro.appendChild(canvas);

  // ------------------------------------------------------------- quadro
  let tempo = opcoes.tempoInicial ?? 0; // segundos de animação (só corre com a aba visível)
  let ultimo = -1;
  let avisou = false;
  let quadros = 0;
  let construido = false;
  let visivel = true;
  const alvo = { x: 0, y: 0 };
  const mola = { x: 0, y: 0, vx: 0, vy: 0 };

  const desenhar = () => {
    try {
      pos.render();
    } catch {
      renderer.setAnimationLoop(null);
      aoFalhar?.();
      return;
    }
    if (!avisou && ++quadros >= 2) {
      avisou = true;
      aoPrimeiroQuadro();
    }
  };

  const quadro = (agora: number) => {
    const dt = ultimo < 0 ? 0 : Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    tempo += dt;

    // construção
    uArena.value = saida(tempo / DURACAO_ARENA) * 1.01;
    const subida = saida((tempo - INICIO_SUBIDA) / (DURACAO_TOTAL - INICIO_SUBIDA));
    uRevelado.value = -2 + subida * (ALTURA_TOTAL + 12);
    uBorda.value = 1 - suave((tempo - DURACAO_TOTAL) / 0.6);
    if (!construido && tempo >= DURACAO_TOTAL) {
      construido = true;
      aoConstruido?.();
    }

    // varredura periódica (só no destaque)
    if (intensidade === "destaque" && tempo > DURACAO_TOTAL) {
      const fase = (tempo - DURACAO_TOTAL - 1.5) % INTERVALO_VARREDURA;
      if (fase >= 0 && fase < DURACAO_VARREDURA) {
        const p = fase / DURACAO_VARREDURA;
        uVarredura.value = -3 + suave(p) * (ALTURA_TOTAL + 8);
        uForcaVarredura.value = Math.sin(p * Math.PI) * 0.9 + 0.1;
      } else {
        uForcaVarredura.value = 0;
      }
    }

    // giro contínuo + inclinação com mola (criticamente amortecida)
    // no "discreto", depois de construído o giro freia em desaceleração constante
    // (velocidade contínua na emenda) e para — nada gira para sempre ao lado do trabalho
    let tempoGiro = tempo;
    if (intensidade === "discreto" && tempo > DURACAO_TOTAL) {
      const d = Math.min(tempo - DURACAO_TOTAL, PARADA_DISCRETO);
      tempoGiro = DURACAO_TOTAL + d - (d * d) / (2 * PARADA_DISCRETO);
    }
    giro.rotation.y = ROTACAO_INICIAL + (tempoGiro / VOLTA_SEGUNDOS) * Math.PI * 2;
    const K = 30;
    const C = 2 * Math.sqrt(K) * 0.9;
    mola.vx += ((alvo.x - mola.x) * K - mola.vx * C) * dt;
    mola.vy += ((alvo.y - mola.y) * K - mola.vy * C) * dt;
    mola.x += mola.vx * dt;
    mola.y += mola.vy * dt;
    inclinacao.rotation.x = mola.y * INCLINACAO_MAX;
    inclinacao.rotation.y = mola.x * INCLINACAO_MAX;

    desenhar();
  };

  const aoMoverPonteiro = (e: PointerEvent) => {
    alvo.x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
    alvo.y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
  };

  // Só desenha com a aba visível E a caixa na tela (fora da tela, `display:none`
  // ou apagada pela paralaxe não há o que ver).
  const sincronizar = () => {
    const rodar = visivel && document.visibilityState !== "hidden";
    if (rodar) ultimo = -1; // não pula o tempo que passou parada
    renderer.setAnimationLoop(rodar ? quadro : null);
  };
  const aoMudarVisibilidade = () => sincronizar();
  const naTela = new IntersectionObserver(([e]) => {
    visivel = e.isIntersecting;
    sincronizar();
  });

  const observador = new ResizeObserver(() => {
    enquadrar();
    if (reduzido) desenhar();
  });
  observador.observe(hospedeiro);

  if (reduzido) {
    desenhar();
    // garante o aviso mesmo com um único quadro
    if (!avisou) {
      avisou = true;
      requestAnimationFrame(() => aoPrimeiroQuadro());
    }
    construido = true;
    aoConstruido?.();
  } else {
    window.addEventListener("pointermove", aoMoverPonteiro, { passive: true });
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    naTela.observe(hospedeiro);
    sincronizar();
  }

  let destruido = false;
  return () => {
    if (destruido) return;
    destruido = true;
    renderer.setAnimationLoop(null);
    observador.disconnect();
    naTela.disconnect();
    window.removeEventListener("pointermove", aoMoverPonteiro);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    for (const d of descartaveis) d.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
