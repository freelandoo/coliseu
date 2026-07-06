import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

test("hash e verify batem", async () => {
  const h = await hashPassword("segredo123");
  expect(await verifyPassword(h, "segredo123")).toBe(true);
  expect(await verifyPassword(h, "errado")).toBe(false);
});
