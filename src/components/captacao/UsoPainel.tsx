import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { Bandeira } from "@/components/ui/Bandeira";
import { cn } from "@/lib/cn";
import {
  PERIODOS,
  PERIODO_LABEL,
  comoFalarDoInstante,
  formatarDuracao,
  type Periodo,
} from "@/lib/uso";
import { ORDEM_BANDEIRAS } from "@/lib/whatsapp/busca";
import { INTERESSE_ESTAGIO, INTERESSE_LABEL, type ConversaInteresse } from "@/lib/types";
import type { UsoAtendimento, UsoColaborador } from "@/lib/repositories/uso";

const PAPEL_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  RECEPCAO: "Recepção",
  TECNICO: "Técnico",
};

function hora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

/** No lugar da bolinha de online: o aparelho não fica online, ele só manda. */
function CelularIcone() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-faint"
    >
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

/* ---------- filtro de período ---------- */

function FiltroPeriodo({ atual }: { atual: Periodo }) {
  return (
    <nav
      aria-label="Período dos indicadores"
      className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
    >
      {PERIODOS.map((p) => (
        <Link
          key={p}
          href={p === "hoje" ? "/atendimento/uso" : `/atendimento/uso?periodo=${p}`}
          aria-current={p === atual ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
            p === atual ? "bg-red-ghost text-ink" : "text-faint hover:text-muted",
          )}
        >
          {PERIODO_LABEL[p]}
        </Link>
      ))}
    </nav>
  );
}

/* ---------- total do período ---------- */

function Total({ label, valor, hint }: { label: string; valor: number; hint?: string }) {
  return (
    <Card className="grid grid-cols-[1fr_auto] items-center gap-x-3 p-3.5 sm:block">
      <p className="col-start-1 row-start-1 text-[10px] font-medium uppercase tracking-widest text-faint">
        {label}
      </p>
      <p className="col-start-2 row-span-2 row-start-1 self-center text-right font-display text-2xl font-semibold leading-none tabular-nums text-ink sm:mt-1.5 sm:text-left">
        {valor}
      </p>
      {hint && (
        <p className="col-start-1 row-start-2 mt-0.5 text-[11px] text-muted sm:mt-1.5">{hint}</p>
      )}
    </Card>
  );
}

/* ---------- célula de número da linha do colaborador ---------- */

function Celula({
  label,
  valor,
  destaque = false,
  children,
}: {
  label: string;
  valor: string;
  /** O número que a linha existe para mostrar ganha a cor da casa. */
  destaque?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-widest text-faint">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-display text-lg font-semibold leading-none tabular-nums",
          destaque ? "text-red-bright" : "text-ink",
        )}
      >
        {valor}
      </p>
      {children}
    </div>
  );
}

/**
 * Quais bandeiras a pessoa levantou. Responde a pergunta que o número sozinho
 * deixa no ar: classificou quatro leads, sim — mas como o quê?
 *
 * Entra a bandeira branca ("lead novo") junto com as outras, ainda que ela
 * signifique desfazer uma classificação: são as cinco do funil, na ordem do
 * funil, e as bolinhas têm de fechar com o número ao lado — pilha que soma
 * menos que o total faria a tela parecer errada quando não está.
 */
function Classificacoes({ porInteresse }: { porInteresse: Record<ConversaInteresse, number> }) {
  const marcadas = ORDEM_BANDEIRAS.filter((b) => porInteresse[b] > 0);
  if (marcadas.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {marcadas.map((b) => (
        <span
          key={b}
          title={`${INTERESSE_LABEL[b]}: ${porInteresse[b]}`}
          className="flex items-center gap-1 text-[11px] tabular-nums text-muted"
        >
          <Bandeira estagio={INTERESSE_ESTAGIO[b]} className="h-3 w-3" />
          {porInteresse[b]}
        </span>
      ))}
    </div>
  );
}

/* ---------- linha do colaborador ---------- */

function LinhaColaborador({
  uso,
  posicao,
  maxMensagens,
  temMedicao,
}: {
  uso: UsoColaborador;
  /** Lugar no ranking de uso — a lista já vem ordenada por ele. */
  posicao: number;
  /** Escala da barra: o maior do período vale 100%, não um teto inventado. */
  maxMensagens: number;
  temMedicao: boolean;
}) {
  const aparelho = uso.tipo === "aparelho";
  const semNada =
    uso.mensagens === 0 &&
    uso.classificacoes === 0 &&
    uso.aulas === 0 &&
    uso.matriculas === 0;
  // No aparelho, zero não é desempenho: é coisa que ele não pode fazer.
  const naoSeAplica = (valor: number) => (aparelho ? "—" : String(valor));

  return (
    <Card className={cn("p-4", semNada && "opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-4 shrink-0 text-right font-display text-sm font-semibold tabular-nums text-faint">
            {posicao}
          </span>
          {aparelho ? (
            <CelularIcone />
          ) : (
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                uso.online ? "bg-ok" : "bg-border-strong",
              )}
            />
          )}
          <span className="truncate font-display text-sm font-semibold uppercase tracking-wide text-ink">
            {uso.nome}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-widest text-faint">
            {aparelho ? "fora do sistema" : (uso.role && PAPEL_LABEL[uso.role]) || uso.role}
          </span>
          {!uso.ativo && (
            <span className="shrink-0 text-[10px] uppercase tracking-widest text-warn">
              desativado
            </span>
          )}
        </div>
        <p className="text-[11px] text-faint">
          {uso.online ? (
            <span className="text-ok">online agora</span>
          ) : (
            <>última atividade {comoFalarDoInstante(uso.ultimaAtividadeEm)}</>
          )}
          {uso.ultimoLoginEm && <> · entrou {hora(uso.ultimoLoginEm)}</>}
        </p>
      </div>

      {/* Barra do volume de resposta: o único número que compara duas pessoas
          de relance — o resto pede leitura. O aparelho ganha a barra cinza:
          entra na comparação sem parecer o campeão de vendas do mês. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn(
            "h-full rounded-full",
            aparelho
              ? "bg-gradient-to-r from-elevated to-border-strong"
              : "bg-gradient-to-r from-red-deep to-red-bright",
          )}
          style={{ width: `${maxMensagens > 0 ? (uso.mensagens / maxMensagens) * 100 : 0}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
        <Celula label="Mensagens" valor={String(uso.mensagens)} destaque={!aparelho} />
        <Celula label="Conversas" valor={String(uso.conversas)} />
        <Celula label="Classificou" valor={naoSeAplica(uso.classificacoes)}>
          <Classificacoes porInteresse={uso.porInteresse} />
        </Celula>
        <Celula label="Aulas exp." valor={naoSeAplica(uso.aulas)} />
        <Celula label="Matrículas" valor={naoSeAplica(uso.matriculas)} />
        <Celula
          label="Em tela"
          valor={temMedicao && !aparelho ? formatarDuracao(uso.msEmTela) : "—"}
        />
        <Celula label="Ativo (est.)" valor={formatarDuracao(uso.msAtivo)} />
      </div>
    </Card>
  );
}

/* ---------- painel ---------- */

export function UsoPainel({ dados }: { dados: UsoAtendimento }) {
  const { colaboradores } = dados;
  const soma = (campo: (u: UsoColaborador) => number) =>
    colaboradores.reduce((t, u) => t + campo(u), 0);

  const maxMensagens = Math.max(...colaboradores.map((u) => u.mensagens), 0);
  const online = colaboradores.filter((u) => u.online);

  // Presença só existe a partir da primeira batida de ponto. Período anterior a
  // ela mostra "—" em vez de zero: zero diria que ninguém abriu o sistema.
  const temMedicao =
    dados.presencaDesde !== null && new Date(dados.presencaDesde) <= new Date(dados.fim);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FiltroPeriodo atual={dados.periodo} />
        <p className="text-[11px] text-faint">
          {dia(dados.inicio)} → {dia(dados.fim)} ·{" "}
          {online.length > 0 ? (
            <span className="text-ok">
              {online.length} online agora ({online.map((u) => u.nome).join(", ")})
            </span>
          ) : (
            "ninguém online agora"
          )}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Total
          label="Mensagens"
          valor={soma((u) => u.mensagens)}
          hint="respostas enviadas, com o aparelho"
        />
        <Total
          label="Conversas"
          valor={soma((u) => u.conversas)}
          hint="atendidas ao menos uma vez"
        />
        <Total
          label="Classificações"
          valor={soma((u) => u.classificacoes)}
          hint="leads marcados no funil"
        />
        <Total
          label="Aulas exp."
          valor={soma((u) => u.aulas)}
          hint="visitas marcadas na conversa"
        />
        <Total
          label="Matrículas"
          valor={soma((u) => u.matriculas)}
          hint="fechadas no período"
        />
      </section>

      <section className="flex flex-col gap-3">
        {colaboradores.length === 0 ? (
          <Card className="px-5 py-12 text-center">
            <p className="text-sm text-faint">Nenhum colaborador com acesso ainda.</p>
          </Card>
        ) : (
          colaboradores.map((u, i) => (
            <LinhaColaborador
              key={u.id}
              uso={u}
              posicao={i + 1}
              maxMensagens={maxMensagens}
              temMedicao={temMedicao}
            />
          ))
        )}
      </section>

      {/* Sem esta nota, os dois tempos parecem a mesma medida mal feita. */}
      <Card className="p-4">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-widest text-ink">
          Como cada número é contado
        </h2>
        <dl className="mt-2 grid gap-2 text-[11px] leading-relaxed text-muted sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-ink">Mensagens e conversas</dt>
            <dd>
              Cada resposta que saiu para o lead. A que sai do celular do dono não
              tem quem assinar: em vez de sumir, junta-se na linha
              <span className="text-ink"> Pelo aparelho</span>, que disputa o mesmo
              ranking — é assim que se enxerga quanto do atendimento passou por
              fora do sistema.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Classificações</dt>
            <dd>
              Cada vez que alguém marcou a bandeira da conversa. Reclassificar o
              mesmo lead conta de novo — é atendimento novo.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Em tela (medido)</dt>
            <dd>
              Tempo com o sistema aberto e alguém na frente dele, em blocos de 5
              minutos. Aba no fundo ou aparelho parado não conta.
              {temMedicao
                ? dados.presencaDesde && ` Medição desde ${dia(dados.presencaDesde)}.`
                : " Ainda sem medição neste período."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Ativo (estimado)</dt>
            <dd>
              Estimativa a partir das ações: ações a menos de 30 minutos uma da
              outra viram um bloco de trabalho, e cada bloco ganha 5 minutos de
              cauda. Ler conversa sem responder não deixa rastro e não aparece
              aqui.
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
