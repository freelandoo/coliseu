import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { MatriculadosTabs } from "@/components/matriculados/MatriculadosTabs";
import { MatriculaFlow } from "@/components/matricula/MatriculaFlow";
import { linkPagamentoWhatsApp } from "@/lib/asaas";
import { idSeguro } from "@/lib/navegacao";
import {
  candidatosMatricula,
  listarCobrancas,
  listarPessoas,
  listarPlanos,
  paraAluno,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RenovarPage({
  searchParams,
}: {
  /** `pessoa`: id opaco vindo da ficha — só pré-seleciona quem já é candidato. */
  searchParams: Promise<{ pessoa?: string | string[] }>;
}) {
  const { pessoa } = await searchParams;
  const preSelecionadoId = idSeguro(Array.isArray(pessoa) ? pessoa[0] : pessoa);
  // Uma leitura de leads + alunos serve aos candidatos e à lista de pendentes;
  // das cobranças só interessam as pendentes.
  const [pessoas, cobrancas, planos] = await Promise.all([
    listarPessoas(["lead", "aluno"]),
    listarCobrancas(["pendente"]),
    listarPlanos(),
  ]);
  const candidatos = await candidatosMatricula(pessoas);
  const alunos = pessoas.filter((p) => p.fase === "aluno").map(paraAluno);
  const planoById = new Map(planos.map((p) => [p.id, p]));

  // Matrículas já pendentes (dados semente) para a lista "Aguardando pagamento".
  const matriculadosIniciais = alunos
    .filter((a) => a.status === "pendente")
    .map((a) => {
      const cobranca = cobrancas.find((c) => c.alunoId === a.id);
      const plano = planoById.get(a.planoId);
      const link = cobranca?.linkPagamento || undefined;
      return {
        id: `seed-${a.id}`,
        personId: a.id,
        codigo: a.codigo,
        nome: a.nome,
        planoNome: plano?.nome ?? "—",
        valor: cobranca?.valor ?? plano?.valorMensal ?? 0,
        linkPagamento: link,
        // Sem link de cobrança não há o que mandar: nada de WhatsApp com link vazio.
        waLink: link && a.telefone ? linkPagamentoWhatsApp(a.telefone, a.nome, link) : undefined,
        email: a.email || undefined,
      };
    });

  return (
    <>
      <Reveal>
        <MatriculadosTabs />
      </Reveal>

      <Reveal>
        <PageHeader title="Matrículas e renovações" />
      </Reveal>

      <Reveal delay={0.05}>
        <MatriculaFlow
          planos={planos.filter((p) => p.ativo !== false)}
          candidatosIniciais={candidatos}
          matriculadosIniciais={matriculadosIniciais}
          preSelecionadoId={preSelecionadoId}
        />
      </Reveal>
    </>
  );
}
