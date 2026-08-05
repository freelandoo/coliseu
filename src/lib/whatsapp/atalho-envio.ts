/**
 * Regra da tecla Enter na caixa de resposta do atendimento.
 *
 * Não existe um jeito certo: quem veio do WhatsApp Web espera Enter enviando, e
 * quem escreve mensagem longa espera Enter quebrando linha. Em vez de escolher
 * por todo mundo, cada conta escolhe a sua (`User.enterEnvia`) — mas os dois
 * caminhos continuam completos, para ninguém ficar sem saída no meio de uma
 * resposta:
 *
 * - quem prefere Enter enviando quebra linha com Shift+Enter;
 * - quem prefere Enter quebrando linha envia com Ctrl+Enter (ou ⌘+Enter).
 *
 * O botão de enviar segue no lugar nos dois casos: atalho é atalho, não é a
 * única porta.
 */

/** Só o que importa do evento de teclado — assim o teste não monta um DOM. */
export type TeclaComposer = {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /**
   * Enter que fecha a composição do teclado (acento, sugestão do teclado do
   * celular) não é um Enter de gente: mandaria a mensagem no meio da palavra.
   */
  isComposing?: boolean;
};

export function deveEnviarNoEnter(tecla: TeclaComposer, enterEnvia: boolean): boolean {
  if (tecla.key !== "Enter") return false;
  if (tecla.isComposing) return false;
  // Ctrl/⌘+Enter envia sempre: é a saída de quem deixou o Enter quebrando linha
  // e o atalho que muita gente já traz na mão de outros aplicativos.
  if (tecla.ctrlKey || tecla.metaKey) return true;
  if (tecla.shiftKey) return false;
  return enterEnvia;
}

/** Dica na própria caixa: o atalho só existe para quem sabe que ele existe. */
export function dicaComposer(enterEnvia: boolean): string {
  return enterEnvia
    ? "Escreva a resposta… (Enter envia; Shift+Enter quebra linha)"
    : "Escreva a resposta… (Enter quebra linha; Ctrl+Enter envia)";
}
