import { expect, test } from "vitest";
import { prisma } from "@/lib/db";

test("prisma conecta e consulta", async () => {
  const n = await prisma.unit.count();
  expect(typeof n).toBe("number");
});
