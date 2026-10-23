import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ControlIdDeviceAdapter, OPEN_USER_ID_PADRAO } from "./controlid-device.js";
import { mapAccessLog, EVENT, type ControlIdAccessLog } from "./mapping.js";

interface Call { url: string; path: string; body: any }
type Reply = { status?: number; json?: unknown; text?: string };

const realFetch = globalThis.fetch;
let calls: Call[];

function installFetch(handler: (path: string, body: any, n: number) => Reply) {
  calls = [];
  let n = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    const s = String(url);
    const path = s.split("?")[0].replace(/^https?:\/\/[^/]+/, "");
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: s, path, body });
    const r = handler(path, body, n++);
    const status = r.status ?? 200;
    const text = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : "");
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (r.json !== undefined ? r.json : JSON.parse(text || "{}")),
      text: async () => text,
    } as Response;
  }) as typeof fetch;
}

function newAdapter() {
  return new ControlIdDeviceAdapter({ host: "10.0.0.9", login: "admin", password: "x", accessRuleId: 1, doorId: 1 });
}

beforeEach(() => {
  installFetch((path) => (path === "/login.fcgi" ? { json: { session: "S1" } } : { json: {} }));
});
afterEach(() => { globalThis.fetch = realFetch; });

test("faz login uma vez e reusa a sessão nas chamadas seguintes", async () => {
  const a = new ControlIdDeviceAdapter({ host: "10.0.0.9", login: "admin", password: "x", openAction: "auto" });
  await a.openTurnstile({ direction: "ENTRY" });
  await a.openTurnstile({ direction: "ENTRY" });
  const logins = calls.filter((c) => c.path === "/login.fcgi");
  assert.equal(logins.length, 1, "deve logar só uma vez");
  const actions = calls.filter((c) => c.path === "/execute_actions.fcgi");
  assert.equal(actions.length, 2);
  assert.ok(actions[0].url.includes("session=S1"), "sessão vai na query");
  assert.deepEqual(actions[0].body.actions[0], { action: "catra", parameters: "allow=both" });
});

test("liberar: se o aparelho recusa catra, tenta sec_box e memoriza a que funcionou", async () => {
  installFetch((path, body) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    const acao = (body as { actions?: { action: string }[] })?.actions?.[0]?.action;
    if (path === "/execute_actions.fcgi" && acao === "catra") return { status: 400, text: "invalid action" };
    return { json: {} };
  });
  const a = new ControlIdDeviceAdapter({ host: "10.0.0.9", login: "admin", password: "x", openAction: "auto" });
  await a.openTurnstile({ direction: "ENTRY" });
  await a.openTurnstile({ direction: "ENTRY" });
  const acoes = calls.filter((c) => c.path === "/execute_actions.fcgi").map((c) => c.body.actions[0].action);
  assert.deepEqual(acoes, ["catra", "sec_box", "sec_box"]);
});

test("liberar (padrão): entrada autorizada do usuário reservado Visitante, criado uma vez", async () => {
  const a = newAdapter();
  await a.openTurnstile({ direction: "ENTRY" });
  await a.openTurnstile({ direction: "ENTRY" });
  const criar = calls.filter((c) => c.path === "/create_objects.fcgi" && c.body.object === "users");
  assert.equal(criar.length, 1, "garante o usuário só na primeira liberação");
  assert.deepEqual(criar[0].body.values[0], { id: OPEN_USER_ID_PADRAO, name: "Visitante", registration: String(OPEN_USER_ID_PADRAO) });
  const aut = calls.filter((c) => c.path === "/remote_user_authorization.fcgi");
  assert.equal(aut.length, 2);
  assert.deepEqual(aut[0].body, { event: 7, user_id: OPEN_USER_ID_PADRAO, user_name: "Visitante", user_image: false, portal_id: 1, actions: [] });
  assert.equal(calls.filter((c) => c.path === "/execute_actions.fcgi").length, 0);
});

test("liberar: Visitante já existe no aparelho → não recria; erro ao garantir não impede liberar", async () => {
  installFetch((path, body) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/load_objects.fcgi" && body.object === "users") return { json: { users: [{ id: OPEN_USER_ID_PADRAO }] } };
    return { json: {} };
  });
  await newAdapter().openTurnstile({ direction: "ENTRY" });
  assert.equal(calls.filter((c) => c.path === "/create_objects.fcgi").length, 0);
  assert.equal(calls.filter((c) => c.path === "/remote_user_authorization.fcgi").length, 1);

  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/load_objects.fcgi") return { status: 400, text: "bad" };
    return { json: {} };
  });
  await newAdapter().openTurnstile({ direction: "ENTRY" });
  assert.equal(calls.filter((c) => c.path === "/remote_user_authorization.fcgi").length, 1);
});

test("liberação do Visitante não vira giro nem presença de aluno", async () => {
  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/load_objects.fcgi") {
      return { json: { access_logs: [
        { id: 11, time: 1_700_000_000, event: EVENT.ACCESS_GRANTED, user_id: OPEN_USER_ID_PADRAO },
        { id: 12, time: 1_700_000_010, event: EVENT.ACCESS_GRANTED, user_id: 12000005 },
      ] } };
    }
    return { json: {} };
  });
  const { events } = await newAdapter().pullAccessEvents("10");
  assert.equal(events[0].externalUserId, undefined);
  assert.equal(events[0].physicallyPassed, false);
  assert.equal(events[0].reason, "Liberação remota (CRM)");
  assert.equal(events[1].externalUserId, "12000005");
  assert.equal(events[1].physicallyPassed, true);
});

test("liberar com ação fixa (IDFACE_OPEN_ACTION=door) usa só ela", async () => {
  const a = new ControlIdDeviceAdapter({ host: "10.0.0.9", login: "admin", password: "x", doorId: 2, openAction: "door" });
  await a.openTurnstile({ direction: "ENTRY" });
  const act = calls.filter((c) => c.path === "/execute_actions.fcgi");
  assert.deepEqual(act.map((c) => c.body.actions[0]), [{ action: "door", parameters: "door=2" }]);
});

test("re-loga quando a sessão expira (401) e repete a chamada", async () => {
  installFetch((path, _body, n) => {
    if (path === "/login.fcgi") return { json: { session: n === 0 ? "S1" : "S2" } };
    if (path === "/execute_actions.fcgi" && calls.filter((c) => c.path === "/execute_actions.fcgi").length === 1) return { status: 401 };
    return { json: {} };
  });
  const a = new ControlIdDeviceAdapter({ host: "10.0.0.9", login: "admin", password: "x", openAction: "auto" });
  await a.openTurnstile({ direction: "ENTRY" });
  assert.equal(calls.filter((c) => c.path === "/login.fcgi").length, 2, "deve relogar");
  const last = calls[calls.length - 1];
  assert.ok(last.url.includes("session=S2"), "retry usa a nova sessão");
});

test("upsertUser usa create_or_modify (re-provisionar não pode falhar) e habilita", async () => {
  const a = newAdapter();
  await a.upsertUser({ externalUserId: "1001", nome: "Fulano", enabled: true });
  const upsert = calls.find((c) => c.path === "/create_or_modify_objects.fcgi" && c.body.object === "users");
  assert.ok(upsert, "usa create_or_modify_objects");
  assert.deepEqual(upsert!.body.values[0], { id: 1001, name: "Fulano", registration: "1001" });
  const link = calls.find((c) => c.path === "/create_objects.fcgi" && c.body.object === "user_access_rules");
  assert.deepEqual(link!.body.values[0], { user_id: 1001, access_rule_id: 1 });
});

test("primeira execução (sem cursor): bootstrap pula o histórico e não emite eventos", async () => {
  const historico = Array.from({ length: 3 }, (_, i) => ({ id: i + 1 }));
  installFetch((path, body) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/load_objects.fcgi") {
      const from = body.where?.[0]?.value ?? 0;
      return { json: { access_logs: historico.filter((l) => l.id > from) } };
    }
    return { json: {} };
  });
  const a = newAdapter();
  const batch = await a.pullAccessEvents(undefined);
  assert.equal(batch.events.length, 0, "não emite giros retroativos");
  assert.equal(batch.cursor, "3", "cursor posicionado no maior id do device");
});

test("disableUser remove o vínculo de access_rule", async () => {
  const a = newAdapter();
  await a.disableUser("1001");
  const del = calls.find((c) => c.path === "/destroy_objects.fcgi" && c.body.object === "user_access_rules");
  assert.deepEqual(del!.body.where, { user_access_rules: { user_id: 1001 } });
});

test("removeUser destrói o usuário", async () => {
  const a = newAdapter();
  await a.removeUser("1001");
  const del = calls.find((c) => c.path === "/destroy_objects.fcgi" && c.body.object === "users");
  assert.deepEqual(del!.body.where, { users: { id: 1001 } });
});

test("enroll facial: síncrono com captura automática; sucesso = ENROLLED", async () => {
  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/remote_enroll.fcgi") return { json: { success: true, user_id: 1001 } };
    return { json: {} };
  });
  const a = newAdapter();
  const r = await a.startBiometricEnrollment({ externalUserId: "1001", type: "FACE" });
  assert.equal(r.status, "ENROLLED");
  const enroll = calls.find((c) => c.path === "/remote_enroll.fcgi");
  assert.equal(enroll!.body.sync, true, "auto só vale no modo síncrono");
  assert.equal(enroll!.body.auto, true);
  assert.equal(enroll!.body.countdown, 3);
});

test("enroll facial: a foto da captura (user_image) volta no resultado, para o ack", async () => {
  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/remote_enroll.fcgi") return { json: { success: true, user_id: 1001, user_image: "/9j/4AAQSkZJRg==" } };
    return { json: {} };
  });
  const a = newAdapter();
  const r = await a.startBiometricEnrollment({ externalUserId: "1001", type: "FACE" });
  assert.equal(r.status, "ENROLLED");
  assert.equal(r.userImage, "/9j/4AAQSkZJRg==");
});

test("enroll facial: sem user_image, o resultado não inventa foto", async () => {
  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/remote_enroll.fcgi") return { json: { success: true } };
    return { json: {} };
  });
  const r = await newAdapter().startBiometricEnrollment({ externalUserId: "1001", type: "FACE" });
  assert.equal(r.userImage, undefined);
});

test("enroll facial: FACE_EXISTS vira erro legível (face legada no aparelho)", async () => {
  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/remote_enroll.fcgi") return { json: { success: false, error: "FACE_EXISTS" } };
    return { json: {} };
  });
  const a = newAdapter();
  await assert.rejects(
    () => a.startBiometricEnrollment({ externalUserId: "1001", type: "FACE" }),
    /já cadastrada em outro usuário/,
  );
});

test("pullAccessEvents mapeia logs, respeita cursor e avança", async () => {
  const logs: ControlIdAccessLog[] = [
    { id: 10, time: 1_700_000_000, event: EVENT.ACCESS_GRANTED, user_id: 1001 },
    { id: 11, time: 1_700_000_010, event: EVENT.ACCESS_DENIED, user_id: 1002 },
    { id: 12, time: 1_700_000_020, event: EVENT.NO_RESPONSE }, // não-decisão: descartado
  ];
  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/load_objects.fcgi") return { json: { access_logs: logs } };
    return { json: {} };
  });
  const a = newAdapter();
  const batch = await a.pullAccessEvents("9");
  assert.equal(batch.events.length, 2, "descarta o evento não-decisão");
  assert.equal(batch.events[0].decision, "ALLOWED");
  assert.equal(batch.events[0].physicallyPassed, true);
  assert.equal(batch.events[0].externalUserId, "1001");
  assert.equal(batch.events[1].decision, "DENIED");
  assert.equal(batch.cursor, "12", "cursor avança até o maior id visto, mesmo descartado");
});

test("pullAccessEvents filtra no cliente ids <= cursor (rede de segurança)", async () => {
  const logs: ControlIdAccessLog[] = [
    { id: 5, time: 1_700_000_000, event: EVENT.ACCESS_GRANTED, user_id: 1001 },
    { id: 6, time: 1_700_000_010, event: EVENT.ACCESS_GRANTED, user_id: 1001 },
  ];
  installFetch((path) => {
    if (path === "/login.fcgi") return { json: { session: "S1" } };
    if (path === "/load_objects.fcgi") return { json: { access_logs: logs } };
    return { json: {} };
  });
  const a = newAdapter();
  const batch = await a.pullAccessEvents("5");
  assert.equal(batch.events.length, 1, "ignora id=5 (<= cursor)");
  assert.equal(batch.events[0].deviceEventId, "6");
});

test("mapAccessLog: concedido, negado, não-decisão e saída", () => {
  const granted = mapAccessLog({ id: 1, time: 1_700_000_000, event: EVENT.ACCESS_GRANTED, user_id: 1001 });
  assert.equal(granted?.decision, "ALLOWED");
  assert.equal(granted?.physicallyPassed, true);
  assert.equal(granted?.direction, "ENTRY");

  const denied = mapAccessLog({ id: 2, time: 1_700_000_000, event: EVENT.ACCESS_DENIED, user_id: 1002 });
  assert.equal(denied?.decision, "DENIED");
  assert.equal(denied?.physicallyPassed, false);

  const noise = mapAccessLog({ id: 3, time: 1_700_000_000, event: EVENT.INTERCOM });
  assert.equal(noise, null);

  const exit = mapAccessLog(
    { id: 4, time: 1_700_000_000, event: EVENT.ACCESS_GRANTED, user_id: 1001, portal_id: 2 },
    { exitPortalIds: [2] },
  );
  assert.equal(exit?.direction, "EXIT");
});

test("abertura remota (Interface WEB, API, botoeira) não conta como giro", () => {
  for (const event of [EVENT.WEB_INTERFACE, EVENT.NON_IDENTIFIED_ACCESS, EVENT.PUSHBUTTON]) {
    const r = mapAccessLog({ id: 9, time: 1_700_000_000, event });
    assert.equal(r?.decision, "ALLOWED");
    assert.equal(r?.physicallyPassed, false, `event ${event} não é passagem`);
  }
});
