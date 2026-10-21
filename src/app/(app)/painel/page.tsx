import Link from "next/link";
import { cache, Suspense, type CSSProperties, type ReactNode } from "react";
import { requireModulo } from "@/lib/auth/rbac";
import { hojeNaAcademia, FUSO_ACADEMIA } from "@/lib/aula-experimental";
import {
  CONVERSAS_NA_CENTRAL,
  dataPorExtenso,
  faixaDeDias,
  mesEAno,
  primeiroNome,
  saudacao,
} from "@/lib/central";
import { formatBRL } from "@/lib/mock-data";
import { cn } from "@/lib/cn";
import { listarAulasExperimentaisEntreRepo } from "@/lib/repositories/aulas-experimentais";
import { cobrancasEmAbertoRepo } from "@/lib/repositories/cobrancas";
import { contarAlunosAtivosRepo } from "@/lib/repositories/pessoas";
import { conversasComNaoLidasRepo, paginaConversasRepo, totaisNaoLidasRepo } from "@/lib/repositories/whatsapp";
import { statusTokenFreelandoo } from "@/lib/freelandoo/token";
import { FreelandooTokenCard } from "@/components/painel/FreelandooTokenCard";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";
import { situacaoChaveFreelandoo } from "@/lib/freelandoo/situacao";
import { CentralAgenda } from "@/components/painel/CentralAgenda";
import { CentralAtendimento } from "@/components/painel/CentralAtendimento";
import { CarimboData } from "@/components/painel/CarimboData";
import { Coliseu3D } from "@/components/coliseu3d/Coliseu3D";
import { Contador } from "@/components/ui/Contador";
import {
  IconeCalendario,
  IconeCobranca,
  IconeConversa,
  IconeMatricula,
  IconePessoas,
  IconeSeta,
  PainelCarregando,
} from "@/components/painel/central-ui";

export const dynamic = "force-dynamic";

/**
 * Falha de uma consulta vira `null` — "indisponível", que a tela diz como tal
 * (nunca zero). Cada bloco cai sozinho: conversa fora do ar não apaga a agenda.
 */
async function tentar<T>(rotulo: string, consulta: () => Promise<T>): Promise<T | null> {
  try {
    return await consulta();
  } catch (e) {
    console.error(`[central] ${rotulo} indisponível:`, e);
    return null;
  }
}

// Faixa e blocos pedem os mesmos totais: uma consulta por requisição.
const totaisNaoLidas = cache(() => tentar("não lidas", totaisNaoLidasRepo));
const emAberto = cache(() => tentar("cobranças em aberto", cobrancasEmAbertoRepo));

const atraso = (ms: number) => ({ "--atraso": `${ms}ms` }) as CSSProperties;

/** "R$ 3.240,00" → número grande (contando) com "R$" e centavos menores. */
function ValorBRL({ valor, atraso }: { valor: number; atraso?: number }) {
  const texto = formatBRL(valor); // "R$ 3.240,00"
  const m = texto.match(/^(\D*?)\s*([\d.]+)(,\d+)$/);
  if (!m) return <>{texto}</>;
  return (
    <>
      <span className="mr-1 text-lg font-normal">{m[1]}</span>
      <Contador valor={Number(m[2].replace(/\./g, ""))} atraso={atraso} />
      <span className="text-lg font-normal">{m[3]}</span>
    </>
  );
}

function Indicador({
  icone,
  rotulo,
  href,
  valor,
  nota,
  className,
}: {
  icone: ReactNode;
  rotulo: string;
  href: string;
  /** `null` = indisponível */
  valor: ReactNode | null;
  nota: ReactNode;
  className?: string;
}) {
  // A divisória fica no invólucro: no próprio link (arredondado para o hover)
  // ela sairia curva nas pontas.
  return (
    <div className={cn("min-w-0 py-1.5", className)}>
      <Link
        href={href}
        className="levanta group mx-1.5 flex min-w-0 flex-col justify-center gap-1 rounded-xl px-3 py-3 hover:bg-surface-2 sm:px-4"
      >
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="text-brand">{icone}</span>
          {rotulo}
        </span>
        {valor === null ? (
          <span className="text-base font-semibold text-danger">Indisponível agora</span>
        ) : (
          <span className="font-display text-4xl font-medium leading-tight tracking-[-0.01em] text-ink tabular-nums">
            {valor}
          </span>
        )}
        <span className="text-xs text-muted">{nota}</span>
      </Link>
    </div>
  );
}

async function FaixaIndicadores({ agora }: { agora: string }) {
  const [ativos, naoLidas, abertas] = await Promise.all([
    tentar("alunos ativos", contarAlunosAtivosRepo),
    totaisNaoLidas(),
    emAberto(),
  ]);
  return (
    <section
      aria-label="Números de agora"
      style={atraso(80)}
      className="entrada relative z-[1] grid grid-cols-2 rounded-md border border-border bg-surface p-1 text-ink shadow-[var(--shadow-card)] md:grid-cols-[1fr_1fr_1.2fr] md:p-2"
    >
      <Indicador
        icone={<IconePessoas className="h-4 w-4" />}
        rotulo="Alunos ativos"
        href="/matriculados?situacao=ativo"
        valor={ativos === null ? null : <Contador valor={ativos} atraso={120} />}
        nota="Última matrícula de cada um está ativa"
        className="border-r border-border"
      />
      <Indicador
        icone={<IconeConversa className="h-4 w-4" />}
        rotulo="Mensagens não lidas"
        href="/atendimento"
        valor={naoLidas === null ? null : <Contador valor={naoLidas.mensagens} atraso={180} />}
        nota={
          naoLidas === null
            ? "WhatsApp"
            : naoLidas.conversas === 1
              ? "Em 1 conversa"
              : `Em ${naoLidas.conversas} conversas`
        }
        className="md:border-r md:border-border"
      />
      <Indicador
        icone={<IconeCobranca className="h-4 w-4" />}
        rotulo="Cobranças em aberto"
        href="/cobranca"
        valor={abertas === null ? null : <ValorBRL valor={abertas.valor} atraso={240} />}
        nota={
          abertas === null
            ? "Cobrança"
            : `${abertas.quantidade} pendentes ou atrasadas · posição às ${agora}`
        }
        className="col-span-2 border-t border-border md:col-span-1 md:border-t-0"
      />
    </section>
  );
}

function FaixaCarregando() {
  return (
    <section
      aria-label="Números de agora"
      aria-busy="true"
      className="relative z-[1] grid h-[132px] grid-cols-3 gap-6 rounded-md border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
    >
      <p className="sr-only">Carregando os números…</p>
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden className="flex flex-col gap-3">
          <span className="h-3 w-1/2 rounded bg-surface-2" />
          <span className="h-8 w-1/3 rounded bg-surface-2" />
        </span>
      ))}
    </section>
  );
}

async function BlocoAtendimento({ hoje }: { hoje: string }) {
  const [naoLidas, recentes, totais] = await Promise.all([
    tentar("conversas não lidas", () => conversasComNaoLidasRepo(CONVERSAS_NA_CENTRAL)),
    tentar("conversas recentes", async () => (await paginaConversasRepo({ limite: CONVERSAS_NA_CENTRAL })).conversas),
    totaisNaoLidas(),
  ]);
  return (
    <CentralAtendimento
      naoLidas={naoLidas}
      recentes={recentes}
      totalMensagens={totais?.mensagens ?? null}
      hoje={hoje}
      atraso={160}
    />
  );
}

async function BlocoAgenda({ hoje }: { hoje: string }) {
  const dias = faixaDeDias(hoje);
  const aulas = await tentar("agenda", () => listarAulasExperimentaisEntreRepo(hoje, dias[dias.length - 1].data));
  return <CentralAgenda aulas={aulas} dias={dias} hoje={hoje} atraso={230} />;
}

async function Fechamento() {
  const abertas = await emAberto();
  let titulo: string;
  let texto: string;
  if (abertas === null) {
    titulo = "Pendências financeiras indisponíveis agora";
    texto = "A tela de Cobrança mostra os registros.";
  } else if (abertas.atrasadas.quantidade > 0) {
    const n = abertas.atrasadas.quantidade;
    titulo = `${n} ${n === 1 ? "cobrança atrasada" : "cobranças atrasadas"} · ${formatBRL(abertas.atrasadas.valor)}`;
    texto = "Vencidas sem pagamento registrado. Confira os registros antes de cobrar.";
  } else if (abertas.quantidade > 0) {
    titulo = "Nenhuma cobrança atrasada";
    texto = `${abertas.quantidade} ${abertas.quantidade === 1 ? "cobrança a vencer" : "cobranças a vencer"}.`;
  } else {
    titulo = "Nenhuma cobrança em aberto";
    texto = "Sem pendentes nem atrasadas registradas.";
  }

  const atalho =
    "levanta flex min-h-14 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3 py-3 text-center text-sm font-medium text-ink hover:border-destaque/50 hover:bg-white/10";

  return (
    <div style={atraso(300)} className="entrada mt-4 grid gap-4 md:grid-cols-2">
      <Link
        href="/cobranca"
        className="levanta flex items-center justify-between gap-4 rounded-md border border-border-strong bg-painel px-5 py-4 hover:border-destaque/50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{titulo}</span>
          <span className="mt-1 block text-[13px] text-muted">{texto}</span>
        </span>
        <IconeCobranca className="text-destaque" />
      </Link>
      <nav aria-label="Atalhos" className="grid grid-cols-2 gap-3">
        <Link href="/matriculados/renovar" className={atalho}>
          <IconeMatricula className="text-destaque" />
          Matrículas e renovações
        </Link>
        <Link href="/matriculados" className={atalho}>
          <IconePessoas className="text-destaque" />
          Alunos e cadastro
        </Link>
      </nav>
    </div>
  );
}

async function Integracoes() {
  const [status, chave] = await Promise.all([
    tentar("token Freelandoo", statusTokenFreelandoo),
    tentar("chave de parceiro Freelandoo", () => situacaoChaveFreelandoo(freelandooConfigurado())),
  ]);
  return (
    <div className="flex flex-col gap-3 pt-3">
      <AvisoAcessoFreelandoo chave={chave} />
      {status === null ? (
        <p className="px-1 text-sm text-muted">Situação do token indisponível agora.</p>
      ) : (
        <FreelandooTokenCard inicial={status} />
      )}
    </div>
  );
}

/**
 * Contas do app de treinos (Coliseu → Freelandoo). A fila para inteira quando
 * a chave de parceiro é recusada — o aviso fica aqui até a próxima chamada
 * aceita.
 */
function AvisoAcessoFreelandoo({ chave }: { chave: Awaited<ReturnType<typeof situacaoChaveFreelandoo>> | null }) {
  if (chave === null) {
    return <p className="px-1 text-sm text-muted">Situação da chave de parceiro indisponível agora.</p>;
  }
  if (!chave.configurada) {
    return (
      <p className="px-1 text-sm text-muted">
        Contas do app de treinos: integração não configurada (FREELANDOO_API_URL e FREELANDOO_PARTNER_KEY).
      </p>
    );
  }
  if (chave.invalida) {
    return (
      <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-ink">
        <p className="font-semibold text-danger">Chave de parceiro da Freelandoo recusada</p>
        <p className="mt-1 text-muted">
          A fila de contas do app de treinos está parada
          {chave.desde ? ` desde ${new Date(chave.desde).toLocaleString("pt-BR", { timeZone: FUSO_ACADEMIA, dateStyle: "short", timeStyle: "short" })}` : ""}
          . Gere uma chave nova em /academias na Freelandoo e troque FREELANDOO_PARTNER_KEY no Railway; nada se perde, as
          tarefas esperam na fila.
        </p>
      </div>
    );
  }
  return <p className="px-1 text-sm text-muted">Contas do app de treinos: chave de parceiro aceita.</p>;
}

/**
 * Central do admin: a primeira tela depois do login (ver `rotaInicial`).
 * Mensagens, agenda e o que está em aberto, cada bloco com sua fonte real e
 * seu próprio estado de carregando / indisponível / vazio.
 *
 * Só ADMIN: `requireModulo("painel")` barra recepção e técnico antes de
 * qualquer consulta — nenhum número financeiro sai para outro papel.
 */
export default async function PainelPage() {
  const user = await requireModulo("painel");
  const agoraData = new Date();
  const hoje = hojeNaAcademia(agoraData);
  const agora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_ACADEMIA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(agoraData);
  const extenso = dataPorExtenso(hoje);
  const nome = primeiroNome(user.nome);

  return (
    <div className="pb-2">
      <section
        aria-labelledby="central-titulo"
        className="entrada grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-x-clip [overflow-clip-margin:24px] pb-6 pt-1 sm:gap-6 sm:pb-8 sm:pt-3"
      >
        <div className="paralaxe min-w-0 [--paralaxe:60px]">
          <p className="meta-mono mb-3 flex items-center gap-2.5 text-muted">
            <span aria-hidden className="h-4 w-1 bg-brand" />
            {extenso}
          </p>
          <h1
            id="central-titulo"
            className="text-[clamp(1.75rem,4.6vw,3rem)] font-medium leading-[1.08] tracking-[-0.035em] text-ink"
          >
            <span className="linha-revela" style={atraso(60)}>
              {saudacao(agoraData)}
              {nome ? `, ${nome}` : ""}.
            </span>
            <span className="linha-revela text-destaque" style={atraso(160)}>
              Este é o dia do Coliseu.
            </span>
          </h1>
          <p className="mt-3 max-w-[34em] text-sm text-muted">
            Conversas esperando resposta, aulas marcadas e cobranças em aberto.
          </p>
        </div>
        <div className="flex items-end gap-2 sm:gap-4">
          {/* a arena em holograma fica mais para trás que o carimbo na rolagem */}
          <div className="paralaxe relative hidden h-44 w-64 [--paralaxe:200px] md:block lg:h-52 lg:w-80">
            <Coliseu3D className="absolute inset-0" intensidade="destaque" />
          </div>
          <div className="paralaxe [--paralaxe:150px]">
            <CarimboData dia={String(Number(hoje.slice(8)))} mesAno={mesEAno(hoje)} />
          </div>
        </div>
      </section>

      <Suspense fallback={<FaixaCarregando />}>
        <FaixaIndicadores agora={agora} />
      </Suspense>

      <div style={atraso(130)} className="entrada mb-3 mt-7 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-ink">No balcão agora</h2>
        <span className="text-xs text-faint">Dados de quando a página abriu ({agora})</span>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Suspense
          fallback={<PainelCarregando icone={<IconeConversa />} titulo="Atendimento agora" id="central-atendimento" />}
        >
          <BlocoAtendimento hoje={hoje} />
        </Suspense>
        <Suspense
          fallback={<PainelCarregando icone={<IconeCalendario />} titulo="Aulas experimentais" id="central-agenda" />}
        >
          <BlocoAgenda hoje={hoje} />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <Fechamento />
      </Suspense>

      <details className="group mt-8 rounded-md border border-border px-4 py-3">
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-sm text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <span>Integração API (Freelandoo)</span>
          <IconeSeta className="transition-transform duration-200 group-open:rotate-90" />
        </summary>
        <Suspense fallback={<p className="pt-3 text-sm text-muted">Carregando…</p>}>
          <Integracoes />
        </Suspense>
      </details>
    </div>
  );
}
