"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { lerResultado, sinalDeTempo, temOk } from "@/lib/operacao";

export type MetodoBalcao = "dinheiro" | "pix" | "debito" | "credito";

const METODOS: { key: MetodoBalcao; label: string; icone: string; parcelavel?: boolean }[] = [
  { key: "dinheiro", label: "Dinheiro", icone: "💵" },
  { key: "pix", label: "PIX", icone: "⚡" },
  { key: "debito", label: "Cartão débito", icone: "💳" },
  { key: "credito", label: "Cartão crédito", icone: "💳", parcelavel: true },
];

export function CheckoutBalcao({
  personId,
  nome,
  planoNome,
  valor,
  onPago,
  onFechar,
}: {
  personId: string;
  nome: string;
  planoNome: string;
  valor: number;
  onPago: (metodo: MetodoBalcao) => void;
  onFechar: () => void;
}) {
  const [metodo, setMetodo] = useState<MetodoBalcao>("dinheiro");
  const [parcelas, setParcelas] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  // Sem confirmação o botão trava: confirmar de novo pode dar baixa duas vezes.
  const [incerto, setIncerto] = useState(false);
  const emVoo = useRef(false);

  const credito = metodo === "credito";
  const valorParcela = credito && parcelas > 1 ? valor / parcelas : valor;

  async function confirmar() {
    if (emVoo.current || incerto) return;
    emVoo.current = true;
    setErro("");
    setEnviando(true);
    const res = await lerResultado(
      fetch(`/api/pessoas/${personId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo, parcelas: credito ? parcelas : 1 }),
        signal: sinalDeTempo(),
      }),
      temOk,
      "Falha ao confirmar pagamento.",
    );
    emVoo.current = false;
    setEnviando(false);
    if (res.tipo === "ok") {
      onPago(metodo);
      return;
    }
    if (res.tipo === "falha") {
      setErro(res.erro);
      return;
    }
    setIncerto(true);
    setErro(
      "Sem confirmação do servidor. O pagamento pode ter sido registrado — confira os pagamentos na ficha antes de confirmar de novo.",
    );
  }

  return (
    // Clique no fundo não fecha: é uma venda em andamento, não some por engano.
    // Esc segue o "Cancelar": indisponível enquanto a confirmação está no ar.
    <Modal onFechar={onFechar} fecharComEsc={!enviando}>
      <TituloModal>Venda de balcão</TituloModal>
      <DescricaoModal className="mt-0.5">Pagamento presencial · confirma na hora</DescricaoModal>

      <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm">
        <Linha rotulo="Aluno" valor={nome} />
        <Linha rotulo="Plano" valor={planoNome} />
        <Linha rotulo="Total" valor={formatBRL(valor)} destaque />
      </div>

      <div className="mt-5">
        <p id="checkout-metodo" className="text-sm font-medium text-muted">
          Forma de pagamento
        </p>
        <div role="group" aria-labelledby="checkout-metodo" className="mt-2 grid grid-cols-2 gap-2">
          {METODOS.map((m) => (
            <button
              type="button"
              key={m.key}
              onClick={() => setMetodo(m.key)}
              aria-pressed={metodo === m.key}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                metodo === m.key
                  ? "border-brand bg-brand-soft font-semibold text-ink"
                  : "border-border-strong bg-surface text-muted hover:border-control hover:text-ink",
              )}
            >
              <span aria-hidden>{m.icone}</span>
              <span className="font-medium">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {credito && (
        <div className="mt-4">
          <p id="checkout-parcelas" className="text-sm font-medium text-muted">
            Parcelas
          </p>
          <div role="group" aria-labelledby="checkout-parcelas" className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 6, 12].map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => setParcelas(n)}
                aria-pressed={parcelas === n}
                className={cn(
                  "min-h-9 rounded-md border px-3 py-1.5 text-sm tabular-nums transition-colors",
                  parcelas === n
                    ? "border-brand bg-brand-soft font-semibold text-ink"
                    : "border-border-strong bg-surface text-muted hover:border-control hover:text-ink",
                )}
              >
                {n}x
              </button>
            ))}
          </div>
          {parcelas > 1 && (
            <p className="mt-2 text-xs text-muted">
              {parcelas}× de <span className="font-medium text-ink">{formatBRL(valorParcela)}</span> na
              maquininha. O sistema registra o pagamento do total; o parcelamento fica entre a pessoa e a operadora.
            </p>
          )}
        </div>
      )}

      {erro && <MensagemErro className="mt-4">{erro}</MensagemErro>}

      <Botao
        variante="primario"
        tamanho="lg"
        bloco
        onClick={confirmar}
        carregando={enviando}
        disabled={incerto}
        className="mt-6"
      >
        {enviando ? "Confirmando…" : `Confirmar pagamento · ${formatBRL(valor)}`}
      </Botao>
      <Botao bloco onClick={onFechar} disabled={enviando} className="mt-3">
        {incerto ? "Fechar" : "Cancelar"}
      </Botao>
    </Modal>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-faint">{rotulo}</span>
      <span className={cn("font-medium tabular-nums", destaque ? "text-lg text-destaque" : "text-ink")}>{valor}</span>
    </div>
  );
}
