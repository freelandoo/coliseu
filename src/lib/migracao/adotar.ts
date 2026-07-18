/**
 * Task 6 da migração: ADOÇÃO — aplica a conciliação no banco do Coliseu.
 *
 * Para cada usuário do aparelho casado com um aluno do CloudGym, semeia:
 *   Person (cria ou reusa por CPF) → Membership → DeviceUserMapping → AccessCredential.
 *
 * O mapping nasce IN_SYNC de propósito: o usuário JÁ existe no aparelho.
 * PENDING faria o provisionamento enfileirar um UPSERT, e o UPSERT sobrescreve
 * `registration` no device (risco R2) sem necessidade. Com o mapping pré-semeado,
 * `provisionarAcessoDePessoa` reusa o externalUserId e nada é reescrito.
 *
 * Idempotente: a âncora é o unique (deviceId, externalUserId) — item já adotado
 * é pulado inteiro. Nunca escreve nada no aparelho; só no Postgres.
 */

import { prisma } from "@/lib/db";
import type { ItemConciliacao } from "./conciliar";
import { normalizarCpf, normalizarNome } from "./normalizar";

export interface OpcoesAdocao {
  /** AccessDevice.id da catraca real (iDFace) no banco do Coliseu. */
  deviceId: string;
  /** Adotar também os REVISAR (confiança MEDIA) — só após revisão humana. */
  incluirRevisar?: boolean;
  /** Sem apply é dry-run: relata o que faria e não escreve nada. */
  apply?: boolean;
}

export interface ResumoAdocao {
  consideraveis: number;
  adotados: number;
  jaAdotados: number;
  pessoasCriadas: number;
  pessoasReusadas: number;
  planosCriados: number;
  avisos: string[];
  dryRun: boolean;
}

const STATUS_MEMBERSHIP = { ATIVO: "ACTIVE", BLOQUEADO: "SUSPENDED", INATIVO: "EXPIRED" } as const;

export async function adotarConciliacao(itens: ItemConciliacao[], opts: OpcoesAdocao): Promise<ResumoAdocao> {
  const apply = opts.apply === true;
  const resumo: ResumoAdocao = {
    consideraveis: 0, adotados: 0, jaAdotados: 0,
    pessoasCriadas: 0, pessoasReusadas: 0, planosCriados: 0,
    avisos: [], dryRun: !apply,
  };

  const device = await prisma.accessDevice.findUniqueOrThrow({ where: { id: opts.deviceId } });

  const situacoes = new Set(opts.incluirRevisar ? ["ADOTAR", "REVISAR"] : ["ADOTAR"]);
  const fila = itens.filter((i) => situacoes.has(i.situacao) && i.aluno);
  resumo.consideraveis = fila.length;

  // Alocação local de código: uma consulta só, incrementa em memória.
  const codigos = await prisma.person.findMany({ select: { codigo: true } });
  let maiorCodigo = codigos.reduce((max, r) => Math.max(max, Number(r.codigo.replace(/\D/g, "")) || 0), 0);

  const mappingsExistentes = await prisma.deviceUserMapping.findMany({
    where: { deviceId: device.id }, select: { externalUserId: true },
  });
  const jaMapeados = new Set(mappingsExistentes.map((m) => m.externalUserId));

  const planosDaUnidade = await prisma.plan.findMany({ where: { unitId: device.unitId } });
  const planoPorNome = new Map(planosDaUnidade.map((p) => [p.nome.trim().toUpperCase(), p.id]));

  // Reuso por CPF exige o NOME batendo também: no CloudGym existem alunos
  // distintos (dependente/responsável) compartilhando CPF — reusar só pelo CPF
  // faria o segundo sequestrar o mapping do primeiro.
  const pessoasComCpf = await prisma.person.findMany({
    where: { cpf: { not: null } }, select: { id: true, cpf: true, nome: true },
  });
  const pessoaPorCpf = new Map<string, { id: string; nomeNorm: string }>();
  for (const p of pessoasComCpf) {
    const cpf = normalizarCpf(p.cpf);
    if (cpf) pessoaPorCpf.set(cpf, { id: p.id, nomeNorm: normalizarNome(p.nome) });
  }

  for (const item of fila) {
    const aluno = item.aluno!;
    const externalUserId = String(item.device.id);

    if (jaMapeados.has(externalUserId)) { resumo.jaAdotados++; continue; }

    // Plano: reusa por nome na unidade; senão nasce inativo (não vendável) para ajuste manual.
    const chavePlano = (aluno.plano || "IMPORTADO CLOUDGYM (SEM PLANO)").trim().toUpperCase();
    let planId = planoPorNome.get(chavePlano);
    if (!planId) {
      resumo.planosCriados++;
      if (apply) {
        const plano = await prisma.plan.create({
          data: {
            unitId: device.unitId, nome: chavePlano, valorMensal: 0, ativo: false,
            duracaoMeses: mesesEntre(aluno.inicioISO, aluno.fimISO),
            descricao: "Importado do CloudGym na migração — revisar valor e duração",
          },
        });
        planId = plano.id;
      } else {
        planId = `dry-run-${chavePlano}`;
      }
      planoPorNome.set(chavePlano, planId);
    }

    const candidata = aluno.cpf ? pessoaPorCpf.get(aluno.cpf) ?? null : null;
    const personIdExistente = candidata && candidata.nomeNorm === aluno.nomeNorm ? candidata.id : null;
    if (personIdExistente) resumo.pessoasReusadas++;
    else resumo.pessoasCriadas++;

    let vencimento = aluno.fimISO ? new Date(`${aluno.fimISO}T12:00:00Z`) : null;
    if (!vencimento) {
      resumo.avisos.push(`${aluno.nome}: sem data Final no CloudGym — vencimento = hoje, revisar`);
      vencimento = new Date();
    }

    if (!apply) { resumo.adotados++; continue; }

    maiorCodigo++;
    const codigo = `CD${String(maiorCodigo).padStart(5, "0")}`;
    const adotado = await prisma.$transaction(async (tx) => {
      const person = personIdExistente
        ? await tx.person.update({ where: { id: personIdExistente }, data: { fase: "aluno" } })
        : await tx.person.create({
            data: {
              codigo, nome: aluno.nome.trim(), origem: "balcao", fase: "aluno",
              cpf: aluno.cpf || null, rg: aluno.rg || null, vendedor: aluno.vendedor || null,
              email: aluno.email || null, telefone: aluno.celular || null,
              dataNascimento: aluno.nascimentoISO, estado: aluno.estado || null,
              cidade: aluno.cidade || null, cep: aluno.cep || null, unitId: device.unitId,
            },
          });

      const temMembership = await tx.membership.findFirst({ where: { personId: person.id } });
      if (!temMembership) {
        await tx.membership.create({
          data: {
            personId: person.id, planId: planId!, status: STATUS_MEMBERSHIP[aluno.status],
            vencimentoPlano: vencimento!,
            matriculadoEm: aluno.inicioISO ? new Date(`${aluno.inicioISO}T12:00:00Z`) : new Date(),
          },
        });
      }

      // Pessoa reusada pode já ter mapping neste device (ex.: piloto/smoke com id
      // alocado 100x). O id do APARELHO vence — é onde a face real mora — e os
      // comandos PENDING do id antigo morrem junto (evita criar usuário fantasma).
      const mapExistente = await tx.deviceUserMapping.findUnique({
        where: { deviceId_personId: { deviceId: device.id, personId: person.id } },
      });
      if (mapExistente) {
        if (mapExistente.externalUserId !== externalUserId) {
          await tx.deviceCommand.deleteMany({
            where: { deviceId: device.id, personId: person.id, status: "PENDING" },
          });
        }
        await tx.deviceUserMapping.update({
          where: { id: mapExistente.id },
          data: { externalUserId, syncStatus: "IN_SYNC", lastSyncAt: new Date() },
        });
      } else {
        await tx.deviceUserMapping.create({
          data: { deviceId: device.id, personId: person.id, externalUserId, syncStatus: "IN_SYNC", lastSyncAt: new Date() },
        });
      }

      const enrolledAt = item.device.imageTimestamp ? new Date(item.device.imageTimestamp * 1000) : new Date();
      const faceExistente = await tx.accessCredential.findFirst({ where: { personId: person.id, type: "FACE" } });
      if (faceExistente) {
        await tx.accessCredential.update({
          where: { id: faceExistente.id },
          data: { status: "ENROLLED", deviceRef: externalUserId, enrolledAt, revokedAt: null },
        });
      } else {
        await tx.accessCredential.create({
          data: { personId: person.id, type: "FACE", status: "ENROLLED", deviceRef: externalUserId, enrolledAt },
        });
      }
      return person;
    });

    if (adotado.cpf) {
      pessoaPorCpf.set(normalizarCpf(adotado.cpf), { id: adotado.id, nomeNorm: normalizarNome(adotado.nome) });
    }
    jaMapeados.add(externalUserId);
    resumo.adotados++;
  }

  return resumo;
}

function mesesEntre(inicioISO: string | null, fimISO: string | null): number {
  if (!inicioISO || !fimISO) return 1;
  const inicio = new Date(inicioISO);
  const fim = new Date(fimISO);
  const meses = (fim.getUTCFullYear() - inicio.getUTCFullYear()) * 12 + (fim.getUTCMonth() - inicio.getUTCMonth());
  return Math.max(1, meses);
}
