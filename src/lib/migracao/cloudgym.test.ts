import { expect, test } from "vitest";
import { parseCloudGym, parseCsv } from "@/lib/migracao/cloudgym";

const CSV_ATIVOS = `"Nome","Status","RG","CPF","Email","Celular","Origem","Vendedor","Plano","Início","Final","Estado","Cidade","CEP","NPS"
"Adriana Nunes Rodrigues","Ativo","","216.034.558-09","dry@x.com","+5511965262737","email","Vendedor A","MUSCULAÇÃO ANUAL","24/02/2026","24/02/2027","SP","SBC","",""
"José, o ""Grande""","Bloqueado","","","jose@x.com","","","","LUTA MENSAL","01/09/2025","01/10/2025","SP","Diadema","09921-000",""`;

test("parseCsv: aspas, vírgula e aspas escapadas dentro do campo", () => {
  const linhas = parseCsv(CSV_ATIVOS);
  expect(linhas).toHaveLength(3);
  expect(linhas[2][0]).toBe('José, o "Grande"');
});

test("parseCloudGym: normaliza CPF, datas BR e status", () => {
  const { alunos, avisos } = parseCloudGym(CSV_ATIVOS);
  expect(alunos).toHaveLength(2);
  expect(alunos[0]).toMatchObject({
    nome: "Adriana Nunes Rodrigues",
    nomeNorm: "ADRIANA NUNES RODRIGUES",
    status: "ATIVO",
    cpf: "21603455809",
    plano: "MUSCULAÇÃO ANUAL",
    inicioISO: "2026-02-24",
    fimISO: "2027-02-24",
  });
  expect(alunos[1].status).toBe("BLOQUEADO");
  expect(alunos[1].cpf).toBe("");
  expect(avisos).toEqual([]);
});

test("parseCloudGym: formato dos inativos (sem Status/CPF) usa statusPadrao e avisa", () => {
  const csv = `"Nome","Nascimento","Email","Celular","Plano","Início","Final"
"AAINE POIANI COSTA","30/07/1990","nini@x.com","11997398906","DANCA DE SALAO MENSAL","18/10/2011","19/12/2011"`;
  const { alunos, avisos } = parseCloudGym(csv, "INATIVO");
  expect(alunos[0].status).toBe("INATIVO");
  expect(alunos[0].nascimentoISO).toBe("1990-07-30");
  expect(alunos[0].cpf).toBe("");
  expect(avisos).toContain("coluna ausente: status");
  expect(avisos).toContain("coluna ausente: cpf");
});

test("parseCloudGym: plano composto com | fica com a última compra que não é taxa", () => {
  const csv = `"Nome","Status","CPF","Plano","Final"
"A","Ativo","","0 FIGHT MENSAL|00 TAXA MATRICULA","30/12/2026"
"B","Ativo","","00 TAXA MATRICULA|0 FIGHT MENSAL","30/12/2026"
"C","Ativo","","0 FIGHT SEMESTRAL|0 CLUBE+ FULL ANUAL","30/12/2026"`;
  const { alunos } = parseCloudGym(csv);
  expect(alunos.map((a) => a.plano)).toEqual(["0 FIGHT MENSAL", "0 FIGHT MENSAL", "0 CLUBE+ FULL ANUAL"]);
});

test("parseCloudGym: linha sem nome é ignorada com aviso, dados ruins não estouram", () => {
  const csv = `"Nome","Status","CPF","Final"
"","Ativo","123","31/02/2026"
"Fulano","Ativo","111.222.333-4","30/12/2026"`;
  const { alunos, avisos } = parseCloudGym(csv);
  expect(alunos).toHaveLength(1);
  expect(alunos[0].cpf).toBe(""); // CPF com 10 dígitos: rejeitado com aviso
  expect(avisos.some((a) => a.includes("sem nome"))).toBe(true);
  expect(avisos.some((a) => a.includes("CPF inválido"))).toBe(true);
});
