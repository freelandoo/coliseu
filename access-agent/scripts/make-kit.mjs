// Gera dist/coliseu-agent-kit/ — kit offline-installable para o PC da academia.
// Uso: npm run make-kit   (rodar com internet: baixa NSSM e Node MSI, com cache)
import { build } from "esbuild";
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import JSZip from "jszip";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // access-agent/
const kit = path.join(root, "dist", "coliseu-agent-kit");
const cache = path.join(root, "dist", ".cache");
mkdirSync(kit, { recursive: true });
mkdirSync(cache, { recursive: true });

// nssm.cc cai com frequência; o Wayback serve os bytes originais (id_).
// SHA-256 conferido com o checksum público (Chocolatey) — o kit roda como admin
// na academia, então integridade aqui é obrigatória.
const NSSM_URLS = [
  "https://nssm.cc/release/nssm-2.24.zip",
  "https://web.archive.org/web/2023id_/https://nssm.cc/release/nssm-2.24.zip",
];
const NSSM_SHA256 = "727d1e42275c605e0f04aba98095c38a8e1e46def453cdffce42869428aa6743";
const NODE_VERSION = "v22.14.0";
const NODE_MSI = `node-${NODE_VERSION}-x64.msi`;
const NODE_MSI_URL = `https://nodejs.org/dist/${NODE_VERSION}/${NODE_MSI}`;
const NODE_SHASUMS_URL = `https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`;

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function download(urls, dest, expectedSha) {
  if (existsSync(dest) && statSync(dest).size > 0 && (!expectedSha || sha256(dest) === expectedSha)) {
    console.log(`  (cache) ${path.basename(dest)}`);
    return;
  }
  let lastErr = null;
  for (const url of [urls].flat()) {
    try {
      console.log(`  baixando ${url} ...`);
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      if (expectedSha && sha256(dest) !== expectedSha) throw new Error("SHA-256 não confere");
      return;
    } catch (e) {
      lastErr = e;
      console.log(`    falhou: ${e.message} — tentando próxima fonte`);
    }
  }
  throw new Error(`download falhou em todas as fontes de ${path.basename(dest)}: ${lastErr?.message}`);
}

function crlf(s) {
  return s.replace(/\r?\n/g, "\r\n");
}

console.log("[1/4] Bundle do agente (esbuild)...");
await build({
  entryPoints: [path.join(root, "src", "agent.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(kit, "coliseu-agent.cjs"),
  banner: { js: "// Coliseu Agent (bundle) — gerado por make-kit; não editar na mão." },
});

console.log("[2/4] NSSM...");
const nssmZip = path.join(cache, "nssm-2.24.zip");
await download(NSSM_URLS, nssmZip, NSSM_SHA256);
// extração com jszip — o kit é gerado tanto no Windows (dev) quanto no build Linux do deploy
const nssmExe = path.join(cache, "nssm.exe");
if (!existsSync(nssmExe)) {
  const zip = await JSZip.loadAsync(readFileSync(nssmZip));
  const entry = zip.file("nssm-2.24/win64/nssm.exe");
  if (!entry) throw new Error("nssm.exe não encontrado dentro do zip");
  writeFileSync(nssmExe, await entry.async("nodebuffer"));
}
copyFileSync(nssmExe, path.join(kit, "nssm.exe"));

console.log("[3/4] Node.js LTS (msi)...");
// hash oficial vem do SHASUMS256.txt da própria release — nada de memória/hardcode.
const shasums = await (await fetch(NODE_SHASUMS_URL)).text();
const msiSha = shasums.split("\n").find((l) => l.includes(NODE_MSI))?.split(/\s+/)[0];
if (!msiSha) throw new Error(`hash de ${NODE_MSI} não encontrado em SHASUMS256.txt`);
const msiCache = path.join(cache, NODE_MSI);
await download(NODE_MSI_URL, msiCache, msiSha);
copyFileSync(msiCache, path.join(kit, "node-lts.msi"));

console.log("[4/4] Templates...");
const tpl = path.join(root, "kit-templates");
for (const f of readdirSync(tpl)) {
  const src = readFileSync(path.join(tpl, f), "utf8");
  const destName = f === "env.template" ? ".env" : f;
  // .bat exige CRLF (labels/goto quebram com LF); .env/.md CRLF p/ Bloco de Notas.
  writeFileSync(path.join(kit, destName), crlf(src));
}

// Carimbo de versão do kit — exibido no card do /perfil e vai junto no zip.
let commit = null;
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch { /* build fora de um repo git (ex.: CI sem .git) */ }
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
writeFileSync(
  path.join(kit, "kit-version.json"),
  JSON.stringify({ version: pkg.version, commit, builtAt: new Date().toISOString() }, null, 2),
);

console.log("\nKit pronto em dist/coliseu-agent-kit/:");
for (const f of readdirSync(kit)) {
  const kb = Math.round(statSync(path.join(kit, f)).size / 1024);
  console.log(`  ${f.padEnd(22)} ${kb} KB`);
}
console.log("\nPróximo passo: preencher o .env e seguir o INSTALL.md.");
