"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import { dividirEmParcelas } from "@/lib/billing/parcelamento";
import { lerResultado, sinalDeTempo, temOk } from "@/lib/operacao";

export type MetodoBalcao = "dinheiro" | "pix" | "debito" | "credito";

interface Venda {
  valor: number;
  planoInteiro: boolean;
  valorMensal: number | null;
  meses: number;
  rotulo: string | null;
  parcela: { numero: number; de: number } | null;
}

const METODOS: { key: MetodoBalcao; label: string; icone: string }[] = [
  { key: "dinheiro", label: "Dinheiro", icone: "💵" },
  { key: "pix", label: "PIX", icone: "⚡" },
  { key: "debito", label: "Cartão débito", icone: "💳" },
  { key: "credito", label: "Cartão crédito", icone: "💳" },
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
  // O servidor decide o valor: plano de vários meses sai inteiro (mensalidade × meses).
  const [venda, setVenda] = useState<Venda | null>(null);
  const [carregandoVenda, setCarregandoVenda] = useState(true);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pessoas/${personId}/checkout`, { cache: "no-store", signal: sinalDeTempo() });
        const d = (await r.json().catch(() => null)) as Venda | null;
        if (ativo && r.ok && d && typeof d.valor === "number") setVenda(d);
      } catch {
        // sem resposta: fica o valor que a tela já conhecia
      } finally {
        if (ativo) setCarregandoVenda(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [personId]);

  const total = venda?.valor ?? valor;
  // Plano de vários meses: primeiro escolhe em quantas parcelas mensais o total
  // fica. A 1ª é paga agora; as outras a recepção confirma aqui, mês a mês.
  const parcelavel = !!venda?.planoInteiro && venda.meses > 1;
  const n = parcelavel ? parcelas : 1;
  const valores = dividirEmParcelas(total, n);
  const agora = valores[0];

  async function confirmar() {
    if (emVoo.current || incerto) return;
    emVoo.current = true;
    setErro("");
    setEnviando(true);
    const res = await lerResultado(
      fetch(`/api/pessoas/${personId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo, parcelas: n }),
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
        <Linha rotulo="Plano" valor={venda?.rotulo ? `${planoNome} · ${venda.rotulo}` : planoNome} />
        {venda?.planoInteiro && venda.valorMensal !== null && (
          <Linha rotulo="Mensalidade" valor={`${formatBRL(venda.valorMensal)} × ${venda.meses} meses`} />
        )}
        {venda?.parcela && (
          <Linha rotulo="Parcela" valor={`${venda.parcela.numero} de ${venda.parcela.de}`} />
        )}
        <Linha
          rotulo={venda?.planoInteiro ? "Total do plano" : venda?.parcela ? "Valor da parcela" : "Total"}
          valor={formatBRL(total)}
          destaque={!parcelavel || n === 1}
        />
      </div>

      {parcelavel && (
        <div className="mt-5">
          <label htmlFor="checkout-parcelas" className="text-sm font-medium text-muted">
            Em quantas parcelas?
          </label>
          <select
            id="checkout-parcelas"
            value={parcelas}
            onChange={(e) => setParcelas(Number(e.target.value))}
            disabled={enviando || incerto}
            className={cn(classeCampo, "mt-2")}
          >
            {Array.from({ length: venda.meses }, (_, i) => i + 1).map((k) => (
              <option key={k} value={k}>
                {k === 1 ? `À vista · ${formatBRL(total)}` : `${k}× de ${formatBRL(dividirEmParcelas(total, k)[1])}`}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted">
            {n === 1
              ? "O plano inteiro é pago agora."
              : `Hoje: 1ª parcela de ${formatBRL(agora)}. As outras ${n - 1} vencem uma por mês e a recepção confirma cada uma no balcão (ficha do aluno → Pagamentos).`}{" "}
            A cobrança mensal no Asaas é cancelada para o aluno não ser cobrado de novo.
          </p>
        </div>
      )}

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

      {erro && <MensagemErro className="mt-4">{erro}</MensagemErro>}

      <Botao
        variante="primario"
        tamanho="lg"
        bloco
        onClick={confirmar}
        carregando={enviando}
        disabled={incerto || carregandoVenda}
        className="mt-6"
      >
        {enviando ? "Confirmando…" : n > 1 ? `Confirmar 1ª parcela · ${formatBRL(agora)}` : `Confirmar pagamento · ${formatBRL(agora)}`}
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
