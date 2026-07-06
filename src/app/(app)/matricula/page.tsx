import { Reveal } from "@/components/ui/Reveal";
import { PageHeader } from "@/components/ui/primitives";
import { MatriculaFlow } from "@/components/matricula/MatriculaFlow";
import { linkPagamentoWhatsApp } from "@/lib/asaas";
import {
  candidatosMatricula,
  listarAlunos,
  listarCobrancas,
  listarPlanos,
  planoPorId,
  proximoCodigoCadastro,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default function MatriculaPage() {
  const candidatos = candidatosMatricula();
  const alunos = listarAlunos();
  const cobrancas = listarCobrancas();

  // Matrículas já pendentes (dados semente) para a lista "Aguardando pagamento".
  const matriculadosIniciais = alunos
    .filter((a) => a.status === "pendente")
    .map((a) => {
      const cobranca = cobrancas.find(
        (c) => c.alunoId === a.id && c.status === "pendente",
      );
      const plano = planoPorId(a.planoId);
      const link = cobranca?.linkPagamento ?? "";
      return {
        id: `seed-${a.id}`,
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
        <PageHeader
          step={2}
          title="Matrícula e Pagamento"
          subtitle="Busque a pessoa → confirme o cadastro → escolha o plano → matricule. O sistema gera o código, a cobrança e o link de pagamento no WhatsApp."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <MatriculaFlow
          planos={listarPlanos().filter((p) => p.ativo !== false)}
          candidatosIniciais={candidatos}
          matriculadosIniciais={matriculadosIniciais}
          proximoCodigoInicial={proximoCodigoCadastro()}
        />
      </Reveal>
    </>
  );
}
