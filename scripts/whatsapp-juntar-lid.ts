/**
 * Junta as conversas "sem número" (`remoteJid` = `@lid`) na conversa do
 * telefone. Elas nasceram em 09/11/2026, no histórico que o WhatsApp mandou
 * logo depois de escanear o QR — e nelas não dá para responder.
 *
 * Uso:
 *   npx tsx scripts/whatsapp-juntar-lid.ts            → só mostra
 *   npx tsx scripts/whatsapp-juntar-lid.ts --aplicar  → junta
 *
 * - Telefone conhecido e conversa do telefone existe: mensagens, registros de
 *   atendimento e aulas experimentais vão para ela; a duplicata é apagada.
 * - Telefone conhecido sem conversa: a própria conversa ganha o telefone.
 * - O cadastro criado junto com a duplicata é apagado se for só dela (lead do
 *   WhatsApp sem nenhum outro vínculo); se tiver vínculo, fica e é listado.
 * - Telefone desconhecido: fica como está e é listado.
 */
import { prisma } from "@/lib/db";
import { telefoneDoLidRepo } from "@/lib/repositories/whatsapp";
import { telefoneDoJid } from "@/lib/whatsapp/telefone";

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  const duplicatas = await prisma.conversa.findMany({
    where: { remoteJid: { endsWith: "@lid" } },
    include: { person: { select: { id: true, nome: true, origem: true } } },
    orderBy: { criadoEm: "asc" },
  });
  console.log(`${duplicatas.length} conversa(s) sem número.${APLICAR ? "" : " (simulação)"}`);

  for (const d of duplicatas) {
    const alt = await telefoneDoLidRepo(d.remoteJid);
    const rotulo = `${d.remoteJid} (${d.pushName ?? "sem nome"})`;
    if (!alt) {
      console.log(`  ✗ ${rotulo}: telefone desconhecido — fica como está`);
      continue;
    }
    const alvo = await prisma.conversa.findUnique({
      where: { instanceId_remoteJid: { instanceId: d.instanceId, remoteJid: alt } },
    });

    if (!alvo) {
      console.log(`  → ${rotulo}: ganha o telefone ${telefoneDoJid(alt)}`);
      if (APLICAR) {
        await prisma.conversa.update({
          where: { id: d.id },
          data: { remoteJid: alt, telefone: telefoneDoJid(alt) },
        });
        if (d.person && d.person.origem === "whatsapp") {
          await prisma.person.update({ where: { id: d.person.id }, data: { telefone: telefoneDoJid(alt) } });
        }
      }
      continue;
    }

    const n = await prisma.mensagem.count({ where: { conversaId: d.id } });
    console.log(`  ⇒ ${rotulo}: ${n} mensagem(ns) vão para a conversa de ${telefoneDoJid(alt)}`);
    if (!APLICAR) continue;

    await prisma.$transaction(async (tx) => {
      await tx.mensagem.updateMany({ where: { conversaId: d.id }, data: { conversaId: alvo.id } });
      await tx.atendimentoRegistro.updateMany({ where: { conversaId: d.id }, data: { conversaId: alvo.id } });
      await tx.aulaExperimental.updateMany({ where: { conversaId: d.id }, data: { conversaId: alvo.id } });
      const ultima = await tx.mensagem.findFirst({
        where: { conversaId: alvo.id },
        orderBy: { enviadaEm: "desc" },
        select: { enviadaEm: true, texto: true },
      });
      await tx.conversa.update({
        where: { id: alvo.id },
        data: {
          naoLidas: alvo.naoLidas + d.naoLidas,
          ...(ultima ? { ultimaMensagemEm: ultima.enviadaEm, ultimaMensagemPreview: ultima.texto.slice(0, 120) } : {}),
        },
      });
      await tx.conversa.delete({ where: { id: d.id } });
    });

    // Cadastro que nasceu da duplicata: só apaga se não tiver mais nada.
    if (d.person && d.person.origem === "whatsapp" && d.person.id !== alvo.personId) {
      try {
        const outras = await prisma.conversa.count({ where: { personId: d.person.id } });
        if (outras === 0) {
          await prisma.person.delete({ where: { id: d.person.id } });
          console.log(`      cadastro "${d.person.nome}" (duplicado) apagado`);
        }
      } catch {
        console.log(`      cadastro "${d.person.nome}" tem outros vínculos — mantido, revisar à mão`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
