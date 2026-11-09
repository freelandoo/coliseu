/**
 * Junta as conversas "sem número" (`remoteJid` = `@lid`) na conversa do
 * telefone, assim que o número fica conhecido (a Evolution viu o contato com
 * `remoteJidAlt`). Nelas não dá para responder pelo Coliseu.
 *
 * Roda na conferência de 5 em 5 min (auto-cura) e no script
 * `scripts/whatsapp-juntar-lid.ts` (com simulação).
 *
 * - Conversa do telefone existe: mensagens, registros de atendimento e aulas
 *   experimentais vão para ela; a duplicata é apagada, e o cadastro criado
 *   junto também, se for só dela (lead do WhatsApp sem outro vínculo).
 * - Não existe: a própria conversa ganha o telefone.
 * - Telefone desconhecido: fica como está.
 */
import { prisma } from "@/lib/db";
import { telefoneDoLidRepo } from "@/lib/repositories/whatsapp";
import { cortarTexto } from "@/lib/whatsapp/cortar";
import { telefoneDoJid } from "@/lib/whatsapp/telefone";

export async function juntarConversasLid(
  aplicar: boolean,
  log: (linha: string) => void = () => {},
): Promise<{ juntadas: number; semTelefone: number }> {
  const r = { juntadas: 0, semTelefone: 0 };
  const duplicatas = await prisma.conversa.findMany({
    where: { remoteJid: { endsWith: "@lid" } },
    include: { person: { select: { id: true, nome: true, origem: true } } },
    orderBy: { criadoEm: "asc" },
  });

  for (const d of duplicatas) {
    const alt = await telefoneDoLidRepo(d.remoteJid);
    const rotulo = `${d.remoteJid} (${d.pushName ?? "sem nome"})`;
    if (!alt) {
      r.semTelefone++;
      log(`  ✗ ${rotulo}: telefone desconhecido — fica como está`);
      continue;
    }
    const alvo = await prisma.conversa.findUnique({
      where: { instanceId_remoteJid: { instanceId: d.instanceId, remoteJid: alt } },
    });
    r.juntadas++;

    if (!alvo) {
      log(`  → ${rotulo}: ganha o telefone ${telefoneDoJid(alt)}`);
      if (aplicar) {
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
    log(`  ⇒ ${rotulo}: ${n} mensagem(ns) vão para a conversa de ${telefoneDoJid(alt)}`);
    if (!aplicar) continue;

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
          ...(ultima ? { ultimaMensagemEm: ultima.enviadaEm, ultimaMensagemPreview: cortarTexto(ultima.texto, 140) } : {}),
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
          log(`      cadastro "${d.person.nome}" (duplicado) apagado`);
        }
      } catch {
        log(`      cadastro "${d.person.nome}" tem outros vínculos — mantido, revisar à mão`);
      }
    }
  }
  return r;
}
