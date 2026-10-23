"use client";

import { useRef, useState, type ChangeEvent, type RefObject } from "react";
import { GravadorAudio } from "@/components/captacao/GravadorAudio";
import { IconeAnexo, IconeEnviar, IconeFechar } from "@/components/captacao/icones";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import { cn } from "@/lib/cn";
import { deveEnviarNoEnter, dicaComposer } from "@/lib/whatsapp/atalho-envio";

/**
 * Rodapé da conversa: convite pendente, citação em andamento, anexo, áudio,
 * texto e enviar. Só desenha e repassa — quem envia é o `ConversaPainel`.
 */
export function CaixaResposta({
  nome,
  caixaRef,
  texto,
  onTexto,
  citando,
  onCancelarCitacao,
  conviteEmEspera,
  onTrocarPeloConvite,
  onManterRascunho,
  enterEnvia,
  anexando,
  erro,
  onErro,
  onResponder,
  onArquivo,
  onAudio,
}: {
  /** Nome de quem recebe, para o leitor de tela saber para onde vai a resposta. */
  nome: string;
  caixaRef: RefObject<HTMLTextAreaElement | null>;
  texto: string;
  onTexto: (t: string) => void;
  citando: { autor: string | null; texto: string } | null;
  onCancelarCitacao: () => void;
  conviteEmEspera: boolean;
  onTrocarPeloConvite: () => void;
  onManterRascunho: () => void;
  enterEnvia: boolean;
  anexando: boolean;
  erro: string;
  onErro: (e: string) => void;
  onResponder: () => void;
  /** Imagem ou PDF escolhido, com o texto da caixa de legenda. */
  onArquivo: (arquivo: File) => void;
  /** Áudio gravado, sem legenda. */
  onAudio: (audio: File) => void;
}) {
  const [gravando, setGravando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const temConteudo = texto.trim().length > 0;

  function escolherArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (arquivo) onArquivo(arquivo);
  }

  return (
    <>
      {conviteEmEspera && (
        <div role="status" className="mb-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-sm text-ink">
          <p>Há um convite para remarcar a aula pronto, mas a caixa já tem um rascunho.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="contorno" onClick={onTrocarPeloConvite}>
              Trocar pelo convite
            </Botao>
            <Botao tamanho="sm" onClick={onManterRascunho}>
              Manter meu rascunho
            </Botao>
          </div>
        </div>
      )}
      {citando && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-border border-l-2 border-l-brand bg-surface-2 px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-destaque">Respondendo a {citando.autor ?? "mensagem"}</p>
            <p className="truncate text-xs text-muted">{citando.texto}</p>
          </div>
          <button
            type="button"
            onClick={onCancelarCitacao}
            aria-label="Cancelar citação"
            className="-mr-1 shrink-0 rounded p-1.5 text-faint transition-colors hover:text-ink"
          >
            <IconeFechar />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={inputArquivo}
          type="file"
          accept="image/*,application/pdf"
          onChange={escolherArquivo}
          className="hidden"
        />
        {!gravando && (
          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            disabled={anexando}
            title="Anexar imagem ou PDF"
            aria-label="Anexar imagem ou PDF"
            className="shrink-0 self-end rounded-lg border border-border-strong p-2.5 text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
          >
            <IconeAnexo />
          </button>
        )}

        <GravadorAudio desabilitado={anexando} onEstado={setGravando} onGravado={onAudio} onErro={onErro} />

        {!gravando && (
          <textarea
            ref={caixaRef}
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            aria-label={`Resposta para ${nome}`}
            onKeyUp={(e) => {
              if (e.key === "Escape" && citando) onCancelarCitacao();
            }}
            onKeyDown={(e) => {
              const enviar = deveEnviarNoEnter(
                {
                  key: e.key,
                  shiftKey: e.shiftKey,
                  ctrlKey: e.ctrlKey,
                  metaKey: e.metaKey,
                  isComposing: e.nativeEvent.isComposing,
                },
                enterEnvia,
              );
              if (!enviar) return;
              e.preventDefault();
              if (!anexando && temConteudo) onResponder();
            }}
            rows={2}
            placeholder={dicaComposer(enterEnvia)}
            className={cn(classeCampo, "max-h-40 min-h-11 flex-1 resize-none")}
          />
        )}
        {!gravando && (
          <button
            type="button"
            onClick={onResponder}
            disabled={anexando || !temConteudo}
            title="Enviar"
            aria-label="Enviar"
            className={cn(
              "shrink-0 self-end rounded-lg p-2.5 transition-colors",
              anexando || !temConteudo
                ? "cursor-not-allowed bg-surface-2 text-faint"
                : "bg-brand text-white hover:bg-brand-hover",
            )}
          >
            <IconeEnviar />
          </button>
        )}
      </div>
      {anexando && <p role="status" className="mt-2 text-xs text-muted">Enviando arquivo…</p>}
      {erro && <MensagemErro className="mt-2">{erro}</MensagemErro>}
    </>
  );
}
