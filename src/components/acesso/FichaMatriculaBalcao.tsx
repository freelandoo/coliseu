"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, TituloModal, DescricaoModal } from "@/components/ui/Modal";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import { CamposCadastro } from "@/components/clientes/CamposCadastro";
import { CheckoutBalcao } from "@/components/matricula/CheckoutBalcao";
import { ResultadoMatricula } from "@/components/matricula/ResultadoMatricula";
import {
  FORM_VAZIO,
  alteracoesCadastro,
  formDaPessoa,
  novaPessoaDoForm,
  validarCadastro,
  type CampoCadastro,
  type ErrosCadastro,
  type FormCadastro,
} from "@/lib/cadastro";
import { criarPessoa, executarMatricula, type MatriculaRegistrada } from "@/lib/matricula-cliente";
import { assinarAvisosCatraca } from "@/lib/access/avisos-cliente";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { Pessoa, Plano } from "@/lib/types";

/** Por que a ficha abriu: rosto desconhecido ou aluno conhecido sem matrícula ativa. */
export type MotivoFicha =
  | { tipo: "nao-identificado"; deviceId: string; quando: string }
  | { tipo: "sem-matricula"; deviceId: string; quando: string; personId: string; nome: string };

type Foto =
  | { tipo: "vazia" }
  | { tipo: "pedindo" }
  | { tipo: "aguardando" }
  | { tipo: "capturada"; src: string }
  | { tipo: "falhou"; erro: string };

type Operacao =
  | { tipo: "editando" }
  | { tipo: "registrando" }
  | { tipo: "falhou"; erro: string }
  | { tipo: "desconhecido" };

type PlanoPopular = Plano & { alunosAtivos: number };

/** Captura que não volta nesse tempo (agente fora, ninguém na frente do leitor) vira erro. */
const ESPERA_FOTO_MS = 100_000;

/**
 * Hora da tentativa para a recepção. O aviso chega em segundos, então a hora do
 * navegador basta — o `quando` do evento vem no relógio do aparelho (outro
 * fuso e ~9 min atrasado) e mostrá-lo confundiria.
 */
function horaDaTentativa(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function srcDaFoto(imagem?: string): string | null {
  if (!imagem) return null;
  return imagem.startsWith("data:") ? imagem : `data:image/jpeg;base64,${imagem}`;
}

/**
 * Ficha de matrícula que abre sozinha quando alguém tenta entrar e não é
 * reconhecido (ou é reconhecido sem matrícula ativa). Tudo acontece aqui:
 * cadastro, foto capturada pelo próprio leitor, plano e cobrança.
 *
 * A foto só passa pela tela — o Coliseu não a grava (segue para a conta do
 * aluno na Freelandoo, como no cadastro de face da ficha).
 */
export function FichaMatriculaBalcao({ motivo, onFechar }: { motivo: MotivoFicha; onFechar: () => void }) {
  const router = useRouter();
  const renovar = motivo.tipo === "sem-matricula";
  const consentId = useId();

  // a hora em que a ficha abriu, fixa (não muda a cada nova renderização)
  const [hora] = useState(horaDaTentativa);
  const [planos, setPlanos] = useState<PlanoPopular[] | null>(null);
  const [planoId, setPlanoId] = useState("");
  const [carregandoFicha, setCarregandoFicha] = useState(renovar);
  const [erroCarga, setErroCarga] = useState("");

  const [base, setBase] = useState<FormCadastro>(FORM_VAZIO);
  const [form, setForm] = useState<FormCadastro>(FORM_VAZIO);
  const [erros, setErros] = useState<ErrosCadastro>({});
  const [consentiu, setConsentiu] = useState(false);

  /** Pessoa já existente (renovação) ou criada por esta ficha ao capturar a foto. */
  const [personId, setPersonId] = useState<string | null>(renovar ? motivo.personId : null);
  const personIdRef = useRef(personId);
  useEffect(() => {
    personIdRef.current = personId;
  }, [personId]);

  const [foto, setFoto] = useState<Foto>({ tipo: "vazia" });

  const [op, setOp] = useState<Operacao>({ tipo: "editando" });
  const [resultado, setResultado] = useState<{ dados: MatriculaRegistrada; plano: Plano; personId: string } | null>(null);
  const [checkout, setCheckout] = useState(false);
  const emVoo = useRef(false);

  // Planos ativos (e a ficha, na renovação).
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        // já vem do mais escolhido para o menos: o primeiro é o padrão
        const r = await fetch("/api/planos/populares", { cache: "no-store" });
        const lista = (await r.json()) as PlanoPopular[];
        if (!ativo) return;
        setPlanos(lista);
        setPlanoId((atual) => atual || lista[0]?.id || "");
      } catch {
        if (ativo) setPlanos([]);
      }
    })();
    if (motivo.tipo === "sem-matricula") {
      (async () => {
        try {
          const r = await fetch(`/api/pessoas/${encodeURIComponent(motivo.personId)}`, { cache: "no-store" });
          const p = (await r.json()) as Pessoa;
          if (!ativo) return;
          if (!r.ok || !p?.id) throw new Error();
          const f = formDaPessoa(p);
          setBase(f);
          setForm(f);
        } catch {
          if (ativo) setErroCarga("Não foi possível carregar a ficha desta pessoa.");
        } finally {
          if (ativo) setCarregandoFicha(false);
        }
      })();
    }
    return () => {
      ativo = false;
    };
  }, [motivo]);

  // A foto volta pelo mesmo canal dos avisos, quando o leitor termina a captura.
  useEffect(
    () =>
      assinarAvisosCatraca((a) => {
        if (a.tipo !== "face" || a.personId !== personIdRef.current) return;
        const src = srcDaFoto(a.imagem);
        const nova: Foto = !a.ok
          ? { tipo: "falhou", erro: `A captura não terminou${a.erro ? ` (${a.erro})` : ""}. Peça para olhar para o leitor e tente de novo.` }
          : src
            ? { tipo: "capturada", src }
            : { tipo: "falhou", erro: "O leitor cadastrou a face, mas não devolveu a foto." };
        // só quem está esperando a captura muda (aviso atrasado não apaga uma foto já mostrada)
        setFoto((atual) => (atual.tipo === "aguardando" ? nova : atual));
      }),
    [],
  );

  // Captura sem resposta não fica "aguardando" para sempre.
  useEffect(() => {
    if (foto.tipo !== "aguardando") return;
    const t = setTimeout(() => {
      setFoto((atual) =>
        atual.tipo === "aguardando"
          ? { tipo: "falhou", erro: "O leitor não respondeu. Confira se o agente está online e tente de novo." }
          : atual,
      );
    }, ESPERA_FOTO_MS);
    return () => clearTimeout(t);
  }, [foto.tipo]);

  function setCampo(campo: CampoCadastro, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  }

  const ocupado = foto.tipo === "pedindo" || op.tipo === "registrando";

  async function capturar() {
    if (ocupado || foto.tipo === "aguardando") return;
    // Para o leitor gravar a face, a pessoa precisa existir: nome e contato bastam.
    const e = validarCadastro(form, { exigeCpf: false });
    const minimos: ErrosCadastro = { nome: e.nome, telefone: e.telefone, email: e.email };
    if (minimos.nome || minimos.telefone || minimos.email) {
      setErros((atual) => ({ ...atual, ...minimos }));
      setFoto({ tipo: "falhou", erro: "Preencha nome e telefone (ou e-mail) para capturar a foto." });
      return;
    }
    if (!consentiu) {
      setFoto({ tipo: "falhou", erro: "Marque a autorização de uso da imagem antes de capturar." });
      return;
    }
    setFoto({ tipo: "pedindo" });

    let id = personIdRef.current;
    if (!id) {
      const r = await criarPessoa(novaPessoaDoForm({ ...form, origem: "balcao" }));
      if (r.tipo !== "ok") {
        setFoto({ tipo: "falhou", erro: r.tipo === "falha" ? r.erro : "Sem confirmação do servidor ao salvar o cadastro." });
        return;
      }
      id = r.dados.id;
      setPersonId(id);
      personIdRef.current = id;
      setBase(form); // o que já foi salvo; a matrícula grava só o que mudar depois
    }

    try {
      const r = await fetch("/api/acesso/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: id, deviceId: motivo.deviceId, permitirLead: true }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { erro?: string } | null;
        setFoto({ tipo: "falhou", erro: d?.erro ?? "Não foi possível pedir a captura ao leitor." });
        return;
      }
      setFoto({ tipo: "aguardando" });
    } catch {
      setFoto({ tipo: "falhou", erro: "Sem conexão para pedir a captura." });
    }
  }

  async function matricular() {
    if (emVoo.current || ocupado) return;
    const plano = planos?.find((p) => p.id === planoId);
    const e = validarCadastro(form, { exigeCpf: true });
    setErros(e);
    if (Object.keys(e).length) return;
    if (!plano) {
      setOp({ tipo: "falhou", erro: "Escolha um plano." });
      return;
    }
    emVoo.current = true;
    setOp({ tipo: "registrando" });
    const d = await executarMatricula({
      pessoaId: renovar ? motivo.personId : undefined,
      idConfirmado: renovar ? null : personIdRef.current,
      nova: novaPessoaDoForm({ ...form, origem: "balcao" }),
      alteracoes: alteracoesCadastro(base, form),
      planoId: plano.id,
    });
    emVoo.current = false;
    if (d.tipo === "registrada") {
      setResultado({ dados: d.dados, plano, personId: d.personId });
      setOp({ tipo: "editando" });
      router.refresh();
      return;
    }
    if (d.tipo === "falha-matricula") {
      setPersonId(d.personId);
      setOp({ tipo: "falhou", erro: d.erro });
      return;
    }
    if (d.tipo === "falha-cadastro") {
      setOp({ tipo: "falhou", erro: d.erro });
      return;
    }
    setOp({ tipo: "desconhecido" });
  }

  if (resultado) {
    return (
      <>
        <Modal onFechar={onFechar} className="max-w-md">
          <TituloModal className="sr-only">Matrícula registrada</TituloModal>
          <ResultadoMatricula
            titulo={renovar ? "Renovação registrada" : "Matrícula registrada"}
            nome={form.nome.trim()}
            planoNome={resultado.plano.nome}
            valor={resultado.plano.valorMensal}
            linkPagamento={resultado.dados.linkPagamento}
            waLink={resultado.dados.waLink}
            email={form.email.trim() || undefined}
            onBalcao={() => setCheckout(true)}
            onConcluir={onFechar}
          />
        </Modal>
        {checkout && (
          <CheckoutBalcao
            personId={resultado.personId}
            nome={form.nome.trim()}
            planoNome={resultado.plano.nome}
            valor={resultado.plano.valorMensal}
            onPago={() => {
              setCheckout(false);
              router.refresh();
              onFechar();
            }}
            onFechar={() => setCheckout(false)}
          />
        )}
      </>
    );
  }

  const fichaPronta = !carregandoFicha && !erroCarga;
  const plano = planos?.find((p) => p.id === planoId);
  const registrando = op.tipo === "registrando";

  return (
    // Largo e da altura da tela: cabeçalho e botões sempre à vista, só o meio rola.
    // `!` no fim: o Modal base traz max-w-md e padding próprios, e o cn só concatena.
    <Modal
      onFechar={onFechar}
      fecharComEsc={!ocupado}
      className="flex max-h-[calc(100dvh-2rem)] max-w-[min(72rem,100%)]! flex-col overflow-hidden p-0!"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-ink px-5 py-3 text-white sm:px-7">
        <span className="font-display text-lg font-semibold tracking-[0.32em]">COLISEU</span>
        <span className="text-xs uppercase tracking-[0.18em] text-white/70">
          Ficha de {renovar ? "renovação" : "matrícula"} · {new Date().toLocaleDateString("pt-BR")}
        </span>
      </header>
      <div className="h-1 shrink-0 bg-brand" aria-hidden />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-5 pt-4 sm:px-7">
          <TituloModal className="font-display text-2xl">
            {renovar ? `${motivo.nome} sem matrícula ativa` : "Alguém quer entrar"}
          </TituloModal>
          <DescricaoModal>
            {renovar
              ? `Reconhecido no leitor às ${hora}, mas sem matrícula ativa. Renove aqui mesmo.`
              : `Um rosto não reconhecido tentou passar às ${hora}. Matricule agora, com foto.`}
          </DescricaoModal>
        </div>

        <div className="grid gap-6 px-5 py-5 sm:px-7 md:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[180px_minmax(0,1fr)_260px]">
          {/* Foto 3x4 — capturada pelo próprio leitor da catraca */}
          <div className="flex flex-col gap-3">
            <MolduraFoto foto={foto} nome={form.nome} />
            <Botao
              variante={foto.tipo === "capturada" ? "secundario" : "contorno"}
              onClick={() => void capturar()}
              carregando={foto.tipo === "pedindo"}
              disabled={!fichaPronta || foto.tipo === "aguardando" || registrando}
              bloco
            >
              {foto.tipo === "capturada" ? "Capturar de novo" : foto.tipo === "aguardando" ? "Olhando para o leitor…" : "Capturar foto"}
            </Botao>
            <p className="text-xs text-muted" aria-live="polite">
              {foto.tipo === "aguardando"
                ? "Peça para a pessoa ficar de frente para o leitor. Ele conta 3 segundos e tira a foto."
                : foto.tipo === "falhou"
                  ? foto.erro
                  : foto.tipo === "capturada"
                    ? "Face cadastrada no leitor. A catraca libera quando o pagamento for confirmado."
                    : "A foto é tirada pelo leitor da catraca e já cadastra a face."}
            </p>
            <label htmlFor={consentId} className="flex items-start gap-2 text-xs text-muted">
              <input
                id={consentId}
                type="checkbox"
                checked={consentiu}
                onChange={(e) => setConsentiu(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
              />
              <span>A pessoa autoriza o uso da imagem do rosto para o acesso à academia (LGPD).</span>
            </label>
          </div>

          {/* Cadastro */}
          <div className="min-w-0">
            {carregandoFicha && <p className="text-sm text-muted">Carregando a ficha de {motivo.tipo === "sem-matricula" ? motivo.nome : ""}…</p>}
            {erroCarga && <MensagemErro>{erroCarga}</MensagemErro>}
            {fichaPronta && (
              <CamposCadastro
                form={form}
                setCampo={setCampo}
                erros={erros}
                exigeCpf
                mostrarOrigem={false}
                desabilitado={registrando}
                conferirCpf={{ ignorarId: personId }}
              />
            )}
          </div>

          {/* Plano e resumo — ao lado no desktop, embaixo nas telas menores */}
          <div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">Plano *</span>
              <select
                value={planoId}
                onChange={(e) => setPlanoId(e.target.value)}
                disabled={!planos?.length || registrando}
                className={classeCampo}
              >
                {planos === null && <option value="">Carregando planos…</option>}
                {planos?.length === 0 && <option value="">Nenhum plano ativo</option>}
                {planos?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {formatBRL(p.valorMensal)}/mês
                  </option>
                ))}
              </select>
              <span className="text-xs text-faint">Os mais escolhidos pelos alunos aparecem primeiro.</span>
            </label>

            {plano && (
              <dl className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-4 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Mensalidade</dt>
                  <dd className="font-display text-xl font-semibold tabular-nums text-ink">{formatBRL(plano.valorMensal)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Vigência</dt>
                  <dd className="text-ink">{plano.duracaoDias} dias</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted">Alunos neste plano</dt>
                  <dd className="tabular-nums text-ink">{plano.alunosAtivos}</dd>
                </div>
              </dl>
            )}
            {planos?.length === 0 && (
              <p className="text-xs text-muted">Um administrador precisa cadastrar um plano em Cobrança → Planos.</p>
            )}

            {op.tipo === "falhou" && <MensagemErro>A matrícula não foi registrada: {op.erro}</MensagemErro>}
            {op.tipo === "desconhecido" && (
              <MensagemErro>
                Sem confirmação do servidor. A matrícula e a cobrança podem ter sido criadas — confira em Matrículas antes
                de tentar de novo.
              </MensagemErro>
            )}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2 px-5 py-3 sm:px-7">
        <p className="text-xs text-muted">Ao matricular: registra a matrícula e gera a cobrança (link, WhatsApp ou balcão).</p>
        <div className="flex gap-2">
          <Botao variante="discreto" onClick={onFechar} disabled={ocupado}>
            Agora não
          </Botao>
          <Botao
            variante="primario"
            tamanho="lg"
            onClick={() => void matricular()}
            carregando={registrando}
            disabled={!fichaPronta || !planos?.length || op.tipo === "desconhecido" || foto.tipo === "pedindo"}
          >
            {registrando ? "Registrando…" : renovar ? "Renovar matrícula" : "Matricular"}
          </Botao>
        </div>
      </footer>
    </Modal>
  );
}

/** Moldura 3x4 da ficha: vazia, esperando o leitor, ou com a foto capturada. */
function MolduraFoto({ foto, nome }: { foto: Foto; nome: string }) {
  const iniciais = nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const aguardando = foto.tipo === "aguardando" || foto.tipo === "pedindo";
  return (
    <div
      className={cn(
        "relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2 bg-surface-2",
        foto.tipo === "capturada" ? "border-brand" : "border-dashed border-border-strong",
        aguardando && "border-brand motion-safe:animate-pulse",
      )}
    >
      {foto.tipo === "capturada" ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL da captura, sem otimização possível
        <img
          src={foto.src}
          alt={`Foto de ${nome.trim() || "quem está sendo matriculado"}`}
          className="h-full w-full object-cover motion-safe:animate-[foto-entra_260ms_var(--ease-padrao)]"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-faint">
          {iniciais ? (
            <span className="font-display text-4xl font-semibold text-muted">{iniciais}</span>
          ) : (
            <svg aria-hidden viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8.5" r="3.75" />
              <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" strokeLinecap="round" />
            </svg>
          )}
          <span className="text-xs">{aguardando ? "Aguardando o leitor…" : "Sem foto"}</span>
        </div>
      )}
    </div>
  );
}
