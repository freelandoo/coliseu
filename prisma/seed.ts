import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

const HOJE = new Date("2026-06-28T12:00:00-03:00");
function offset(days: number): Date {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const unit = await prisma.unit.upsert({
    where: { slug: "coliseu-team" },
    update: {},
    create: { slug: "coliseu-team", nome: "Academia Coliseu Team" },
  });

  await prisma.user.upsert({
    where: { email: "admin@coliseu.local" },
    update: {},
    create: {
      email: "admin@coliseu.local",
      nome: "Administrador",
      passwordHash: await hash("coliseu123"),
      role: "ADMIN",
      unitId: unit.id,
    },
  });

  const planosSeed = [
    { id: "p-mensal", nome: "Mensal", valorMensal: 129.9, duracaoMeses: 1 },
    { id: "p-tri", nome: "Trimestral", valorMensal: 109.9, duracaoMeses: 3 },
    { id: "p-semestral", nome: "Semestral", valorMensal: 94.9, duracaoMeses: 6 },
    { id: "p-anual", nome: "Anual", valorMensal: 79.9, duracaoMeses: 12 },
  ];
  for (const p of planosSeed) {
    await prisma.plan.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, ativo: true, unitId: unit.id },
    });
  }

  const alunos = [
    { id: "a-01", codigo: "CD00001", nome: "Pedro Henrique", telefone: "(11) 98123-4507", email: "pedro@email.com", cpf: "312.456.789-01", planoId: "p-anual", status: "ACTIVE", matric: -9, venc: 356, pres: -1, origem: "indicacao" },
    { id: "a-02", codigo: "CD00002", nome: "Juliana Castro", telefone: "(11) 98123-4510", email: "juliana@email.com", cpf: "423.567.890-12", planoId: "p-mensal", status: "ACTIVE", matric: -20, venc: 10, pres: 0, origem: "balcao" },
    { id: "a-03", codigo: "CD00003", nome: "Anderson Pinto", telefone: "(11) 98123-4511", email: "anderson@email.com", cpf: "534.678.901-23", planoId: "p-tri", status: "PENDING_PAYMENT", matric: -1, venc: 89, pres: -1, origem: "balcao" },
    { id: "a-04", codigo: "CD00004", nome: "Fernanda Melo", telefone: "(11) 98123-4512", email: "fernanda@email.com", cpf: "645.789.012-34", planoId: "p-mensal", status: "ACTIVE", matric: -65, venc: -5, pres: -9, origem: "balcao" },
    { id: "a-05", codigo: "CD00005", nome: "Lucas Ferreira", telefone: "(11) 98123-4513", email: "lucas@email.com", cpf: "756.890.123-45", planoId: "p-semestral", status: "ACTIVE", matric: -40, venc: 140, pres: -8, origem: "balcao" },
    { id: "a-06", codigo: "CD00006", nome: "Patrícia Gomes", telefone: "(11) 98123-4514", email: "patricia@email.com", cpf: "867.901.234-56", planoId: "p-mensal", status: "ACTIVE", matric: -33, venc: 3, pres: -15, origem: "balcao" },
    { id: "a-07", codigo: "CD00007", nome: "Rodrigo Barros", telefone: "(11) 98123-4515", email: "rodrigo@email.com", cpf: "978.012.345-67", planoId: "p-tri", status: "ACTIVE", matric: -80, venc: 10, pres: -22, origem: "balcao" },
    { id: "a-08", codigo: "CD00008", nome: "Aline Cardoso", telefone: "(11) 98123-4516", email: "aline@email.com", cpf: "089.123.456-78", planoId: "p-mensal", status: "ACTIVE", matric: -95, venc: -12, pres: -30, origem: "balcao" },
  ] as const;

  for (const a of alunos) {
    const person = await prisma.person.upsert({
      where: { codigo: a.codigo },
      update: {},
      create: {
        codigo: a.codigo, nome: a.nome, telefone: a.telefone, email: a.email,
        cpf: a.cpf, origem: a.origem, fase: "aluno", unitId: unit.id,
        criadoEm: offset(a.matric),
      },
    });
    await prisma.membership.create({
      data: {
        personId: person.id, planId: a.planoId,
        status: a.status as never,
        matriculadoEm: offset(a.matric),
        vencimentoPlano: offset(a.venc),
        ultimaPresenca: offset(a.pres),
      },
    });
  }

  const leads = [
    { codigo: "CD09001", nome: "Marina Alves", telefone: "(11) 98123-4501", origem: "whatsapp", estagio: "novo", criado: -1 },
    { codigo: "CD09002", nome: "Diego Martins", telefone: "(11) 98123-4502", origem: "indicacao", estagio: "novo", criado: 0 },
    { codigo: "CD09003", nome: "Rafael Souza", telefone: "(11) 98123-4503", origem: "redes", estagio: "qualificado", criado: -2 },
    { codigo: "CD09004", nome: "Bianca Lima", telefone: "(11) 98123-4504", origem: "balcao", estagio: "qualificado", criado: -3 },
    { codigo: "CD09005", nome: "Thiago Nunes", telefone: "(11) 98123-4505", origem: "whatsapp", estagio: "interesse", criado: -4 },
    { codigo: "CD09006", nome: "Camila Rocha", telefone: "(11) 98123-4506", origem: "redes", estagio: "interesse", criado: -5 },
  ] as const;
  for (const l of leads) {
    await prisma.person.upsert({
      where: { codigo: l.codigo },
      update: {},
      create: {
        codigo: l.codigo, nome: l.nome, telefone: l.telefone, origem: l.origem,
        fase: "lead", estagio: l.estagio as never, unitId: unit.id, criadoEm: offset(l.criado),
      },
    });
  }

  const cobrancas = [
    { codigo: "CD00001", tipo: "matricula", valor: 79.9, venc: -9, status: "pago", asaasId: "pay_001", link: null },
    { codigo: "CD00002", tipo: "mensalidade", valor: 129.9, venc: 2, status: "pendente", asaasId: "pay_002", link: "https://asaas.com/c/pay_002" },
    { codigo: "CD00003", tipo: "matricula", valor: 109.9, venc: 1, status: "pendente", asaasId: null, link: "https://asaas.com/c/pay_003" },
    { codigo: "CD00004", tipo: "mensalidade", valor: 129.9, venc: -5, status: "atrasado", asaasId: "pay_004", link: null },
    { codigo: "CD00006", tipo: "mensalidade", valor: 129.9, venc: 3, status: "pendente", asaasId: "pay_006", link: "https://asaas.com/c/pay_006" },
    { codigo: "CD00008", tipo: "mensalidade", valor: 129.9, venc: -12, status: "atrasado", asaasId: "pay_008", link: null },
    { codigo: "CD00005", tipo: "mensalidade", valor: 94.9, venc: 8, status: "pendente", asaasId: "pay_005", link: "https://asaas.com/c/pay_005" },
  ] as const;
  for (const c of cobrancas) {
    const person = await prisma.person.findUnique({ where: { codigo: c.codigo } });
    if (!person) continue;
    await prisma.cobranca.create({
      data: {
        personId: person.id, tipo: c.tipo as never, valor: c.valor,
        vencimento: offset(c.venc), status: c.status as never,
        asaasId: c.asaasId ?? undefined, linkPagamento: c.link ?? undefined,
      },
    });
  }

  const despesas = [
    { categoria: "Luz", valor: 320, data: "2026-07-05", recorrente: false },
    { categoria: "Água", valor: 140, data: "2026-07-05", recorrente: false },
    { categoria: "Internet", valor: 150, data: "2026-07-03", recorrente: true },
  ];
  for (const d of despesas) {
    await prisma.despesa.create({
      data: { categoria: d.categoria, valor: d.valor, data: new Date(d.data), recorrente: d.recorrente },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
