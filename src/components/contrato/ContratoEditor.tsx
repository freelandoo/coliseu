"use client";

import { useRef, useState } from "react";
import { Botao } from "@/components/ui/Botao";
import type { ContratoDoAluno } from "@/lib/contrato/contrato-aluno";

/**
 * O contrato como folha de papel: já vem preenchido. "Editar" deixa mexer no
 * texto ali mesmo; "Salvar" guarda a versão deste aluno (reimprimir mantém);
 * "Voltar ao texto padrão" descarta a edição. A barra some na impressão.
 */
export function ContratoEditor({ inicial }: { inicial: ContratoDoAluno }) {
  const [contrato, setContrato] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  // Muda a cada troca de conteúdo vinda do servidor: remonta a folha (a
  // edição mexe no DOM direto, fora do React).
  const [versao, setVersao] = useState(0);
  const folha = useRef<HTMLDivElement>(null);

  async function chamar(metodo: "PUT" | "DELETE", corpo?: unknown) {
    setOcupado(true);
    setErro("");
    try {
      const r = await fetch(`/api/pessoas/${contrato.personId}/contrato`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const d = (await r.json()) as ContratoDoAluno & { erro?: string };
      if (!r.ok) throw new Error(d.erro || "Falha ao salvar");
      setContrato(d);
      setVersao((v) => v + 1);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setOcupado(false);
    }
  }

  function cancelar() {
    setEditando(false);
    setVersao((v) => v + 1); // desfaz o que foi digitado
  }

  return (
    <div className="min-h-dvh bg-[#e9e9e7] py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 14mm 16mm; }
        @media print { html, body { background: #fff !important; } }
        .folha-contrato p { margin: 0 0 0.5em; }
        .folha-contrato[contenteditable="true"] { outline: 2px dashed #b91c1c; outline-offset: 6px; }
      `}</style>

      <div className="sticky top-0 z-10 mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 shadow print:hidden">
        <div className="mr-auto min-w-0">
          <p className="text-sm font-semibold text-ink">
            Contrato · {contrato.nome} <span className="font-normal text-muted">({contrato.codigo})</span>
          </p>
          <p className="text-xs text-muted">
            {editando
              ? "Editando — clique no texto e altere o que precisar."
              : contrato.editado
                ? `Editado${contrato.editado.por ? ` por ${contrato.editado.por}` : ""} em ${new Date(contrato.editado.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`
                : "Preenchido com os dados do cadastro e da matrícula."}
          </p>
        </div>
        {editando ? (
          <>
            <Botao
              variante="primario"
              tamanho="sm"
              carregando={ocupado}
              onClick={() => void chamar("PUT", { html: folha.current?.innerHTML ?? "" })}
            >
              Salvar
            </Botao>
            <Botao tamanho="sm" onClick={cancelar} disabled={ocupado}>
              Cancelar
            </Botao>
          </>
        ) : (
          <>
            <Botao variante="primario" tamanho="sm" onClick={() => window.print()}>
              Imprimir
            </Botao>
            <Botao tamanho="sm" onClick={() => setEditando(true)}>
              Editar
            </Botao>
            {contrato.editado && (
              <Botao
                variante="discreto"
                tamanho="sm"
                disabled={ocupado}
                onClick={() => {
                  if (confirm("Descartar as edições e voltar ao texto padrão, preenchido com os dados atuais?")) {
                    void chamar("DELETE");
                  }
                }}
              >
                Voltar ao texto padrão
              </Botao>
            )}
          </>
        )}
        {erro && <p className="w-full text-xs text-danger">{erro}</p>}
      </div>

      <div
        key={versao}
        ref={folha}
        contentEditable={editando}
        suppressContentEditableWarning
        className="folha-contrato mx-auto max-w-[210mm] bg-white px-[14mm] py-[16mm] font-[Arial,Helvetica,sans-serif] text-[11pt] leading-snug text-black shadow-md print:max-w-none print:px-0 print:py-0 print:shadow-none"
        dangerouslySetInnerHTML={{ __html: contrato.html }}
      />
    </div>
  );
}
