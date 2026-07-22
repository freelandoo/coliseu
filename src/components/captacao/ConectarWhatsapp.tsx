"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { WhatsappStatus } from "@/lib/types";

interface StatusResposta {
  configurado: boolean;
  existe: boolean;
  status: WhatsappStatus;
  numero?: string;
  erro?: string;
}

/** O QR do WhatsApp expira em ~20s; renovamos um pouco antes. */
const RENOVAR_QR_MS = 18_000;
const CHECAR_STATUS_MS = 3_000;

type ResultadoQr =
  | { ok: true; conectado: boolean; qr: string | null; pairing: string | null }
  | { ok: false; erro: string };

/**
 * Garante a instância (POST é idempotente) e pede um QR novo.
 * Função pura de I/O, fora do componente: não toca estado, então pode ser
 * chamada de dentro de um efeito sem provocar render em cascata.
 */
async function pedirQr(): Promise<ResultadoQr> {
  try {
    const criacao = await fetch("/api/whatsapp/instancia", { method: "POST" });
    if (!criacao.ok) {
      const d = await criacao.json().catch(() => ({}));
      return { ok: false, erro: d?.erro ?? "Não foi possível preparar a conexão." };
    }

    const r = await fetch("/api/whatsapp/instancia/qrcode", { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: d?.erro ?? "Não foi possível gerar o QR Code." };

    return {
      ok: true,
      conectado: !!d.conectado,
      qr: d.qrBase64 ?? null,
      pairing: d.pairingCode ?? null,
    };
  } catch {
    return { ok: false, erro: "Falha de conexão com o servidor." };
  }
}

export function ConectarWhatsapp({ inicial }: { inicial: StatusResposta }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResposta>(inicial);
  const [modal, setModal] = useState(false);

  // A página renderiza com o status do banco (rápido); aqui confirmamos com a
  // Evolution, que é a fonte da verdade da sessão.
  useEffect(() => {
    if (!inicial.configurado || !inicial.existe) return;
    let ativo = true;
    fetch("/api/whatsapp/instancia", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: StatusResposta | null) => {
        if (ativo && d) setStatus(d);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [inicial.configurado, inicial.existe]);

  const conectado = status.status === "CONNECTED";

  if (!status.configurado) {
    return (
      <span
        title="Defina EVOLUTION_URL e EVOLUTION_API_KEY no ambiente."
        className="rounded-lg border border-border px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-faint"
      >
        WhatsApp não configurado
      </span>
    );
  }

  return (
    <>
      {conectado ? (
        <button
          type="button"
          onClick={() => setModal(true)}
          className="flex items-center gap-2 rounded-lg border border-ok/40 bg-ok/10 px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-ok transition-colors hover:bg-ok/15"
        >
          <span className="h-2 w-2 rounded-full bg-ok" />
          WhatsApp conectado
          {status.numero && <span className="font-sans text-xs normal-case tracking-normal opacity-80">{status.numero}</span>}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setModal(true)}
          className="rounded-lg bg-red px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
        >
          Conectar WhatsApp
        </button>
      )}

      {modal && (
        <ModalConexao
          conectado={conectado}
          numero={status.numero}
          onStatus={(s) => setStatus((a) => ({ ...a, ...s }))}
          onFechar={() => {
            setModal(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ModalConexao({
  conectado,
  numero,
  onStatus,
  onFechar,
}: {
  conectado: boolean;
  numero?: string;
  onStatus: (s: Partial<StatusResposta>) => void;
  onFechar: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(!conectado);
  const [pareado, setPareado] = useState(conectado);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  /** Aplica no estado o que `pedirQr` trouxe. Sempre chamada depois de um await. */
  const aplicar = useCallback(
    (r: ResultadoQr) => {
      if (!vivo.current) return;
      setCarregando(false);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setErro("");
      if (r.conectado) {
        setPareado(true);
        onStatus({ status: "CONNECTED" });
        return;
      }
      setQr(r.qr);
      setPairing(r.pairing);
    },
    [onStatus],
  );

  useEffect(() => {
    if (conectado) return;
    let ativo = true;
    (async () => {
      const r = await pedirQr();
      if (ativo) aplicar(r);
    })();
    return () => {
      ativo = false;
    };
  }, [conectado, aplicar]);

  // Renova o QR antes de expirar, enquanto ninguém pareou.
  useEffect(() => {
    if (pareado || erro) return;
    const t = setInterval(async () => {
      const r = await pedirQr();
      aplicar(r);
    }, RENOVAR_QR_MS);
    return () => clearInterval(t);
  }, [pareado, erro, aplicar]);

  // Detecta o pareamento sem depender do usuário fechar o modal.
  useEffect(() => {
    if (pareado) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/whatsapp/instancia", { cache: "no-store" });
        const d = (await r.json()) as StatusResposta;
        if (!vivo.current) return;
        onStatus(d);
        if (d.status === "CONNECTED") setPareado(true);
      } catch {
        /* rede instável: a próxima volta resolve */
      }
    }, CHECAR_STATUS_MS);
    return () => clearInterval(t);
  }, [pareado, onStatus]);

  async function desconectar() {
    setCarregando(true);
    await fetch("/api/whatsapp/instancia", { method: "DELETE" }).catch(() => undefined);
    onStatus({ status: "DISCONNECTED", numero: "" });
    onFechar();
  }

  return (
    // Quem rola é o backdrop, e o diálogo centraliza com `m-auto` em vez de
    // `items-center`: com conteúdo mais alto que a tela, `items-center` empurra o
    // topo para fora da viewport e ele fica inalcançável (não dá nem para rolar
    // até ele). Com margem automática o excedente vira scroll normal.
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/70 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="m-auto w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-plate)]"
      >
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          {pareado ? "WhatsApp conectado" : "Conectar WhatsApp"}
        </h3>

        {pareado ? (
          <>
            <span className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-2xl text-ok">
              ✓
            </span>
            <p className="mt-3 text-sm text-muted">
              As conversas recebidas entram sozinhas na aba <strong className="text-ink">Atendimento</strong>.
            </p>
            {numero && <p className="mt-1 text-xs text-faint">Número {numero}</p>}
            <p className="mt-3 text-xs text-faint">
              Ninguém é respondido automaticamente — toda resposta sai daqui, digitada pela recepção.
            </p>
            <button
              onClick={onFechar}
              className="mt-5 w-full rounded-lg bg-red px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
            >
              Concluir
            </button>
            <button
              onClick={desconectar}
              disabled={carregando}
              className="mt-3 w-full rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              Desconectar aparelho
            </button>
          </>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-faint">Aponte a câmera do celular da academia</p>

            <div className="mx-auto mt-5 flex h-[264px] w-[264px] items-center justify-center rounded-lg bg-white p-3">
              {qr ? (
                // QR vem como data URI da Evolution; <img> evita otimização do Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR Code para conectar o WhatsApp" className="h-full w-full" />
              ) : (
                <span className="text-sm text-neutral-500">
                  {erro ? "QR indisponível" : "Gerando QR Code…"}
                </span>
              )}
            </div>

            <ol className="mt-5 space-y-1 text-left text-sm text-muted">
              <li>1. Abra o WhatsApp no celular</li>
              <li>2. Toque em ⋮ → <strong className="text-ink">Aparelhos conectados</strong></li>
              <li>3. Toque em <strong className="text-ink">Conectar um aparelho</strong></li>
              <li>4. Aponte a câmera para este QR Code</li>
            </ol>

            <p className="mt-3 text-xs text-faint">O QR se renova sozinho a cada 20s.</p>

            {pairing && (
              <p className="mt-3 break-all text-xs text-faint">
                Código de pareamento: <span className="text-muted">{pairing}</span>
              </p>
            )}

            {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

            <div className="mt-5 flex gap-3">
              <button
                onClick={async () => {
                  setCarregando(true);
                  setErro("");
                  aplicar(await pedirQr());
                }}
                disabled={carregando}
                className={cn(
                  "flex-1 rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
                  carregando ? "cursor-not-allowed bg-surface-2 text-faint" : "bg-red text-white hover:bg-red-bright",
                )}
              >
                {carregando ? "Aguarde…" : "Atualizar QR Code"}
              </button>
              <button
                onClick={onFechar}
                className="rounded-lg border border-border-strong px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
