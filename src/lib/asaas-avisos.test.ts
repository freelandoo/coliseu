import { expect, test } from "vitest";
import { ajustesDeAviso, type AvisoAsaas } from "@/lib/asaas";

const padrao: AvisoAsaas[] = [
  { id: "n1", event: "PAYMENT_RECEIVED", scheduleOffset: 0, enabled: true },
  { id: "n2", event: "PAYMENT_OVERDUE", scheduleOffset: 0, enabled: true },
  { id: "n3", event: "PAYMENT_DUEDATE_WARNING", scheduleOffset: 10, enabled: true },
  { id: "n4", event: "PAYMENT_DUEDATE_WARNING", scheduleOffset: 0, enabled: true },
  { id: "n5", event: "PAYMENT_CREATED", scheduleOffset: 0, enabled: true },
  { id: "n6", event: "PAYMENT_UPDATED", scheduleOffset: 0, enabled: true },
  { id: "n7", event: "SEND_LINHA_DIGITAVEL", scheduleOffset: 0, enabled: true },
  { id: "n8", event: "PAYMENT_OVERDUE", scheduleOffset: 7, enabled: true },
];

test("desliga cobrança criada, linha digitável e o aviso de 10 dias; mantém o do dia, vencida e recibo", () => {
  expect(ajustesDeAviso(padrao)).toEqual([
    { id: "n3", enabled: false },
    { id: "n5", enabled: false },
    { id: "n7", enabled: false },
  ]);
});

test("já configurado: nada a mudar", () => {
  const feito = padrao.map((a) => (["n3", "n5", "n7"].includes(a.id) ? { ...a, enabled: false } : a));
  expect(ajustesDeAviso(feito)).toEqual([]);
});
