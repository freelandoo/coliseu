import { expect, test } from "vitest";
import { conferirWebhook } from "@/lib/whatsapp/evolution";
import { emHorarioDeAtendimento, evolutionNoBanco, itemDaLinha } from "@/lib/whatsapp/conferencia";

const ESPERADO = {
  url: "https://coliseu.exemplo/api/webhooks/whatsapp",
  events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
  headers: { "x-webhook-secret": "s3gredo" },
};

test("webhook salvo igual ao enviado passa na conferência", () => {
  expect(conferirWebhook(ESPERADO, { ...ESPERADO, enabled: true })).toBeNull();
});

test("webhook com problema diz qual", () => {
  expect(conferirWebhook(ESPERADO, { ...ESPERADO, enabled: false })).toMatch(/desligado/);
  expect(conferirWebhook(ESPERADO, { ...ESPERADO, enabled: true, url: "https://outro" })).toMatch(/endereço/);
  expect(conferirWebhook(ESPERADO, { ...ESPERADO, enabled: true, events: ["QRCODE_UPDATED"] })).toMatch(
    /MESSAGES_UPSERT/,
  );
  expect(
    conferirWebhook(ESPERADO, { ...ESPERADO, enabled: true, headers: { "x-webhook-secret": "velho" } }),
  ).toMatch(/senha/);
  expect(conferirWebhook(ESPERADO, null)).toMatch(/não devolveu/);
});

test("horário de atendimento: segunda a sábado, 8h às 21h de São Paulo", () => {
  expect(emHorarioDeAtendimento(new Date("2026-11-09T11:00:00Z"))).toBe(true); // seg 08:00
  expect(emHorarioDeAtendimento(new Date("2026-11-09T10:59:00Z"))).toBe(false); // seg 07:59
  expect(emHorarioDeAtendimento(new Date("2026-11-10T00:30:00Z"))).toBe(false); // seg 21:30
  expect(emHorarioDeAtendimento(new Date("2026-11-08T15:00:00Z"))).toBe(false); // domingo
  expect(emHorarioDeAtendimento(new Date("2026-11-14T15:00:00Z"))).toBe(true); // sábado
});

test("linha da Evolution vira item do messages.upsert", () => {
  const item = itemDaLinha({
    key: { id: "X1", remoteJid: "5511@s.whatsapp.net", fromMe: false },
    message: { conversation: "oi" },
    pushName: null,
    messageTimestamp: 1_794_000_000,
  });
  expect(item).toEqual({
    key: { id: "X1", remoteJid: "5511@s.whatsapp.net", fromMe: false },
    pushName: "",
    messageTimestamp: 1_794_000_000,
    message: { conversation: "oi" },
  });
});

test("sem o schema da Evolution (dev/teste) a conferência não faz nada", async () => {
  expect(await evolutionNoBanco()).toBe(false);
});
