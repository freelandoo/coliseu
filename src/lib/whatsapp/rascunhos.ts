/**
 * Rascunhos do Atendimento — o texto ainda não enviado de cada conversa.
 *
 * Mesma regra da memória de navegação (`memoria-navegacao.ts`): só na memória
 * do JavaScript da aba. Texto de conversa pode ter CPF, endereço, assunto de
 * saúde — não vai para URL, log, localStorage, sessionStorage nem banco.
 * Some no reload, ao fechar a aba e ao sair da conta (o logout recarrega a
 * página); trocar de conta sem recarregar também limpa (ver `usarConta`).
 *
 * A chave é a conversa: o texto de uma pessoa nunca aparece na caixa de outra.
 * A citação guardada é a da mesma conversa, por id — o servidor ainda confere
 * no envio que a mensagem citada pertence à conversa.
 *
 * Anexo e áudio não entram: arquivo escolhido e gravação em andamento são da
 * tela aberta e não sobrevivem a trocar de conversa nem a reload.
 */
import type { MensagemItem } from "@/lib/types";

export interface Rascunho {
  texto: string;
  citando: MensagemItem | null;
}

let dono: string | null = null;
const rascunhos = new Map<string, Rascunho>();
/** Convites de remarcação já tratados (carregados ou dispensados) nesta aba. */
const convitesTratados = new Set<string>();

/**
 * A conta que está usando a tela. Outra conta na mesma aba (sem reload) não
 * herda nada: tudo que havia é apagado antes.
 */
export function usarConta(conta: string): void {
  if (dono === conta) return;
  rascunhos.clear();
  convitesTratados.clear();
  dono = conta;
}

export function lerRascunho(conversaId: string): Rascunho | null {
  return rascunhos.get(conversaId) ?? null;
}

/** Texto em branco e sem citação = sem rascunho. */
export function guardarRascunho(conversaId: string, r: Rascunho): void {
  if (!r.texto.trim() && !r.citando) {
    rascunhos.delete(conversaId);
    return;
  }
  // Citação de outra conversa não é guardada aqui (defesa: nunca deveria vir).
  const citando = r.citando && r.citando.id.startsWith("tmp:") ? null : r.citando;
  rascunhos.set(conversaId, { texto: r.texto, citando });
}

export function apagarRascunho(conversaId: string): void {
  rascunhos.delete(conversaId);
}

export function temRascunho(conversaId: string): boolean {
  const r = rascunhos.get(conversaId);
  return !!r && (r.texto.trim().length > 0 || !!r.citando);
}

const chaveConvite = (conversaId: string, data: string) => `${conversaId}|${data}`;

export function conviteTratado(conversaId: string, data: string): boolean {
  return convitesTratados.has(chaveConvite(conversaId, data));
}

export function marcarConviteTratado(conversaId: string, data: string): void {
  convitesTratados.add(chaveConvite(conversaId, data));
}

/** Só para testes. */
export function limparTudo(): void {
  rascunhos.clear();
  convitesTratados.clear();
  dono = null;
}
