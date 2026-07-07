import { expect, test } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  mapCobrancaStatus,
  mapMembershipStatus,
  normalizarCpf,
} from "@/lib/freelandoo/mapping";

test("normalizarCpf remove máscara e aceita null", () => {
  expect(normalizarCpf("123.456.789-09")).toBe("12345678909");
  expect(normalizarCpf(" 123 456 789 09 ")).toBe("12345678909");
  expect(normalizarCpf(null)).toBe("");
  expect(normalizarCpf(undefined)).toBe("");
});

test("mapMembershipStatus cobre todos os estados do Coliseu", () => {
  expect(mapMembershipStatus("ACTIVE")).toBe("active");
  expect(mapMembershipStatus("SUSPENDED")).toBe("overdue");
  expect(mapMembershipStatus("CANCELED")).toBe("canceled");
  expect(mapMembershipStatus("EXPIRED")).toBe("expired");
  expect(mapMembershipStatus("DRAFT")).toBe("pending");
  expect(mapMembershipStatus("PENDING_PAYMENT")).toBe("pending");
});

test("mapCobrancaStatus cobre os três estados", () => {
  expect(mapCobrancaStatus("pendente")).toBe("pending");
  expect(mapCobrancaStatus("pago")).toBe("paid");
  expect(mapCobrancaStatus("atrasado")).toBe("overdue");
});

test("cursor faz roundtrip e rejeita lixo", () => {
  const at = new Date("2026-07-07T12:00:00.000Z");
  const cur = encodeCursor(at, "abc123");
  const back = decodeCursor(cur);
  expect(back?.at.toISOString()).toBe(at.toISOString());
  expect(back?.id).toBe("abc123");
  expect(decodeCursor(null)).toBeNull();
  expect(decodeCursor("")).toBeNull();
  expect(decodeCursor("%%%not-base64%%%")).toBeNull();
  expect(decodeCursor(Buffer.from("sem-pipe", "utf8").toString("base64url"))).toBeNull();
});
