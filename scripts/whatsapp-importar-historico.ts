/**
 * Importa para o Coliseu as mensagens que a Evolution recebeu e o webhook não
 * entregou — o buraco de 10/10 a 26/10/2026 (webhook quebrado) e qualquer
 * outro que apareça.
 *
 * Uso:
 *   npx tsx scripts/whatsapp-importar-historico.ts --desde 2026-10-10 --ate 2026-10-27            → só conta
 *   npx tsx scripts/whatsapp-importar-historico.ts --desde 2026-10-10 --ate 2026-10-27 --aplicar  → grava
 *
 * Entra como histórico: não conta como não lida, não toca push e não muda a
 * ordem da caixa de entrada. Só grava em conversa que **já existe** — contato
 * que escreveu só naquela época não vira lead novo de repente.
 *
 * As mensagens antigas só têm o `@lid` (sem telefone). O telefone vem do mapa
 * `@lid → número` montado com as mensagens posteriores do mesmo contato, que já
 * chegam com `remoteJidAlt`. Sem mapa, a mensagem fica de fora.
 */
import { prisma } from "@/lib/db";
import { conferirMensagens, evolutionNoBanco, mensagensFaltando } from "@/lib/whatsapp/conferencia";
import { instanciaAtualRepo } from "@/lib/repositories/whatsapp";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function mapaLid(): Promise<Map<string, string>> {
  const linhas = await prisma.$queryRaw<{ lid: string; alt: string }[]>`
    select distinct on (e.key->>'remoteJid') e.key->>'remoteJid' lid, e.key->>'remoteJidAlt' alt
      from evolution."Message" e
     where e.key->>'remoteJid' like '%@lid' and e.key->>'remoteJidAlt' like '%@s.whatsapp.net'
     order by e.key->>'remoteJid', e."messageTimestamp" desc`;
  return new Map(linhas.map((l) => [l.lid, l.alt]));
}

async function main() {
  const desde = new Date(`${arg("desde") ?? ""}T00:00:00-03:00`);
  const ate = new Date(`${arg("ate") ?? ""}T00:00:00-03:00`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(ate.getTime()) || desde >= ate) {
    throw new Error("Informe --desde AAAA-MM-DD e --ate AAAA-MM-DD (ate exclusivo).");
  }
  if (!(await evolutionNoBanco())) throw new Error("Schema evolution não encontrado neste banco.");
  const instancia = await instanciaAtualRepo();
  if (!instancia) throw new Error("Nenhuma instância de WhatsApp cadastrada.");

  const mapa = await mapaLid();
  console.log(`Mapa @lid → telefone: ${mapa.size} contato(s).`);

  if (!process.argv.includes("--aplicar")) {
    let total = 0;
    let cursor = desde;
    for (;;) {
      const linhas = await mensagensFaltando(instancia.evolutionInstance, cursor, ate, 5000);
      total += linhas.length;
      if (linhas.length < 5000) break;
      cursor = new Date(Number(linhas[linhas.length - 1].messageTimestamp) * 1000 + 1000);
    }
    console.log(`Faltando no período: ${total} mensagem(ns) (inclui reações e outras que serão puladas).`);
    console.log("Nada gravado. Rode de novo com --aplicar.");
    return;
  }

  const r = await conferirMensagens(desde, ate, {
    historico: true,
    soConversaExistente: true,
    mapearJid: (jid) => mapa.get(jid),
  });
  console.log(
    `Encontradas ${r.encontradas}: ${r.gravadas} importada(s), ${r.duplicadas} já existiam, ` +
      `${r.puladas} pulada(s) (reação/protocolo, sem telefone ou sem conversa no Coliseu).`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
