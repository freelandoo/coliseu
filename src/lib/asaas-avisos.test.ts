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

test("remarca o aviso de 10 dias para 5; desliga cobrança criada e linha digitável", () => {
  expect(ajustesDeAviso(padrao)).toEqual([
    { id: "n3", enabled: true, scheduleOffset: 5 },
    { id: "n5", enabled: false },
    { id: "n7", enabled: false },
  ]);
});

test("cliente configurado na régua de 26/10 (10 dias desligado) ganha o de 5 dias", () => {
  const antigo = padrao.map((a) => (["n3", "n5", "n7"].includes(a.id) ? { ...a, enabled: false } : a));
  expect(ajustesDeAviso(antigo)).toEqual([{ id: "n3", enabled: true, scheduleOffset: 5 }]);
});

test("já configurado: nada a mudar", () => {
  const feito = padrao.map((a) =>
    a.id === "n3" ? { ...a, scheduleOffset: 5 } : ["n5", "n7"].includes(a.id) ? { ...a, enabled: false } : a,
  );
  expect(ajustesDeAviso(feito)).toEqual([]);
});
