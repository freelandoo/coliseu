"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { formatBRL, formatData } from "@/lib/mock-data";
import { classeBotao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo, classeRotulo } from "@/components/ui/Campo";
import { linkCobrancaWhatsApp } from "@/lib/asaas";
import { PREFIXO_PARCELA_BALCAO } from "@/lib/billing/parcelamento";
import { CheckoutBalcao } from "@/components/matricula/CheckoutBalcao";

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
type Assinatura = { valor: number; status: string; asaasId: string; parcelado: boolean } | null;
type Cobranca = {
  estado: { cor: "verde" | "vermelho" | "nenhuma"; enviada: boolean; texto: string };
  envios: {
    id: string;
    quando: string;
    origem: string;
    etapa: string;
    canal: string;
    ok: boolean;
    detalhe: string | null;
    porUsuario: string | null;
  }[];
  aluno: { nome: string; telefone: string | null };
};

const ETAPA: Record<string, string> = {
  antes_5: "5 dias antes",
  vencimento: "no dia do vencimento",
  vencida: "vencida",
  vencida_7: "7 dias depois",
};
const CANAL: Record<string, string> = { link: "link copiado", whatsapp: "WhatsApp" };

/** "Asaas · 5 dias antes" ou "Manual · WhatsApp · Fulana". */
function descreverEnvio(e: Cobranca["envios"][number]): string {
  if (e.origem === "automatica") return `Asaas · ${ETAPA[e.etapa] ?? e.etapa}`;
  return ["Manual", CANAL[e.canal] ?? e.canal, e.porUsuario].filter(Boolean).join(" · ");
}

const STATUS: Record<Pagamento["status"], { rotulo: string; tom: "ok" | "warn" | "danger" | "neutral" }> = {
  PAID: { rotulo: "Pago", tom: "ok" },
  PENDING: { rotulo: "Pendente", tom: "neutral" },
  OVERDUE: { rotulo: "Vencido", tom: "danger" },
  REFUNDED: { rotulo: "Estornado", tom: "warn" },
  CHARGEBACK: { rotulo: "Chargeback", tom: "danger" },
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

const btnGhost = classeBotao({ variante: "secundario", tamanho: "sm" });

export function PagamentosDoAluno({
  personId,
  podeGerir,
}: {
  personId: string;
  /** ADMIN: cobrança avulsa e cancelamentos. Recepção vê, copia o link e cobra pelo WhatsApp. */
  podeGerir: boolean;
}) {
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);
  const [assinatura, setAssinatura] = useState<Assinatura>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ valor: "", vencimento: "", descricao: "" });
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  // Parcela do plano parcelado no balcão: a recepção confirma aqui, mês a mês.
  const [recebendo, setRecebendo] = useState<Pagamento | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        fetch(`/api/pessoas/${personId}/pagamentos`, { cache: "no-store" }),
        fetch(`/api/pessoas/${personId}/cobranca`, { cache: "no-store" }),
      ]);
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { pagamentos: Pagamento[]; assinatura: Assinatura };
      setPagamentos(d.pagamentos);
      setAssinatura(d.assinatura);
      if (c.ok) setCobranca((await c.json()) as Cobranca);
    } catch {
      setErro("Não foi possível carregar os pagamentos.");
    }
  }, [personId]);

  /** Cobrança manual feita pela recepção: entra no registro. */
  async function registrarManual(canal: "link" | "whatsapp", paymentId: string) {
    try {
      await fetch(`/api/pessoas/${personId}/cobranca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canal, paymentId }),
      });
      const c = await fetch(`/api/pessoas/${personId}/cobranca`, { cache: "no-store" });
      if (c.ok) setCobranca((await c.json()) as Cobranca);
    } catch {
      // o envio já aconteceu; só o registro ficou para trás
    }
  }

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
        (assinatura?.parcelado
          ? "Cancelar o parcelamento? Os boletos ainda não pagos são cancelados no Asaas. "
          : "Cancelar a assinatura? O Asaas para de gerar as próximas mensalidades. ") +
          "O aluno continua com o que já pagou até o vencimento do plano.",
      )
    )
      return;
    await acao(() => fetch(`/api/pessoas/${personId}/assinatura`, { method: "DELETE" }));
  }

  async function copiar(p: Pagamento) {
    const link = p.link!;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(link);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      window.prompt("Copie o link:", link);
    }
    void registrarManual("link", p.id);
  }

  function whatsapp(p: Pagamento) {
    if (!cobranca?.aluno.telefone || !p.link) return;
    window.open(
      linkCobrancaWhatsApp(cobranca.aluno.telefone, cobranca.aluno.nome.split(" ")[0], p.link, formatData(p.vencimento)),
      "_blank",
      "noopener",
    );
    void registrarManual("whatsapp", p.id);
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-ink">
          Pagamentos
        </h2>
        {podeGerir && (
          <button type="button" onClick={() => setNovaAberta((v) => !v)} className={btnGhost}>
            {novaAberta ? "Fechar" : "Nova cobrança"}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {assinatura?.parcelado ? (
          <>
            <Badge tone="ok">Boleto parcelado</Badge>
            <span className="text-muted">{formatBRL(assinatura.valor)} por parcela · um boleto por mês</span>
            <a
              href={`/api/pessoas/${personId}/carne`}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-ink underline-offset-2 hover:underline"
            >
              Baixar carnê (PDF)
            </a>
            {podeGerir && (
              <button
                type="button"
                onClick={cancelarAssinatura}
                disabled={ocupado}
                className="ml-auto text-xs font-medium text-destaque transition-colors hover:underline disabled:opacity-60"
              >
                Cancelar parcelamento
              </button>
            )}
          </>
        ) : assinatura ? (
          <>
            <Badge tone="ok">Assinatura ativa</Badge>
            <span className="text-muted">{formatBRL(assinatura.valor)}/mês · aluno escolhe PIX, boleto ou cartão</span>
            {podeGerir && (
              <button
                type="button"
                onClick={cancelarAssinatura}
                disabled={ocupado}
                className="ml-auto text-xs font-medium text-destaque transition-colors hover:underline disabled:opacity-60"
              >
                Cancelar assinatura
              </button>
            )}
          </>
        ) : (
          <span className="text-xs text-faint">Sem assinatura recorrente ativa.</span>
        )}
      </div>

      {cobranca && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm">
          <span className="font-medium text-ink">Cobrança enviada</span>
          {cobranca.estado.cor === "verde" ? (
            <Badge tone="ok">Sim</Badge>
          ) : cobranca.estado.cor === "vermelho" ? (
            <Badge tone="danger">Não</Badge>
          ) : (
            <span className="text-faint">—</span>
          )}
          <span className={cobranca.estado.cor === "vermelho" ? "text-danger" : "text-muted"}>
            {cobranca.estado.texto}
          </span>
        </div>
      )}

      {novaAberta && (
        <div className="mb-4 grid gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <label className="block">
            <span className={classeRotulo}>Valor (R$)</span>
            <input
              inputMode="decimal"
              value={nova.valor}
              onChange={(e) => setNova((n) => ({ ...n, valor: e.target.value }))}
              placeholder="0,00"
              className={classeCampo}
            />
          </label>
          <label className="block">
            <span className={classeRotulo}>Vencimento</span>
            <input
              type="date"
              value={nova.vencimento}
              onChange={(e) => setNova((n) => ({ ...n, vencimento: e.target.value }))}
              className={classeCampo}
            />
          </label>
          <label className="block">
            <span className={classeRotulo}>Descrição (o aluno vê)</span>
            <input
              value={nova.descricao}
              onChange={(e) => setNova((n) => ({ ...n, descricao: e.target.value }))}
              placeholder="Ex.: taxa do cartão de acesso"
              className={classeCampo}
            />
          </label>
          <button
            type="button"
            onClick={gerarAvulsa}
            disabled={ocupado || !nova.valor || !nova.vencimento || !nova.descricao.trim()}
            className={classeBotao({ variante: "primario", tamanho: "sm" })}
          >
            {ocupado ? "Gerando…" : "Gerar"}
          </button>
        </div>
      )}

      {erro && <MensagemErro className="mb-3">{erro}</MensagemErro>}

      {pagamentos === null ? (
        <p className="text-sm text-faint">Carregando…</p>
      ) : pagamentos.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma cobrança ainda.</p>
      ) : (
        <ul className="divide-y divide-border">
          {pagamentos.map((p) => {
            const st = STATUS[p.status] ?? STATUS.PENDING;
            const aberta = p.status === "PENDING" || p.status === "OVERDUE";
            const parcelaBalcao = p.asaasPaymentId.startsWith(PREFIXO_PARCELA_BALCAO);
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
                {aberta && parcelaBalcao && (
                  <button
                    type="button"
                    onClick={() => setRecebendo(p)}
                    className={classeBotao({ variante: "primario", tamanho: "sm" })}
                  >
                    Receber no balcão
                  </button>
                )}
                {aberta && p.link && (
                  <button type="button" onClick={() => copiar(p)} className={btnGhost}>
                    {copiado === p.link ? "Copiado" : "Copiar link"}
                  </button>
                )}
                {aberta && p.link && cobranca?.aluno.telefone && (
                  <button type="button" onClick={() => whatsapp(p)} className={btnGhost}>
                    WhatsApp
                  </button>
                )}
                {aberta && podeGerir && (
                  <button
                    type="button"
                    onClick={() => cancelar(p)}
                    disabled={ocupado}
                    className="text-xs font-medium text-destaque transition-colors hover:underline disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cobranca && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">
            Cobranças feitas · últimos 3 meses: <span className="tabular-nums text-ink">{cobranca.envios.length}</span>
          </h3>
          {cobranca.envios.length === 0 ? (
            <p className="mt-2 text-sm text-faint">Nenhuma cobrança registrada.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {cobranca.envios.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm">
                  <span className={e.ok ? "text-ink" : "text-danger"}>
                    {descreverEnvio(e)}
                    {!e.ok && e.detalhe && <span className="ml-1 text-xs">— {e.detalhe}</span>}
                  </span>
                  <span className="tabular-nums text-xs text-faint">{formatData(e.quando)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {recebendo && (
        <CheckoutBalcao
          personId={personId}
          nome={cobranca?.aluno.nome ?? ""}
          planoNome="Plano parcelado no balcão"
          valor={recebendo.valor}
          onPago={() => {
            setRecebendo(null);
            void carregar();
          }}
          onFechar={() => setRecebendo(null)}
        />
      )}
    </Card>
  );
}
