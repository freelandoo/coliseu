/**
 * Regras da gravação de voz do atendimento — separadas do componente para
 * poderem ser testadas sem navegador.
 */

/**
 * Formatos aceitos, em ordem de preferência.
 *
 * ogg/opus primeiro porque é o que o WhatsApp usa em mensagem de voz: quando o
 * navegador já grava assim, a Evolution converte menos. webm/opus é o que o
 * Chrome e o Android entregam; mp4 é a única saída do Safari, e sem ele o
 * iPhone da recepção ficaria sem gravar. O último item é a rede: navegador que
 * não anuncia formato nenhum grava no padrão dele.
 */
const PREFERIDOS = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

/**
 * Primeiro formato que o navegador diz saber gravar. `""` significa "deixe o
 * navegador escolher" — é o que o MediaRecorder entende como padrão.
 */
export function escolherFormato(suportado: (mime: string) => boolean): string {
  return PREFERIDOS.find(suportado) ?? "";
}

/** Extensão só para o arquivo ter nome de gente no upload; quem decide é o mime. */
export function extensaoDoFormato(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

/** Teto de duração: acima disso a gravação para sozinha e fica pronta para envio. */
export const LIMITE_GRAVACAO_S = 300;

/** mm:ss do contador — minuto não zera à esquerda, segundo sim. */
export function duracao(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
