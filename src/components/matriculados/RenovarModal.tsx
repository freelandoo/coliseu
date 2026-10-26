"use client";

import { useRef, useState } from "react";
import { formatBRL, formatData } from "@/lib/mock-data";
import { DescricaoModal, Modal, TituloModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { Campo, MensagemErro, classeCampo } from "@/components/ui/Campo";
import { CheckoutBalcao, type MetodoBalcao } from "@/components/matricula/CheckoutBalcao";
import { ResultadoMatricula } from "@/components/matricula/ResultadoMatricula";
import { executarMatricula, type MatriculaRegistrada } from "@/lib/matricula-cliente";
import type { Pessoa, Plano } from "@/lib/types";

const METODO_LABEL: Record<MetodoBalcao, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão débito",
  credito: "Cartão crédito",
};

type CampoOpcional = "email" | "whatsapp" | "dataNascimento" | "endereco";

const LABEL_OPCIONAL: Record<CampoOpcional, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  dataNascimento: "Data de nascimento",
  endereco: "Endereço",
};

function camposFaltando(p: Pessoa): CampoOpcional[] {
  const faltando: CampoOpcional[] = [];
  if (!p.email?.trim()) faltando.push("email");
  if ((p.telefone ?? "").replace(/\D/g, "").length < 10) faltando.push("whatsapp");
  if (!p.dataNascimento) faltando.push("dataNascimento");
  const e = p.endereco;
  const enderecoCompleto =
    e?.cep?.trim() && e?.estado?.trim() && e?.cidade?.trim() && e?.rua?.trim() && e?.numero?.trim();
  if (!enderecoCompleto) faltando.push("endereco");
  return faltando;
}

type Fase =
  | { tipo: "revisao"; erro?: string }
  | { tipo: "processando" }
  | { tipo: "registrada"; dados: MatriculaRegistrada }
  | { tipo: "desconhecido" }
  | { tipo: "balcao"; dados: MatriculaRegistrada }
  | { tipo: "pago"; metodo: MetodoBalcao };

/**
 * Renovação do plano atual — ou, com `planos`, troca para outro plano.
 *
 * Abrir este diálogo não muda nada: primeiro vem a revisão (aluno, plano,
 * valor, situação). Só "Confirmar renovação" registra a renovação pelo mesmo
 * caminho da matrícula (nova assinatura no Asaas, cobrança pendente, as
 * assinaturas anteriores canceladas). O que vem depois é o que o servidor
 * confirmou — a renovação nasce com pagamento pendente.
 *
 * A troca de plano é o mesmo caminho com outro `planoId`: matrícula nova no
 * plano escolhido, cobrança dele, assinaturas anteriores canceladas — e a tela
 * segue direto para o pagamento.
 */
export function RenovarModal({
  pessoa,
  plano: planoAtual,
  planos,
  onFechar,
}: {
  pessoa: Pessoa;
  plano: Plano;
  /** Presente = troca de plano: os planos que podem ser escolhidos. */
  planos?: Plano[];
  onFechar: () => void;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "revisao" });
  const emVoo = useRef(false);
  const faltando = camposFaltando(pessoa);
  const alterando = !!planos;
  const opcoes = (planos ?? []).filter((p) => p.id !== planoAtual.id);
  const [planoNovoId, setPlanoNovoId] = useState("");
  const plano = alterando ? opcoes.find((p) => p.id === planoNovoId) : planoAtual;
  const acao = alterando ? "alteração de plano" : "renovação";

  async function confirmar() {
    if (emVoo.current || !plano) return;
    emVoo.current = true;
    setFase({ tipo: "processando" });
    const d = await executarMatricula({ pessoaId: pessoa.id, alteracoes: {}, planoId: plano.id });
    emVoo.current = false;
    if (d.tipo === "registrada") setFase({ tipo: "registrada", dados: d.dados });
    else if (d.tipo === "falha-matricula" || d.tipo === "falha-cadastro") {
      setFase({ tipo: "revisao", erro: `A ${acao} não foi registrada: ${d.erro}` });
    } else setFase({ tipo: "desconhecido" });
  }

  if (fase.tipo === "balcao" && plano) {
    return (
      <CheckoutBalcao
        personId={pessoa.id}
        nome={pessoa.nome}
        planoNome={plano.nome}
        valor={plano.valorMensal}
        onPago={(metodo) => setFase({ tipo: "pago", metodo })}
        onFechar={() => setFase({ tipo: "registrada", dados: fase.dados })}
      />
    );
  }

  const processando = fase.tipo === "processando";

  return (
    // Clique no fundo não fecha; Esc só fora do processamento.
    <Modal onFechar={onFechar} fecharComEsc={!processando} className="max-w-lg">
      {(fase.tipo === "revisao" || fase.tipo === "processando") && (
        <>
          <TituloModal>{alterando ? "Alterar plano" : "Renovar matrícula"}</TituloModal>
          <DescricaoModal className="mt-0.5">Revise antes de confirmar. Nada é cobrado até lá.</DescricaoModal>

          {alterando && (
            <Campo rotulo="Novo plano" className="mt-5">
              {(a) => (
                <select
                  {...a}
                  value={planoNovoId}
                  onChange={(e) => setPlanoNovoId(e.target.value)}
                  disabled={processando}
                  className={classeCampo}
                >
                  <option value="">Escolha o plano…</option>
                  {opcoes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} · {formatBRL(p.valorMensal)}/mês
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          )}

          <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-2 p-4 text-sm sm:grid-cols-2">
            <Linha rotulo="Aluno" valor={`${pessoa.nome} · ${pessoa.codigo}`} />
            {alterando ? (
              <>
                <Linha rotulo="Plano atual" valor={`${planoAtual.nome} · ${formatBRL(planoAtual.valorMensal)}/mês`} />
                <Linha rotulo="Novo plano" valor={plano?.nome ?? "—"} />
              </>
            ) : (
              <Linha rotulo="Plano" valor={planoAtual.nome} />
            )}
            <Linha rotulo="Valor" valor={plano ? `${formatBRL(plano.valorMensal)}/mês` : "—"} />
            <Linha rotulo="Vigência" valor={plano ? `${plano.duracaoDias} dias a partir da confirmação` : "—"} />
            <Linha
              rotulo="Vencimento atual"
              valor={pessoa.vencimentoPlano ? formatData(pessoa.vencimentoPlano) : "—"}
            />
            <Linha
              rotulo="Situação ao confirmar"
              valor={`${alterando ? "Plano alterado" : "Renovação registrada"} · pagamento pendente`}
            />
          </dl>
          {!alterando && planoAtual.ativo === false && (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-ink">
              Este plano está arquivado (não é oferecido em matrículas novas). A renovação mantém o plano atual do aluno.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Ao confirmar, uma nova cobrança é gerada pelo caminho de sempre (Asaas) e as assinaturas anteriores deste
            aluno são canceladas para não cobrar em dobro.
            {alterando && " Até o pagamento do novo plano, a catraca trata o aluno como matrícula aguardando pagamento."}
          </p>
          {faltando.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Cadastro incompleto (não impede a {acao}): {faltando.map((c) => LABEL_OPCIONAL[c]).join(", ")}.
            </p>
          )}

          {fase.tipo === "revisao" && fase.erro && <MensagemErro className="mt-4">{fase.erro}</MensagemErro>}
          {processando && (
            <p role="status" className="mt-4 text-sm text-muted">
              Registrando a {acao} e gerando a cobrança…
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <Botao
              variante="primario"
              tamanho="lg"
              onClick={() => void confirmar()}
              carregando={processando}
              disabled={!plano}
              className="flex-1"
            >
              {processando ? "Registrando…" : alterando ? "Alterar e ir para pagamento" : "Confirmar renovação"}
            </Botao>
            <Botao tamanho="lg" onClick={onFechar} disabled={processando}>
              Cancelar
            </Botao>
          </div>
        </>
      )}

      {fase.tipo === "desconhecido" && (
        <>
          <TituloModal>{alterando ? "Alteração sem confirmação" : "Renovação sem confirmação"}</TituloModal>
          <MensagemErro className="mt-3">
            O servidor não confirmou. A {acao} e a cobrança podem ter sido criadas — confira a ficha e os pagamentos
            deste aluno antes de tentar de novo.
          </MensagemErro>
          <Botao bloco onClick={onFechar} className="mt-5">
            Fechar
          </Botao>
        </>
      )}

      {fase.tipo === "registrada" && plano && (
        <>
          <TituloModal className="sr-only">{alterando ? "Plano alterado" : "Renovação registrada"}</TituloModal>
          <ResultadoMatricula
            titulo={alterando ? "Plano alterado" : "Renovação registrada"}
            nome={pessoa.nome}
            planoNome={plano.nome}
            valor={plano.valorMensal}
            linkPagamento={fase.dados.linkPagamento}
            waLink={fase.dados.waLink}
            email={pessoa.email}
            onBalcao={() => setFase({ tipo: "balcao", dados: fase.dados })}
            onConcluir={onFechar}
          />
        </>
      )}

      {fase.tipo === "pago" && plano && (
        <div className="text-center">
          <span aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-2xl text-success">
            ✓
          </span>
          <TituloModal className="mt-4">Pagamento registrado no balcão</TituloModal>
          <p className="mt-1 text-sm text-muted">
            {pessoa.nome} · {METODO_LABEL[fase.metodo]} · {formatBRL(plano.valorMensal)}
          </p>
          <p className="mt-2 text-xs text-muted">
            O pagamento entra pelo mesmo processamento do Asaas, que ativa a matrícula. A liberação na catraca segue o
            controle de acesso — confira na ficha.
          </p>
          <Botao variante="primario" bloco onClick={onFechar} className="mt-5">
            Concluir
          </Botao>
        </div>
      )}
    </Modal>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{rotulo}</dt>
      <dd className="mt-0.5 font-medium text-ink tabular-nums">{valor}</dd>
    </div>
  );
}
