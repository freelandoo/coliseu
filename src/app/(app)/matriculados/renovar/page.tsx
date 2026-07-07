import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { MatriculadosTabs } from "@/components/matriculados/MatriculadosTabs";
import { MatriculaFlow } from "@/components/matricula/MatriculaFlow";
import { linkPagamentoWhatsApp } from "@/lib/asaas";
import {
  candidatosMatricula,
  listarAlunos,
  listarCobrancas,
  listarPlanos,
  proximoCodigoCadastro,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RenovarPage() {
  const [candidatos, alunos, cobrancas, planos, proximoCodigo] = await Promise.all([
    candidatosMatricula(),
    listarAlunos(),
    listarCobrancas(),
    listarPlanos(),
    proximoCodigoCadastro(),
  ]);
  const planoById = new Map(planos.map((p) => [p.id, p]));

  // Matrículas já pendentes (dados semente) para a lista "Aguardando pagamento".
  const matriculadosIniciais = alunos
    .filter((a) => a.status === "pendente")
    .map((a) => {
      const cobranca = cobrancas.find(
        (c) => c.alunoId === a.id && c.status === "pendente",
      );
      const plano = planoById.get(a.planoId);
      const link = cobranca?.linkPagamento ?? "";
      return {
        id: `seed-${a.id}`,
        personId: a.id,
        codigo: a.codigo,
        nome: a.nome,
        planoNome: plano?.nome ?? "—",
        valor: cobranca?.valor ?? plano?.valorMensal ?? 0,
        waLink: linkPagamentoWhatsApp(a.telefone, a.nome, link),
        email: a.email,
        sincronizadoAsaas: Boolean(cobranca?.asaasId),
        faltando: [] as ("email" | "whatsapp" | "dataNascimento" | "endereco")[],
      };
    });

  return (
    <>
      <Reveal>
        <MatriculadosTabs />
      </Reveal>

      <Reveal>
        <PageHeader
          title="Renovar e Matricular"
          subtitle="Leads novos e matriculados para renovação. Busque a pessoa → confirme o cadastro → escolha o plano → matricule. O sistema gera o código, a cobrança e o link de pagamento no WhatsApp."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <MatriculaFlow
          planos={planos.filter((p) => p.ativo !== false)}
          candidatosIniciais={candidatos}
          matriculadosIniciais={matriculadosIniciais}
          proximoCodigoInicial={proximoCodigo}
        />
      </Reveal>
    </>
  );
}
