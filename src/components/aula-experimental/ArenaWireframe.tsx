/**
 * A arena do Coliseu em wireframe — decoração estática e secundária do
 * cabeçalho (sem animação, sem eventos). Desenhada por conta: três anéis de
 * arquibancada em perspectiva, ligados pelos pilares das arcadas.
 */
const CX = 160;
const CY = 70;
const ANEIS = [
  { rx: 146, ry: 46, y: 0 }, // topo da muralha
  { rx: 146, ry: 46, y: 34 }, // base da muralha
  { rx: 112, ry: 33, y: 22 }, // arquibancada
  { rx: 70, ry: 19, y: 34 }, // arena
];
const PILARES = 22;

function ponto(rx: number, ry: number, y: number, t: number) {
  return [CX + rx * Math.cos(t), CY + y + ry * Math.sin(t)] as const;
}

export function ArenaWireframe({ className }: { className?: string }) {
  const [topo, base] = ANEIS;
  // Só os pilares da metade da frente (sen > 0) aparecem.
  const pilares = Array.from({ length: PILARES }, (_, i) => (i / PILARES) * Math.PI * 2).filter(
    (t) => Math.sin(t) > -0.15,
  );
  return (
    <svg
      viewBox="0 0 320 160"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
    >
      {ANEIS.map((a, i) => (
        <ellipse
          key={i}
          cx={CX}
          cy={CY + a.y}
          rx={a.rx}
          ry={a.ry}
          stroke={i === 3 ? "#ff4b3e" : "currentColor"}
          strokeOpacity={i === 3 ? 0.7 : 0.32}
          strokeWidth="1"
        />
      ))}
      {/* faixa do meio da muralha */}
      <ellipse cx={CX} cy={CY + 17} rx={146} ry={46} stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" />
      {pilares.map((t, i) => {
        const [x1, y1] = ponto(topo.rx, topo.ry, topo.y, t);
        const [x2, y2] = ponto(base.rx, base.ry, base.y, t);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.26" strokeWidth="1" />;
      })}
      {/* arcadas: um arco entre cada par de pilares, na faixa de baixo */}
      {pilares.slice(0, -1).map((t, i) => {
        const t2 = pilares[i + 1];
        if (t2 - t > 0.5) return null;
        const [xa, ya] = ponto(base.rx, base.ry, base.y, t);
        const [xb, yb] = ponto(base.rx, base.ry, base.y, t2);
        const topoArco = Math.min(ya, yb) - 11;
        return (
          <path
            key={`a${i}`}
            d={`M${xa.toFixed(1)} ${ya.toFixed(1)} L${xa.toFixed(1)} ${(topoArco + 4).toFixed(1)} Q${((xa + xb) / 2).toFixed(1)} ${(topoArco - 3).toFixed(1)} ${xb.toFixed(1)} ${(topoArco + 4).toFixed(1)} L${xb.toFixed(1)} ${yb.toFixed(1)}`}
            stroke="#ff4b3e"
            strokeOpacity="0.45"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}
