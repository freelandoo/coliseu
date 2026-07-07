import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEnv } from "./env-check.js";

test("fake: exige DEVICE_ID", () => {
  assert.deepEqual(checkEnv({}), ["DEVICE_ID"]);
  assert.deepEqual(checkEnv({ DEVICE_ID: "x" }), []);
});

test("controlid: exige IDFACE_HOST/PASS, BACKEND_URL e AGENT_TOKEN", () => {
  const missing = checkEnv({ ADAPTER: "controlid", DEVICE_ID: "x" });
  assert.deepEqual(missing.sort(), ["AGENT_TOKEN", "BACKEND_URL", "IDFACE_HOST", "IDFACE_PASS"]);
});

test("controlid completo: sem faltantes", () => {
  assert.deepEqual(
    checkEnv({
      ADAPTER: "controlid", DEVICE_ID: "x", IDFACE_HOST: "10.0.0.9",
      IDFACE_PASS: "s", BACKEND_URL: "https://crm.exemplo.com", AGENT_TOKEN: "t",
    }),
    [],
  );
});
