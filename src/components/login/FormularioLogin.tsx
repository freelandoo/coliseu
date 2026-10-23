"use client";
import { useState } from "react";
import { classeBotao } from "@/components/ui/Botao";
import { MensagemErro, classeCampo } from "@/components/ui/Campo";
import { Coliseu3D } from "@/components/coliseu3d/Coliseu3D";
import { Listras } from "@/components/ui/editorial";
import { cn } from "@/lib/cn";

type Modo = "login" | "cadastro";

function OlhoIcon({ aberto }: { aberto: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!aberto && <path d="m4 20 16-16" />}
    </svg>
  );
}

/**
 * Tela de acesso. `podeCadastrar` vem do servidor: o cadastro público só cria o
 * PRIMEIRO admin (a API recusa com 403 depois disso), então o link some assim
 * que existe alguém — antes ele aparecia sempre e só dava erro.
 */
export function FormularioLogin({ podeCadastrar }: { podeCadastrar: boolean }) {
  const [modo, setModo] = useState<Modo>(podeCadastrar ? "cadastro" : "login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cadastro = modo === "cadastro";

  async function enviar() {
    setErro(""); setEnviando(true);
    const rota = cadastro ? "/api/auth/register" : "/api/auth/login";
    // No login o campo aceita nome de acesso OU e-mail — colaborador criado
    // pelo admin não tem e-mail.
    const corpo = cadastro ? { nome, email, senha } : { login: email, senha };
    const r = await fetch(rota, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d?.erro ?? "Falha na operação"); setEnviando(false); return;
    }
    // A raiz decide o destino conforme o papel (admin → central, recepção →
    // atendimento, técnico → catraca), então não fixamos a tela aqui. Não há
    // returnTo: o proxy manda ao /login sem guardar a rota pedida.
    window.location.assign("/");
  }

  function trocarModo() {
    setModo(cadastro ? "login" : "cadastro");
    setErro("");
  }

  return (
    // Desktop: a arena em holograma à esquerda, o acesso à direita.
    // Celular: a arena menor em cima, o formulário embaixo.
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] overflow-x-clip lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:grid-rows-1">
      <section aria-labelledby="login-marca" className="relative flex flex-col justify-end overflow-hidden px-6 pt-[calc(1.5rem+var(--safe-t))] lg:justify-end lg:px-14 lg:py-14">
        <div className="relative h-[17rem] sm:h-[20rem] lg:h-[min(62vh,36rem)]">
          <Coliseu3D className="absolute inset-0" intensidade="destaque" />
        </div>
        <div className="relative z-[1] -mt-2 pb-2 lg:-mt-10 lg:pb-0">
          <p className="meta-mono entrada text-muted">Academia Coliseu Team</p>
          <h1 id="login-marca" className="font-manchete mt-2 text-[3rem] text-ink sm:text-[4rem] lg:text-[5.5rem]">
            <span className="linha-revela [--atraso:80ms]">Coliseu</span>
            <span className="linha-revela text-destaque [--atraso:180ms]">CRM</span>
          </h1>
          <div className="mt-3 flex items-stretch">
            <p className="meta-mono faixa-varre bg-brand px-3 [--atraso:340ms] py-1.5 text-[0.6875rem] text-white sm:text-xs">
              Disciplina · pessoas · resultados
            </p>
            <Listras className="listras-entram -ml-px w-12 [--atraso:420ms] shrink-0 text-brand sm:w-16" />
          </div>
        </div>
      </section>

      <div className="flex items-start justify-center px-4 pb-[calc(1.5rem+var(--safe-b))] pt-6 lg:items-end lg:p-14">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!enviando) void enviar();
        }}
        className="entrada w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)] [--atraso:320ms]">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          {cadastro ? "Criar conta" : "Entrar"}
        </h2>
        <p className="mt-1 text-sm text-muted">{cadastro ? "Cadastro de acesso" : "Acesso restrito à equipe"}</p>
        <div className="mt-5 flex flex-col gap-3">
          {cadastro && (
            <input className={classeCampo} name="nome" placeholder="Nome" aria-label="Nome" autoComplete="name" value={nome}
              onChange={(e) => setNome(e.target.value)} />
          )}
          <input className={classeCampo} name="login" spellCheck={false} placeholder={cadastro ? "E-mail" : "Login ou e-mail"}
            aria-label={cadastro ? "E-mail" : "Login ou e-mail"}
            autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="relative">
            <input className={`${classeCampo} pr-10`} name="senha" type={verSenha ? "text" : "password"}
              aria-label="Senha" autoComplete={cadastro ? "new-password" : "current-password"}
              placeholder={cadastro ? "Senha (mín. 8 caracteres)" : "Senha"} value={senha}
              onChange={(e) => setSenha(e.target.value)} />
            <button type="button" onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"} aria-pressed={verSenha}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-faint transition-colors hover:text-ink">
              <OlhoIcon aberto={verSenha} />
            </button>
          </div>
        </div>
        {erro && <MensagemErro className="mt-3">{erro}</MensagemErro>}
        <button type="submit" disabled={enviando}
          className={cn(classeBotao({ variante: "primario", tamanho: "lg", bloco: true }), "mt-5")}>
          {enviando ? "Enviando…" : cadastro ? "Cadastrar" : "Entrar"}
        </button>
        {podeCadastrar && (
          <button onClick={trocarModo} type="button"
            className="mt-4 w-full text-center text-xs text-muted transition-colors hover:text-ink">
            {cadastro ? "Já tem conta? Entrar" : "Não tem conta? Cadastrar"}
          </button>
        )}
      </form>
      </div>
    </main>
  );
}
