/**
 * Extração da base do CloudGym pela API oficial (https://api.cloudgym.io/docs) — SÓ LEITURA.
 *
 * Uso:  npx tsx scripts/migracao/extrair-cloudgym.ts [--sem-contratos]
 *
 * Credenciais (ClientID/SecretID de integração, NÃO o login do painel) em
 * `usuarios/cloudgym-api.env` (fora do git):
 *   CLOUDGYM_CLIENT_ID=...
 *   CLOUDGYM_SECRET_ID=...
 *
 * Escreve em `usuarios/cloudgym-api/`:
 *   units.json, plans.json, prospects.json, members.json
 *   contratos/<memberId>.json  → { contracts, payments }  (retomável: pula o que já existe)
 *
 * Dados de cartão que a API devolve no contrato (numbercc, ccvcc, validcc, brandcc,
 * account, agency, bank) são descartados antes de gravar — nunca tocam o disco.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = resolve(__dirname, "../..");
const DIR_SAIDA = resolve(RAIZ, "usuarios/cloudgym-api");
const DIR_CONTRATOS = resolve(DIR_SAIDA, "contratos");
const ARQ_ENV = resolve(RAIZ, "usuarios/cloudgym-api.env");
const BASE = "https://api.cloudgym.io";
const CONCORRENCIA = 4;
const CAMPOS_CARTAO = ["numbercc", "ccvcc", "validcc", "brandcc", "account", "agency", "bank"];

function lerEnv(): { clientId: string; secretId: string } {
  const vars: Record<string, string> = { ...process.env } as Record<string, string>;
  if (existsSync(ARQ_ENV)) {
    for (const linha of readFileSync(ARQ_ENV, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  const clientId = vars.CLOUDGYM_CLIENT_ID ?? "";
  const secretId = vars.CLOUDGYM_SECRET_ID ?? "";
  if (!clientId || !secretId) {
    console.error(`faltam CLOUDGYM_CLIENT_ID/CLOUDGYM_SECRET_ID (em ${ARQ_ENV} ou no ambiente)`);
    process.exit(1);
  }
  return { clientId, secretId };
}

let token = "";
let credenciais: { clientId: string; secretId: string };

async function autenticar(): Promise<void> {
  const basic = Buffer.from(`${credenciais.clientId}:${credenciais.secretId}`).toString("base64");
  const res = await fetch(`${BASE}/auth`, { method: "POST", headers: { Authorization: `Basic ${basic}` } });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok || !corpo.accessToken) {
    throw new Error(`/auth falhou: HTTP ${res.status} ${JSON.stringify(corpo).slice(0, 200)}`);
  }
  token = corpo.accessToken;
}

/** GET com re-login em 401 e retentativa em 429/5xx. */
async function get(path: string, tentativa = 0): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 && tentativa < 1) {
    await autenticar();
    return get(path, tentativa + 1);
  }
  if ((res.status === 429 || res.status >= 500) && tentativa < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** tentativa));
    return get(path, tentativa + 1);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** As coleções vêm embrulhadas ({ member: [...] }, { plan: [...] }…); devolve o array. */
function lista(corpo: unknown): Record<string, unknown>[] {
  if (Array.isArray(corpo)) return corpo;
  if (corpo && typeof corpo === "object") {
    for (const v of Object.values(corpo)) if (Array.isArray(v)) return v;
  }
  return [];
}

/** Pagina `?pagination=N` até vir página vazia ou repetida (o contrato da API não documenta o fim). */
async function paginado(path: string): Promise<Record<string, unknown>[]> {
  const todos: Record<string, unknown>[] = [];
  const vistos = new Set<string>();
  for (let pagina = 1; pagina < 10_000; pagina++) {
    const itens = lista(await get(`${path}?pagination=${pagina}`));
    const novos = itens.filter((i) => !vistos.has(String(i.id)));
    if (!novos.length) break;
    for (const i of novos) vistos.add(String(i.id));
    todos.push(...novos);
    process.stdout.write(`\r${path}: ${todos.length}`);
  }
  process.stdout.write("\n");
  return todos;
}

function semCartao(contrato: Record<string, unknown>): Record<string, unknown> {
  const limpo = { ...contrato };
  for (const campo of CAMPOS_CARTAO) delete limpo[campo];
  return limpo;
}

function gravar(nome: string, dados: unknown): void {
  writeFileSync(resolve(DIR_SAIDA, nome), JSON.stringify(dados, null, 1));
}

async function contratosDe(memberId: string): Promise<void> {
  const arq = resolve(DIR_CONTRATOS, `${memberId}.json`);
  if (existsSync(arq)) return;
  const contracts = lista(await get(`/v1/contract/findbymember/${memberId}`)).map(semCartao);
  const payments: Record<string, unknown>[] = [];
  for (const c of contracts) payments.push(...lista(await get(`/v1/payment/findbycontract/${c.id}`)));
  writeFileSync(arq, JSON.stringify({ contracts, payments }));
}

async function main() {
  credenciais = lerEnv();
  mkdirSync(DIR_CONTRATOS, { recursive: true });
  await autenticar();
  console.log("autenticado no CloudGym");

  gravar("units.json", lista(await get("/v1/unit")));
  gravar("plans.json", lista(await get("/v1/plan")));
  gravar("prospects.json", await paginado("/v1/prospect"));
  const members = await paginado("/v1/member");
  gravar("members.json", members);
  console.log(`membros: ${members.length}`);

  if (process.argv.includes("--sem-contratos")) return;

  const fila = members.map((m) => String(m.id));
  let feitos = 0;
  const falhas: string[] = [];
  await Promise.all(
    Array.from({ length: CONCORRENCIA }, async () => {
      for (let id = fila.shift(); id; id = fila.shift()) {
        try {
          await contratosDe(id);
        } catch (e) {
          falhas.push(`${id}: ${(e as Error).message}`);
        }
        process.stdout.write(`\rcontratos/pagamentos: ${++feitos}/${members.length}`);
      }
    }),
  );
  process.stdout.write("\n");
  if (falhas.length) {
    gravar("falhas.txt", falhas.join("\n"));
    console.log(`${falhas.length} falhas (rode de novo para retomar) — ver falhas.txt`);
  }
  console.log(`pronto: ${DIR_SAIDA}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
