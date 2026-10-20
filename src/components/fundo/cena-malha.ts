/**
 * Cena da malha viva: um quad de tela cheia com shader TSL que desenha a
 * mesma malha de 48px do `body::after` (globals.css) e acende as casas.
 *
 * Carregado sob demanda por `MalhaViva` (import dinâmico), para que o three
 * fique fora do bundle principal. `WebGPURenderer` cai sozinho para WebGL2;
 * se nem isso iniciar, `criarCenaMalha` rejeita e a malha do CSS continua.
 *
 * Tudo em px CSS. Coordenada de "camada" = tela + deslocamento da paralaxe,
 * igual ao `body::after`, que tem 140vh de altura e sobe 40vh ao longo da
 * rolagem inteira (`malha-paralaxe`).
 */

import {
  LinearSRGBColorSpace,
  MeshBasicNodeMaterial,
  NoToneMapping,
  QuadMesh,
  Vector2,
  Vector3,
  WebGPURenderer,
  type Node,
} from "three/webgpu";
import {
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  screenCoordinate,
  sin,
  smoothstep,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { ShaderNodeObject } from "three/tsl";

/** Nó TSL genérico (o grafo é montado uma vez, em JS). */
type No = ShaderNodeObject<Node>;

/** Lado da casa — o mesmo `background-size` da malha do CSS. */
const LADO = 48;
/** Teto de densidade: é fundo, não precisa de 2× / 3×. */
const DPR_MAXIMO = 1.5;
/** Fração da altura da tela que a malha sobe ao longo da rolagem inteira. */
const PARALAXE = 0.4;
/** Pontos do rastro do cursor e ondas de toque simultâneas. */
const PONTOS_RASTRO = 6;
const ONDAS_TOQUE = 3;
/** Vida do rastro (s) e distância mínima (px) para gravar um ponto novo. */
const VIDA_RASTRO = 0.6;
const PASSO_RASTRO = 22;

/** Força dos efeitos por nível: telas de trabalho ficam quase só na linha. */
export const FORCA_INTENSIDADE = { baixa: 0.34, alta: 1 } as const;
export type IntensidadeMalha = keyof typeof FORCA_INTENSIDADE;

export interface CenaMalha {
  definirIntensidade(nivel: IntensidadeMalha): void;
  destruir(): void;
}

export interface OpcoesCenaMalha {
  intensidade: IntensidadeMalha;
  /** Chamado uma vez, depois do primeiro quadro desenhado. */
  aoPrimeiroQuadro?: () => void;
  /** Chamado se um quadro falhar depois de iniciada (a cena já se desfez). */
  aoFalhar?: () => void;
  /** Só para o banco de testes: força o backend WebGL2. */
  forcarWebGL?: boolean;
  /** Só para o banco de testes: adianta o relógio do shader (s) — fase da onda/pulsos. */
  tempoInicial?: number;
}

/** Ruído barato por casa (índices pequenos, sem problema de precisão). */
function ruido(c: No) {
  return fract(sin(dot(c, vec2(12.9898, 78.233))).mul(43758.5453));
}

/** Aproximação exponencial independente da taxa de quadros. */
function aproximar(atual: number, alvo: number, dt: number, tau: number) {
  return alvo + (atual - alvo) * Math.exp(-dt / tau);
}

export async function criarCenaMalha(
  container: HTMLElement,
  opcoes: OpcoesCenaMalha,
): Promise<CenaMalha> {
  const renderer = new WebGPURenderer({
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
    forceWebGL: opcoes.forcarWebGL ?? false,
  });

  try {
    await renderer.init();
  } catch (erro) {
    renderer.dispose();
    throw erro;
  }

  renderer.setClearColor(0x000000, 0);
  // as cores do shader já são as do CSS (sRGB): nada de conversão nem tone mapping
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  // ---------- uniforms ----------
  const uTempo = uniform(0);
  const uRazao = uniform(1); // pixel ratio efetivo do canvas
  const uTela = uniform(new Vector2(1, 1)); // px CSS
  const uDesloc = uniform(0); // paralaxe (px CSS)
  const uForca = uniform(0); // intensidade animada (0..1)
  const uCursor = uniform(new Vector3(-9999, -9999, 0)); // x, y, presença
  const uRastro = Array.from({ length: PONTOS_RASTRO }, () => uniform(new Vector3(-9999, -9999, 0)));
  const uToques = Array.from({ length: ONDAS_TOQUE }, () => uniform(new Vector3(-9999, -9999, -99)));

  // ---------- shader ----------
  const p = screenCoordinate.div(uRazao); // px CSS, origem no topo
  const pCamada = p.add(vec2(0, uDesloc));
  const casa = floor(pCamada.div(LADO));
  const local = pCamada.sub(casa.mul(LADO)); // 0..48 dentro da casa
  const centro = casa.add(0.5).mul(LADO).sub(vec2(0, uDesloc)); // em tela

  // Linha de 1px no começo de cada casa (como o gradiente do CSS), com
  // filtro de caixa por pixel do canvas: nítida e alinhada em qualquer DPR.
  const largura = float(1).div(uRazao);
  const cobertura = (l: No) =>
    clamp(min(l.add(largura.mul(0.5)), 1).sub(max(l.sub(largura.mul(0.5)), 0)), 0, largura).div(largura);
  const linhaX = max(cobertura(local.x), cobertura(local.x.sub(LADO)));
  const linhaY = max(cobertura(local.y), cobertura(local.y.sub(LADO)));
  const linha = max(linhaX, linhaY);

  // Máscara do CSS: 100% no topo da camada, 35% no fim (140vh).
  const mascara = mix(1, 0.35, clamp(pCamada.y.div(uTela.y.mul(1 + PARALAXE)), 0, 1));

  // Cursor: energia por casa (distância do centro) e por pixel (para a linha).
  const gauss = (d: No, sigma: number) => exp(d.mul(d).div(-2 * sigma * sigma));
  const dCursorCasa = centro.sub(uCursor.xy).length();
  const dCursorPx = p.sub(uCursor.xy).length();
  let eCursor: No = gauss(dCursorCasa, 64).mul(uCursor.z);
  let eCursorLinha: No = gauss(dCursorPx, 120).mul(uCursor.z);
  for (const ponto of uRastro) {
    eCursor = eCursor.add(gauss(centro.sub(ponto.xy).length(), 60).mul(ponto.z).mul(0.55));
    eCursorLinha = eCursorLinha.add(gauss(p.sub(ponto.xy).length(), 90).mul(ponto.z).mul(0.4));
  }
  // a casa sob o cursor ganha um realce próprio ("selecionada")
  const casaCursor = floor(uCursor.xy.add(vec2(0, uDesloc)).div(LADO));
  const eSelecao = step(casa.sub(casaCursor).length(), 0.5).mul(uCursor.z);
  eCursor = min(eCursor.add(eSelecao.mul(0.35)), 1);
  eCursorLinha = min(eCursorLinha, 1);

  // Onda: faixa diagonal que atravessa a tela a cada 12s (6s de travessia).
  const direcao = vec2(0.866, 0.5);
  const alcance = dot(uTela, direcao);
  const fase = clamp(fract(uTempo.div(12)).mul(2), 0, 1);
  const frente = mix(-320, alcance.add(320), fase);
  const dOnda = dot(centro, direcao).sub(frente);
  const eOnda = gauss(dOnda, 72).mul(0.5);
  const eOndaLinha = gauss(dot(p, direcao).sub(frente), 90).mul(0.45);

  // Pulsos: a cada janela de 3,4s (fase própria por casa), ~1% das casas
  // acendem e apagam devagar.
  const faseCasa = ruido(casa).mul(7);
  const janela = uTempo.div(3.4).add(faseCasa);
  const sorteio = ruido(casa.add(floor(janela).mul(vec2(17.13, 3.71))));
  const envelope = sin(fract(janela).mul(Math.PI));
  const ePulso = step(0.988, sorteio).mul(envelope.mul(envelope)).mul(0.6);

  // Toques: anel que se expande a partir do ponto tocado.
  let eToque: No = float(0);
  for (const toque of uToques) {
    const idade = uTempo.sub(toque.z);
    const raio = idade.mul(460);
    const vida = clamp(float(1).sub(idade.div(1.3)), 0, 1);
    const anel = gauss(centro.sub(toque.xy).length().sub(raio), 46);
    eToque = eToque.add(anel.mul(vida).mul(vida).mul(step(0, idade)).mul(0.8));
  }

  const eAmbiente = min(eOnda.add(ePulso).add(eToque), 1).mul(mascara);
  const eCasa = min(eCursor.add(eAmbiente), 1).mul(uForca);

  // Casa acesa: preenchimento chapado quando fraca; forte, fica mais clara
  // junto às bordas (vidro). Chapado no fraco evita "furos" escuros.
  const dBorda = min(min(local.x, float(LADO).sub(local.x)), min(local.y, float(LADO).sub(local.y)));
  const realce = mix(1, mix(0.95, 0.62, eCasa), smoothstep(0, 16, dBorda));
  const aCasa = eCasa.mul(realce).mul(0.6).add(eSelecao.mul(uForca).mul(0.12));

  // Linha: base fixa (igual ao CSS) + brilho dos efeitos.
  const brilhoLinha = min(
    eCursorLinha.mul(0.9).add(eOndaLinha.add(eAmbiente.mul(0.5)).mul(mascara).mul(0.6)),
    1,
  ).mul(uForca);
  const aLinha = linha.mul(float(0.035).mul(mascara).add(brilhoLinha.mul(0.75)));

  // Cor: vermelho da marca subindo para o vermelho vivo; miolo do cursor
  // puxa para o branco. A linha base é branca, como no CSS.
  const vermelho = mix(vec3(0.69, 0.071, 0.11), vec3(1, 0.294, 0.243), clamp(eCasa.mul(1.6), 0, 1));
  const corCasa = mix(vermelho, vec3(1, 0.92, 0.9), eCursor.mul(eCursor).mul(0.22).add(eSelecao.mul(0.12)).mul(uForca));
  const corLinha = mix(vec3(1, 1, 1), vec3(1, 0.42, 0.36), clamp(brilhoLinha.mul(1.8), 0, 1));

  // Composição pré-multiplicada (linha por cima da casa).
  const premult = corLinha.mul(aLinha).add(corCasa.mul(aCasa).mul(float(1).sub(aLinha)));
  const alfa = aLinha.add(aCasa.mul(float(1).sub(aLinha)));
  const material = new MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
  material.colorNode = vec4(premult.div(max(alfa, 0.0001)), alfa);
  const quad = new QuadMesh(material);

  // ---------- estado ----------
  let forcaAlvo: number = FORCA_INTENSIDADE[opcoes.intensidade];
  let presencaAlvo = 0;
  const cursor = { x: -9999, y: -9999, presenca: 0 };
  const rastro: { x: number; y: number; t: number }[] = [];
  let toqueAtual = 0;
  let tempo = opcoes.tempoInicial ?? 0;
  let ultimo = performance.now();
  let primeiroQuadro = false;
  let destruido = false;

  function redimensionar() {
    const largura = Math.max(1, container.clientWidth);
    const altura = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_MAXIMO));
    renderer.setSize(largura, altura, false);
    uTela.value.set(largura, altura);
    // razão efetiva (buffer arredondado ÷ px CSS), para a linha casar com o CSS
    const buffer = renderer.getDrawingBufferSize(new Vector2());
    uRazao.value = buffer.x / largura;
  }

  function deslocamento() {
    const raiz = document.documentElement;
    const curso = raiz.scrollHeight - window.innerHeight;
    if (curso <= 0) return 0;
    const progresso = Math.min(1, Math.max(0, window.scrollY / curso));
    return PARALAXE * window.innerHeight * progresso;
  }

  function quadro() {
    const agora = performance.now();
    const dt = Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    tempo += dt;

    uForca.value = aproximar(uForca.value, forcaAlvo, dt, 0.35);
    cursor.presenca = aproximar(cursor.presenca, presencaAlvo, dt, 0.18);
    uCursor.value.set(cursor.x, cursor.y, cursor.presenca);
    uTempo.value = tempo;
    uDesloc.value = deslocamento();

    for (let i = 0; i < PONTOS_RASTRO; i++) {
      const ponto = rastro[i];
      const vida = ponto ? Math.max(0, 1 - (tempo - ponto.t) / VIDA_RASTRO) : 0;
      uRastro[i].value.set(ponto?.x ?? -9999, ponto?.y ?? -9999, vida * vida * cursor.presenca);
    }

    try {
      quad.render(renderer);
    } catch {
      // GPU perdida ou shader recusado: some o canvas, volta a malha do CSS
      destruir();
      opcoes.aoFalhar?.();
      return;
    }

    if (!primeiroQuadro) {
      primeiroQuadro = true;
      opcoes.aoPrimeiroQuadro?.();
    }
  }

  // ---------- entrada ----------
  function aoMover(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    presencaAlvo = 1;
    const ultimoPonto = rastro[0];
    if (!ultimoPonto || Math.hypot(ultimoPonto.x - e.clientX, ultimoPonto.y - e.clientY) > PASSO_RASTRO) {
      rastro.unshift({ x: e.clientX, y: e.clientY, t: tempo });
      rastro.length = Math.min(rastro.length, PONTOS_RASTRO);
    }
  }

  function aoTocar(e: PointerEvent) {
    if (e.pointerType === "mouse") return;
    uToques[toqueAtual].value.set(e.clientX, e.clientY, tempo);
    toqueAtual = (toqueAtual + 1) % ONDAS_TOQUE;
  }

  function aoSairDaJanela(e: MouseEvent) {
    if (!e.relatedTarget) presencaAlvo = 0;
  }

  function aoPerderFoco() {
    presencaAlvo = 0;
  }

  function aoMudarVisibilidade() {
    if (destruido) return;
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      ultimo = performance.now();
      renderer.setAnimationLoop(quadro);
    }
  }

  const observador = new ResizeObserver(redimensionar);
  observador.observe(container);
  window.addEventListener("pointermove", aoMover, { passive: true });
  window.addEventListener("pointerdown", aoTocar, { passive: true });
  document.addEventListener("mouseout", aoSairDaJanela);
  window.addEventListener("blur", aoPerderFoco);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  redimensionar();
  if (!document.hidden) renderer.setAnimationLoop(quadro);

  function destruir() {
    if (destruido) return;
    destruido = true;
    renderer.setAnimationLoop(null);
    observador.disconnect();
    window.removeEventListener("pointermove", aoMover);
    window.removeEventListener("pointerdown", aoTocar);
    document.removeEventListener("mouseout", aoSairDaJanela);
    window.removeEventListener("blur", aoPerderFoco);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    material.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return {
    definirIntensidade(nivel) {
      forcaAlvo = FORCA_INTENSIDADE[nivel];
    },
    destruir,
  };
}
