"use client";

import { useState } from "react";
import { Botao, classeBotao } from "@/components/ui/Botao";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";

/**
 * O que a tela sabe depois que o servidor registrou uma matrícula (ou
 * renovação): ela existe, o pagamento está pendente e — se o servidor devolveu
 * — há um link de cobrança. Nada além disso: "pago", "ativo" e "catraca
 * liberada" dependem do webhook, do balcão e do controle de acesso.
 *
 * Copiar o link ou abrir o WhatsApp/e-mail só abre o canal; não comprova envio
 * nem entrega, e a tela diz isso.
 */
export function ResultadoMatricula({
  titulo,
  nome,
  planoNome,
  valor,
  linkPagamento,
  waLink,
  email,
  onBalcao,
  onConcluir,
}: {
  titulo: string;
  nome: string;
  planoNome: string;
  valor: number;
  linkPagamento?: string;
  waLink?: string;
  email?: string;
  /** Receber agora no balcão (checkout existente). */
  onBalcao?: () => void;
  onConcluir: () => void;
}) {
  const [copiado, setCopiado] = useState<"sim" | "erro" | null>(null);

  async function copiar() {
    if (!linkPagamento) return;
    try {
      await navigator.clipboard.writeText(linkPagamento);
      setCopiado("sim");
    } catch {
      setCopiado("erro");
    }
  }

  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent("Link de pagamento — Academia Coliseu")}${
        linkPagamento ? `&body=${encodeURIComponent(`Olá, ${nome}! Segue o link de pagamento: ${linkPagamento}`)}` : ""
      }`
    : undefined;

  return (
    <div>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-lg text-success">
          ✓
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink">{titulo}</h2>
          <p className="text-sm text-muted">
            {nome} · {planoNome} · {formatBRL(valor)}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-3 text-sm">
        <Situacao tom="ok">Matrícula registrada no sistema</Situacao>
        <Situacao tom="pendente">Pagamento pendente — ainda não confirmado</Situacao>
        {linkPagamento ? (
          <Situacao tom="ok">Cobrança disponível (link de pagamento gerado)</Situacao>
        ) : (
          <Situacao tom="neutro">O servidor não devolveu link de pagamento</Situacao>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Quando o pagamento for confirmado (pelo Asaas ou no balcão), a matrícula passa a ativa. A liberação na catraca
        segue o controle de acesso.
      </p>

      {(linkPagamento || waLink || mailto) && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">Mandar o link para a pessoa</p>
          <div className="flex flex-wrap gap-2">
            {linkPagamento && (
              <Botao tamanho="sm" onClick={() => void copiar()}>
                {copiado === "sim" ? "Link copiado" : "Copiar link"}
              </Botao>
            )}
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer" className={classeBotao({ variante: "contorno", tamanho: "sm" })}>
                Abrir WhatsApp
              </a>
            )}
            {mailto && (
              <a href={mailto} className={classeBotao({ variante: "contorno", tamanho: "sm" })}>
                Abrir e-mail
              </a>
            )}
          </div>
          {copiado === "erro" && <p className="text-xs text-danger">Não deu para copiar. Selecione o link: {linkPagamento}</p>}
          <p className="text-xs text-faint">Abrir o WhatsApp ou o e-mail não confirma que a mensagem foi enviada.</p>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {onBalcao && (
          <Botao variante="contorno" bloco onClick={onBalcao}>
            Receber agora no balcão →
          </Botao>
        )}
        <Botao variante="primario" bloco onClick={onConcluir}>
          Concluir
        </Botao>
      </div>
    </div>
  );
}

function Situacao({ tom, children }: { tom: "ok" | "pendente" | "neutro"; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          tom === "ok" ? "bg-success" : tom === "pendente" ? "bg-warning" : "bg-control",
        )}
      />
      <span className="text-ink">{children}</span>
    </li>
  );
}
