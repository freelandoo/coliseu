import { test } from "node:test";
import assert from "node:assert/strict";
import { scriptCliqueCloudGym, encodarComando } from "./liberar-cloudgym.js";

test("script do CloudGym: acha a janela pelo título (null de verdade) e clica no canto do botão", () => {
  const s = scriptCliqueCloudGym();
  assert.ok(s.includes("FindWindow([NullString]::Value, 'Cloud Gym - Access Control')"), "$null viraria texto vazio e a janela nunca seria achada");
  assert.ok(s.includes("$x = $r.R - 70") && s.includes("$y = $r.B - 9"));
  assert.ok(s.includes("if ('clique' -eq 'post')"), "padrão é o clique de verdade");
  assert.ok(s.includes("exit 2"), "sem janela, sai com erro");
});

test("script do CloudGym: título com aspas simples não quebra o PowerShell", () => {
  assert.ok(scriptCliqueCloudGym({ titulo: "Jan'ela", modo: "post" }).includes("'Jan''ela'"));
});

test("encodarComando gera UTF-16LE em base64 (formato do -EncodedCommand)", () => {
  assert.equal(Buffer.from(encodarComando("exit 0"), "base64").toString("utf16le"), "exit 0");
});
