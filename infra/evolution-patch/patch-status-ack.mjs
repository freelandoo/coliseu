/**
 * Patch do Baileys 7.0.0-rc.9 dentro da imagem evoapicloud/evolution-api:v2.3.7.
 *
 * Bug: o WhatsApp passou a mandar stanzas <status> de nível superior (Status /
 * stories). O Baileys não confirma (ack) essas stanzas; ~50 min depois o
 * servidor derruba o stream ("stream errored out", nó <ack class="status">).
 * A sessão reconecta "open", segue ENVIANDO, mas para de RECEBER mensagens.
 * Refs: evolution-api#2778, Baileys#2858; correção = Baileys PR #2883 /
 * evolution-api PR #2785 (ambos abertos em 09/11/2026).
 *
 * O patch é o mesmo do PR #2883, no JS compilado: confirma cada <status>
 * pelo `sendMessageAck` já existente (ack class="status"), sem decodificar,
 * inclusive as que chegam offline (fila em ordem).
 *
 * Falha o build se o arquivo não tiver os trechos esperados — imagem nova da
 * Evolution exige revisar este patch, não aplicá-lo às cegas.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ARQUIVO = process.argv[2] ?? "/evolution/node_modules/baileys/lib/Socket/messages-recv.js";
const MARCA = "/* coliseu: ack de <status> (Baileys#2858) */";

let fonte = readFileSync(ARQUIVO, "utf8");
if (fonte.includes(MARCA)) {
  console.log("patch já aplicado:", ARQUIVO);
  process.exit(0);
}

function trocar(ancora, novo) {
  const n = fonte.split(ancora).length - 1;
  if (n !== 1) throw new Error(`âncora encontrada ${n}x (esperado 1): ${ancora.slice(0, 60)}`);
  fonte = fonte.replace(ancora, novo);
}

// 1) handler, antes do processador offline (que precisa dele no mapa)
trocar(
  "    const makeOfflineNodeProcessor = () => {",
  `    ${MARCA}
    const handleStatusAck = async (node) => {
        try {
            await sendMessageAck(node);
        }
        catch (error) {
            onUnexpectedError(error, 'acking status');
        }
    };
    const makeOfflineNodeProcessor = () => {`,
);

// 2) stanzas offline também são confirmadas, na ordem da fila
trocar("            ['notification', handleNotification]\n        ]);", "            ['notification', handleNotification],\n            ['status', handleStatusAck]\n        ]);");

// 3) stanzas ao vivo
trocar(
  "    ws.on('CB:ack,class:message', (node) => {",
  `    ws.on('CB:status', (node) => {
        processNode('status', node, 'handling status', handleStatusAck).catch(error => onUnexpectedError(error, 'handling status'));
    });
    ws.on('CB:ack,class:message', (node) => {`,
);

writeFileSync(ARQUIVO, fonte);
console.log("patch aplicado:", ARQUIVO);
