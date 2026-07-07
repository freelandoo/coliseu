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
  // Idempotente: limpa em ordem FK-safe antes de recriar (permite re-rodar o seed
  // sem depender de `prisma migrate reset`, que é bloqueado pelo guard do Prisma).
  await prisma.payment.deleteMany();
  await prisma.billingSubscription.deleteMany();
  await prisma.billingCustomer.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.cobranca.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.despesa.deleteMany();
  await prisma.session.deleteMany();
  // Domínio de acesso (Fase 3): limpar antes de Person/Unit para não violar FK
  // (tabelas criadas por testes de integração ficam pendentes entre execuções).
  await prisma.deviceCommand.deleteMany();
  await prisma.deviceHeartbeat.deleteMany();
  await prisma.accessEvent.deleteMany();
  await prisma.deviceUserMapping.deleteMany();
  await prisma.accessCredential.deleteMany();
  await prisma.enrollmentSession.deleteMany();
  await prisma.manualAccessOverride.deleteMany();
  await prisma.accessPolicy.deleteMany();
  await prisma.accessDevice.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.person.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();

  const unit = await prisma.unit.upsert({
    where: { slug: "coliseu-team" },
    update: {},
    create: { slug: "coliseu-team", nome: "Academia Coliseu Team" },
  });

  const usuarios = [
    { email: "admin@coliseu.local", nome: "Administrador", senha: "coliseu123", role: "ADMIN" as const },
    { email: "alex.rodriguus@gmail.com", nome: "Alex Rodrigues", senha: "coliseu123", role: "ADMIN" as const },
  ];
  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        nome: u.nome,
        passwordHash: await hash(u.senha),
        role: u.role,
        unitId: unit.id,
      },
    });
  }

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
    // Veterano fiel (2 anos de casa) — alimenta o mix e o LTV
    { id: "a-09", codigo: "CD00009", nome: "Sérgio Ramos", telefone: "(11) 98123-4517", email: "sergio@email.com", cpf: "190.234.567-89", planoId: "p-anual", status: "ACTIVE", matric: -730, venc: 120, pres: -2, origem: "indicacao" },
    // Cancelados — tempos de casa e de saída variados (ponto de evasão, reativação, churn)
    { id: "a-10", codigo: "CD00010", nome: "Marcos Vieira", telefone: "(11) 98123-4518", email: "marcos@email.com", cpf: "201.345.678-90", planoId: "p-mensal", status: "CANCELED", matric: -60, venc: -30, pres: -35, origem: "balcao" },
    { id: "a-11", codigo: "CD00011", nome: "Beatriz Nunes", telefone: "(11) 98123-4519", email: "beatriz@email.com", cpf: "312.456.789-02", planoId: "p-tri", status: "CANCELED", matric: -95, venc: -5, pres: -18, origem: "redes" },
    { id: "a-12", codigo: "CD00012", nome: "Sônia Prado", telefone: "(11) 98123-4520", email: "sonia@email.com", cpf: "423.567.890-13", planoId: "p-mensal", status: "CANCELED", matric: -150, venc: -120, pres: -120, origem: "balcao" },
    { id: "a-13", codigo: "CD00013", nome: "Carlos Dias", telefone: "(11) 98123-4521", email: "carlos@email.com", cpf: "534.678.901-24", planoId: "p-semestral", status: "CANCELED", matric: -400, venc: -230, pres: -250, origem: "indicacao" },
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

  // Espelho financeiro para as cobranças que têm asaasId
  const statusPay: Record<string, "PENDING" | "PAID" | "OVERDUE"> = {
    pago: "PAID", pendente: "PENDING", atrasado: "OVERDUE",
  };
  for (const c of cobrancas) {
    if (!c.asaasId) continue;
    const person = await prisma.person.findUnique({ where: { codigo: c.codigo } });
    if (!person) continue;
    const bc = await prisma.billingCustomer.upsert({
      where: { asaasCustomerId: `cus_seed_${c.codigo}` },
      update: {},
      create: { asaasCustomerId: `cus_seed_${c.codigo}`, personId: person.id, externalReference: person.id },
    });
    const bs = await prisma.billingSubscription.upsert({
      where: { asaasSubscriptionId: `sub_seed_${c.codigo}` },
      update: {},
      create: { asaasSubscriptionId: `sub_seed_${c.codigo}`, customerId: bc.id, value: c.valor },
    });
    await prisma.payment.upsert({
      where: { asaasPaymentId: c.asaasId },
      update: {},
      create: {
        asaasPaymentId: c.asaasId, subscriptionId: bs.id, value: c.valor,
        dueDate: offset(c.venc), status: statusPay[c.status] ?? "PENDING",
        paidAt: c.status === "pago" ? offset(c.venc) : null,
        statusUpdatedAt: offset(c.venc),
      },
    });
  }

  // Domínio de acesso (Fase 3): 1 catraca + 3 alunos com credencial FACE + mapeamento IN_SYNC.
  const device = await prisma.accessDevice.create({
    data: { unitId: unit.id, name: "Catraca Principal", mode: "HYBRID", status: "ONLINE", firmware: "sim-1.0", lastHeartbeatAt: new Date() },
  });
  const ativos = await prisma.person.findMany({ where: { fase: "aluno" }, take: 3 });
  let ext = 1000;
  for (const p of ativos) {
    ext += 1;
    await prisma.accessCredential.create({ data: { personId: p.id, type: "FACE", status: "ENROLLED", enrolledAt: new Date() } });
    await prisma.deviceUserMapping.create({ data: { deviceId: device.id, personId: p.id, externalUserId: String(ext), syncStatus: "IN_SYNC", lastSyncAt: new Date() } });
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
