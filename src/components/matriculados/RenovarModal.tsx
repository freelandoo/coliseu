"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { MetodoBalcao } from "@/components/matricula/CheckoutBalcao";
import type { Pessoa, Plano } from "@/lib/types";

const PASSOS = [
  "Confirmar plano atual",
  "Localizar cliente no CRM",
  "Criar/localizar no Asaas",
  "Gerar cobrança de renovação",
  "Enviar link (WhatsApp / e-mail)",
  "Webhook confirma pagamento",
  "Status: Pago / Ativo",
  "Renovação concluída",
] as const;

const METODOS: { key: MetodoBalcao; label: string; icone: string }[] = [
  { key: "dinheiro", label: "Dinheiro", icone: "💵" },
  { key: "pix", label: "PIX", icone: "⚡" },
  { key: "debito", label: "Cartão débito", icone: "💳" },
  { key: "credito", label: "Cartão crédito", icone: "💳" },
];

const METODO_LABEL: Record<MetodoBalcao, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão débito",
  credito: "Cartão crédito",
};

type CampoOpcional = "email" | "whatsapp" | "dataNascimento" | "endereco";

const LABEL_OPCIONAL: Record<CampoOpcional, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  dataNascimento: "Data de nascimento",
  endereco: "Endereço",
};

function camposFaltando(p: Pessoa): CampoOpcional[] {
  const faltando: CampoOpcional[] = [];
  if (!p.email?.trim()) faltando.push("email");
  if ((p.telefone ?? "").replace(/\D/g, "").length < 10) faltando.push("whatsapp");
  if (!p.dataNascimento) faltando.push("dataNascimento");
  const e = p.endereco;
  const enderecoCompleto =
    e?.cep?.trim() && e?.estado?.trim() && e?.cidade?.trim() && e?.rua?.trim() && e?.numero?.trim();
  if (!enderecoCompleto) faltando.push("endereco");
  return faltando;
}

type Fase = "processando" | "venda" | "pago";

export function RenovarModal({
  pessoa,
  plano,
  onFechar,
}: {
  pessoa: Pessoa;
  plano: Plano;
  onFechar: () => void;
}) {
  const [pago, setPago] = useState(false);
  const [animConcluida, setAnimConcluida] = useState(false);
  const [resultado, setResultado] = useState<{ waLink?: string } | null>(null);
  const [erro, setErro] = useState("");

  const [ativo, setAtivo] = useState(-1);
  const listaRef = useRef<HTMLOListElement>(null);

  const [metodo, setMetodo] = useState<MetodoBalcao>("dinheiro");
  const [parcelas, setParcelas] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [erroCheckout, setErroCheckout] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoBalcao>("dinheiro");

  const faltando = camposFaltando(pessoa);

  // dispara a renovação no backend em paralelo com a animação
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/pessoas/${pessoa.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "matricular", planoId: plano.id }),
        });
        if (cancelado) return;
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { erro?: string };
          setErro(d?.erro ?? "Falha ao gerar a renovação");
          return;
        }
        const data = (await r.json()) as { waLink?: string };
        setResultado({ waLink: data.waLink });
      } catch {
        if (!cancelado) setErro("Sem conexão com o servidor");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pessoa.id, plano.id]);

  // esteira animada (mesma da aba Renovar)
  useGSAP(
    () => {
      const itens = gsap.utils.toArray<HTMLElement>("[data-passo]");
      gsap.set(itens, { opacity: 0.35 });
      const tl = gsap.timeline({ onComplete: () => setAnimConcluida(true) });
      itens.forEach((el, i) => {
        tl.to(
          el,
          {
            opacity: 1,
            duration: 0.25,
            ease: "power2.out",
            onStart: () => setAtivo(i),
          },
          i === 0 ? 0 : "+=0.35",
        ).fromTo(
          el.querySelector("[data-bolinha]"),
          { scale: 0.6 },
          { scale: 1, duration: 0.3, ease: "back.out(2)" },
          "<",
        );
      });
    },
    { scope: listaRef },
  );

  // quando a animação e o backend terminam, o modal vira a venda de balcão
  const fase: Fase = pago ? "pago" : animConcluida && resultado ? "venda" : "processando";

  const credito = metodo === "credito";
  const valorParcela = credito && parcelas > 1 ? plano.valorMensal / parcelas : plano.valorMensal;

  async function confirmarBalcao() {
    setErroCheckout("");
    setEnviando(true);
    try {
      const r = await fetch(`/api/pessoas/${pessoa.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo, parcelas: credito ? parcelas : 1 }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { erro?: string };
        setErroCheckout(d?.erro ?? "Falha ao confirmar pagamento");
        setEnviando(false);
        return;
      }
      setMetodoPago(metodo);
      setPago(true);
    } catch {
      setErroCheckout("Sem conexão com o servidor");
      setEnviando(false);
    }
  }

  // A regra de "só fecha quando não está processando (ou deu erro)" agora vive
  // nos próprios botões: durante o processamento nenhum deles é renderizado.
  return (
    // Clique no fundo não fecha: a renovação em andamento não pode sumir com um
    // clique torto — sai pelos botões do próprio diálogo.
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]"
      >
        {fase === "processando" && (
          <>
            <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Renovando matrícula
            </h3>
            <p className="mt-0.5 text-xs text-faint">
              {pessoa.nome} · {plano.nome} · {formatBRL(plano.valorMensal)}/mês
            </p>

            <ol ref={listaRef} className="relative mt-6 flex flex-col gap-0">
              {PASSOS.map((passo, i) => {
                const feito = ativo > i;
                const corrente = ativo === i;
                return (
                  <li
                    key={passo}
                    data-passo
                    className="flex items-start gap-4 pb-5 last:pb-0"
                    style={{ opacity: ativo === -1 ? 0.35 : undefined }}
                  >
                    <div className="relative flex flex-col items-center">
                      <span
                        data-bolinha
                        className={cn(
                          "z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                          corrente
                            ? "border-red bg-red text-white shadow-[var(--shadow-red)]"
                            : feito
                              ? "border-ok/60 bg-ok/15 text-ok"
                              : "border-border bg-surface text-faint",
                        )}
                      >
                        {feito ? "✓" : i + 1}
                      </span>
                      {i < PASSOS.length - 1 && (
                        <span
                          className={cn(
                            "absolute top-7 h-full w-px",
                            ativo > i ? "bg-ok/40" : "bg-border",
                          )}
                        />
                      )}
                    </div>
                    <p
                      className={cn(
                        "pt-0.5 text-sm font-medium",
                        corrente ? "text-ink" : feito ? "text-muted" : "text-faint",
                      )}
                    >
                      {passo}
                    </p>
                  </li>
                );
              })}
            </ol>

            {erro && (
              <>
                <p className="mt-4 text-xs text-red-bright">{erro}</p>
                <button
                  onClick={onFechar}
                  className="mt-3 w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
                >
                  Fechar
                </button>
              </>
            )}
          </>
        )}

        {fase === "venda" && (
          <>
            <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Venda de balcão
            </h3>
            <p className="mt-0.5 text-xs text-faint">
              Renovação gerada · receba agora ou envie o link de pagamento
            </p>

            <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm">
              <Linha rotulo="Aluno" valor={pessoa.nome} />
              <Linha rotulo="Plano" valor={plano.nome} />
              <Linha rotulo="Total" valor={formatBRL(plano.valorMensal)} destaque />
            </div>

            {(resultado?.waLink || pessoa.email) && (
              <a
                href={resultado?.waLink ?? `mailto:${pessoa.email}`}
                target={resultado?.waLink ? "_blank" : undefined}
                rel="noreferrer"
                className="mt-4 block rounded-lg bg-red px-4 py-3 text-center font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
              >
                {resultado?.waLink
                  ? "Enviar link de pagamento no WhatsApp"
                  : "Enviar link de pagamento por e-mail"}
              </a>
            )}

            <div className="mt-5">
              <span className="text-xs font-semibold uppercase tracking-widest text-faint">
                Ou receber no balcão
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {METODOS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMetodo(m.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      metodo === m.key
                        ? "border-red/60 bg-red-ghost text-ink"
                        : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
                    )}
                  >
                    <span>{m.icone}</span>
                    <span className="font-medium">{m.label}</span>
                  </button>
                ))}
              </div>

              {credito && (
                <div className="mt-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-faint">
                    Parcelas
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 6, 12].map((n) => (
                      <button
                        key={n}
                        onClick={() => setParcelas(n)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm transition-colors",
                          parcelas === n
                            ? "border-red/60 bg-red-ghost text-ink"
                            : "border-border bg-surface text-muted hover:text-ink",
                        )}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                  {parcelas > 1 && (
                    <p className="mt-2 text-xs text-muted">
                      {parcelas}× de{" "}
                      <span className="font-medium text-ink">{formatBRL(valorParcela)}</span>
                    </p>
                  )}
                </div>
              )}

              {erroCheckout && <p className="mt-3 text-xs text-red-bright">{erroCheckout}</p>}

              <button
                onClick={confirmarBalcao}
                disabled={enviando}
                className="mt-4 w-full rounded-lg border border-red/50 px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest text-red-bright transition-colors hover:bg-red-ghost disabled:opacity-60"
              >
                {enviando
                  ? "Confirmando…"
                  : `Confirmar pagamento · ${formatBRL(plano.valorMensal)}`}
              </button>
            </div>

            {faltando.length > 0 && (
              <div className="mt-5 rounded-lg border border-warn/30 bg-warn/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-warn">
                  Obs · cadastro incompleto
                </p>
                <p className="mt-1 text-xs text-muted">
                  A renovação foi concluída, mas ainda faltam (não são obrigatórios):
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {faltando.map((campo) => (
                    <li
                      key={campo}
                      className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-ink"
                    >
                      {LABEL_OPCIONAL[campo]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={onFechar}
              className="mt-4 w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
            >
              Fechar
            </button>
          </>
        )}

        {fase === "pago" && (
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-2xl text-ok">
              ✓
            </span>
            <h3 className="mt-4 font-display text-xl font-semibold uppercase tracking-wide text-ink">
              Pagamento confirmado
            </h3>
            <p className="mt-1 text-sm text-muted">
              {pessoa.nome} · {METODO_LABEL[metodoPago]}
            </p>
            <p className="mt-0.5 text-xs text-faint">Renovação ativa e acesso liberado.</p>
            <button
              onClick={onFechar}
              className="mt-5 w-full rounded-lg bg-red px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-faint">{rotulo}</span>
      <span className={cn("font-medium", destaque ? "text-lg text-red-bright" : "text-ink")}>
        {valor}
      </span>
    </div>
  );
}
