/**
 * O que estes números NÃO dizem, à vista de quem lê.
 *
 * Retenção e fidelidade são calculadas com o que existe hoje na base:
 * - "última presença" é inicializada na matrícula/importação e o DTO não diz
 *   de onde veio — não é, necessariamente, uma visita à academia;
 * - a matrícula mais recente pode redefinir o início aparente do tempo de casa;
 * - a saída de quem cancelou é estimada pela última presença.
 */
export function LimitacaoIndicadores({ tela }: { tela: "retencao" | "fidelidade" | "indicadores" }) {
  return (
    <aside
      aria-label="Limitações destes números"
      className="mb-5 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-ink"
    >
      <p className="font-semibold">Leia como triagem, não como histórico exato</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
        {tela !== "fidelidade" && (
          <li>
            “Última presença” pode ser a data da matrícula ou da importação do cadastro, e não uma visita registrada na
            catraca. Ausência de registro não quer dizer que a pessoa nunca veio.
          </li>
        )}
        {tela !== "retencao" && (
          <li>
            Tempo de casa conta da matrícula mais recente; uma renovação pode encurtá-lo. A saída de quem cancelou é
            estimada pela última presença registrada.
          </li>
        )}
        {tela === "retencao" && <li>Entram alunos não cancelados — o que inclui pagamento pendente e inadimplente.</li>}
      </ul>
    </aside>
  );
}
