import { expect, test } from "vitest";
import { podePapel } from "@/lib/auth/rbac";

test("ADMIN pode tudo; RECEPCAO não é TECNICO", () => {
  expect(podePapel("ADMIN", ["ADMIN"])).toBe(true);
  expect(podePapel("ADMIN", ["TECNICO"])).toBe(true);
  expect(podePapel("RECEPCAO", ["TECNICO"])).toBe(false);
  expect(podePapel("RECEPCAO", ["RECEPCAO", "ADMIN"])).toBe(true);
});
