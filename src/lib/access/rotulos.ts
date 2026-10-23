/**
 * Os códigos da catraca em português, para a tela. O banco e o agente seguem
 * falando ONLINE, DEAD_LETTER, ALLOWED…; quem lê a tela é a recepção.
 * Código desconhecido aparece como veio — melhor um código que um buraco.
 */

export const STATUS_CATRACA: Record<string, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  MAINTENANCE: "Em manutenção",
};

export const TIPO_COMANDO: Record<string, string> = {
  UPSERT_USER: "Enviar aluno",
  ENABLE: "Liberar aluno",
  DISABLE: "Bloquear aluno",
  REMOVE_USER: "Tirar aluno do aparelho",
  ENROLL: "Cadastrar face",
  OPEN: "Abrir catraca",
  SYNC_RULES: "Atualizar regras",
  SHUTDOWN: "Parar agente",
};

export const STATUS_COMANDO: Record<string, string> = {
  PENDING: "Na fila",
  DISPATCHED: "Enviado",
  ACKNOWLEDGED: "Recebido",
  SUCCEEDED: "Concluído",
  FAILED: "Falhou",
  DEAD_LETTER: "Desistiu (falhou várias vezes)",
};

export const DECISAO: Record<string, string> = {
  ALLOWED: "Liberado",
  DENIED: "Negado",
};

/** Motivo curto da decisão (o longo, para o diagnóstico, mora em `diagnostico.ts`). */
export const MOTIVO_CURTO: Record<string, string> = {
  OK: "em dia",
  EM_CARENCIA: "na carência",
  CORTESIA: "cortesia",
  SEM_BIOMETRIA: "sem face",
  AGUARDANDO_SYNC: "não está no aparelho",
  AGUARDANDO_PAGAMENTO: "aguardando 1º pagamento",
  INADIMPLENTE: "inadimplente",
  CANCELADO: "matrícula cancelada",
  EXPIRADO: "plano vencido",
  SUSPENSO: "matrícula suspensa",
  OVERRIDE_ALLOW: "liberação manual",
  OVERRIDE_BLOCK: "bloqueio manual",
  FORA_DE_HORARIO: "fora do horário",
};

export function rotulo(mapa: Record<string, string>, codigo: string): string {
  return mapa[codigo] ?? codigo;
}
