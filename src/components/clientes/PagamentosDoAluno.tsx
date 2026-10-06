"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { formatBRL, formatData } from "@/lib/mock-data";

type Pagamento = {
  id: string;
  asaasPaymentId: string;
  valor: number;
  vencimento: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "REFUNDED" | "CHARGEBACK" | "CANCELED";
  forma: string;
  pagoEm: string | null;
  link: string | null;
  descricao: string | null;
  recorrente: boolean;
};
type Assinatura = { valor: number; status: string; asaasId: string } | null;

const STATUS: Record<Pagamento["status"], { rotulo: string; tom: "ok" | "warn" | "red" | "neutral" }> = {
  PAID: { rotulo: "Pago", tom: "ok" },
  PENDING: { rotulo: "Pendente", tom: "neutral" },
  OVERDUE: { rotulo: "Vencido", tom: "red" },
  REFUNDED: { rotulo: "Estornado", tom: "warn" },
  CHARGEBACK: { rotulo: "Chargeback", tom: "red" },
  CANCELED: { rotulo: "Cancelado", tom: "neutral" },
};

const BALCAO: Record<string, string> = {
  dinheiro: "dinheiro",
  pix: "PIX",
  debito: "débito",
  credito: "crédito",
};

/** Forma de pagamento legível. UNDEFINED = o aluno ainda vai escolher no link. */
function formaLegivel(p: Pagamento): string {
  if (p.forma.startsWith("BALCAO:")) return `Balcão · ${BALCAO[p.forma.slice(7)] ?? p.forma.slice(7)}`;
  switch (p.forma) {
    case "PIX": return "PIX";
    case "BOLETO": return "Boleto";
    case "CREDIT_CARD": return "Cartão de crédito";
    case "DEBIT_CARD": return "Cartão de débito";
    default: return p.status === "PAID" ? "—" : "Aluno escolhe no link";
  }
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";
const btnGhost =
  "rounded-md border border-border-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-wide " +
  "text-muted transition-colors hover:text-ink disabled:opacity-60";

export function PagamentosDoAluno({
  personId,
  podeGerir,
}: {
  personId: string;
  /** ADMIN: cobrança avulsa e cancelamentos. Recepção só vê e copia o link. */
  podeGerir: boolean;
}) {
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);
  const [assinatura, setAssinatura] = useState<Assinatura>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ valor: "", vencimento: "", descricao: "" });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/pessoas/${personId}/pagamentos`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { pagamentos: Pagamento[]; assinatura: Assinatura };
      setPagamentos(d.pagamentos);
      setAssinatura(d.assinatura);
    } catch {
      setErro("Não foi possível carregar os pagamentos.");
    }
  }, [personId]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function acao(fn: () => Promise<Response>) {
    setErro("");
    setOcupado(true);
    try {
      const r = await fn();
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { erro?: string } | null;
        setErro(d?.erro ?? "Falha na operação");
        return false;
      }
      await carregar();
      return true;
    } catch {
      setErro("Sem conexão com o servidor");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function gerarAvulsa() {
    const ok = await acao(() =>
      fetch(`/api/pessoas/${personId}/pagamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valor: Number(nova.valor.replace(",", ".")),
          vencimento: nova.vencimento,
          descricao: nova.descricao,
        }),
      }),
    );
    if (ok) {
      setNovaAberta(false);
      setNova({ valor: "", vencimento: "", descricao: "" });
    }
  }

  async function cancelar(p: Pagamento) {
    if (!confirm(`Cancelar a cobrança de ${formatBRL(p.valor)} (vence ${formatData(p.vencimento)})?`)) return;
    await acao(() =>
      fetch(`/api/pessoas/${personId}/pagamentos?asaasId=${encodeURIComponent(p.asaasPaymentId)}`, {
        method: "DELETE",
      }),
    );
  }

  async function cancelarAssinatura() {
    if (
      !confirm(
        "Cancelar a assinatura? O Asaas para de gerar as próximas mensalidades. " +
          "O aluno continua com o que já pagou até o vencimento do plano.",
      )
    )
      return;
    await acao(() => fetch(`/api/pessoas/${personId}/assinatura`, { method: "DELETE" }));
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(link);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      window.prompt("Copie o link:", link);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-ink">
          Pagamentos
        </h2>
        {podeGerir && (
          <button type="button" onClick={() => setNovaAberta((v) => !v)} className={btnGhost}>
            {novaAberta ? "Fechar" : "Nova cobrança"}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {assinatura ? (
          <>
            <Badge tone="ok">Assinatura ativa</Badge>
            <span className="text-muted">{formatBRL(assinatura.valor)}/mês · aluno escolhe PIX, boleto ou cartão</span>
            {podeGerir && (
              <button
                type="button"
                onClick={cancelarAssinatura}
                disabled={ocupado}
                className="ml-auto text-xs font-medium text-red-bright transition-colors hover:underline disabled:opacity-60"
              >
                Cancelar assinatura
              </button>
            )}
          </>
        ) : (
          <span className="text-xs text-faint">Sem assinatura recorrente ativa.</span>
        )}
      </div>

      {novaAberta && (
        <div className="mb-4 grid gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Valor (R$)</label>
            <input
              inputMode="decimal"
              value={nova.valor}
              onChange={(e) => setNova((n) => ({ ...n, valor: e.target.value }))}
              placeholder="0,00"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Vencimento</label>
            <input
              type="date"
              value={nova.vencimento}
              onChange={(e) => setNova((n) => ({ ...n, vencimento: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Descrição (o aluno vê)</label>
            <input
              value={nova.descricao}
              onChange={(e) => setNova((n) => ({ ...n, descricao: e.target.value }))}
              placeholder="Ex.: taxa do cartão de acesso"
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={gerarAvulsa}
            disabled={ocupado || !nova.valor || !nova.vencimento || !nova.descricao.trim()}
            className="rounded-lg bg-red px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60"
          >
            {ocupado ? "Gerando…" : "Gerar"}
          </button>
        </div>
      )}

      {erro && <p className="mb-3 text-xs text-red-bright">{erro}</p>}

      {pagamentos === null ? (
        <p className="text-sm text-faint">Carregando…</p>
      ) : pagamentos.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma cobrança ainda.</p>
      ) : (
        <ul className="divide-y divide-border">
          {pagamentos.map((p) => {
            const st = STATUS[p.status] ?? STATUS.PENDING;
            const aberta = p.status === "PENDING" || p.status === "OVERDUE";
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {formatBRL(p.valor)}
                    <span className="ml-2 text-xs font-normal text-faint">
                      {p.descricao ?? (p.recorrente ? "Mensalidade" : "Cobrança")}
                    </span>
                  </p>
                  <p className="text-xs text-faint">
                    vence {formatData(p.vencimento)}
                    {p.pagoEm && ` · pago em ${formatData(p.pagoEm)}`} · {formaLegivel(p)}
                  </p>
                </div>
                <Badge tone={st.tom}>{st.rotulo}</Badge>
                {aberta && p.link && (
                  <button type="button" onClick={() => copiar(p.link!)} className={btnGhost}>
                    {copiado === p.link ? "Copiado" : "Copiar link"}
                  </button>
                )}
                {aberta && podeGerir && (
                  <button
                    type="button"
                    onClick={() => cancelar(p)}
                    disabled={ocupado}
                    className="text-xs font-medium text-red-bright transition-colors hover:underline disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
