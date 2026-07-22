"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { formatarTelefone } from "@/lib/whatsapp/telefone";

interface LeadNovo {
  id: string;
  nome: string;
  telefone: string;
  conversaId?: string;
}

/**
 * Aviso de leads não trabalhados, mostrado uma vez ao entrar no sistema.
 *
 * O controle é `sessionStorage`, não estado de servidor: a sessão do navegador
 * começa no login e morre ao fechar a aba, que é exatamente a janela em que o
 * aviso deve aparecer uma vez. Navegar entre páginas não repete o aviso.
 */
const CHAVE = "coliseu:aviso-leads-novos";

export function AvisoLeadsNovos() {
  const [leads, setLeads] = useState<LeadNovo[]>([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(CHAVE)) return;
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/captacao/leads-novos", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { leads: LeadNovo[] };
        if (!ativo || !d.leads?.length) return;
        // Marca antes de exibir: se o usuário fechar a aba com o aviso aberto,
        // ele não volta a aparecer na navegação seguinte da mesma sessão.
        sessionStorage.setItem(CHAVE, "1");
        setLeads(d.leads);
        setAberto(true);
      } catch {
        /* sem rede: o aviso é dispensável, a Captação mostra os leads mesmo assim */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  if (!aberto || leads.length === 0) return null;

  return (
    <Modal onFechar={() => setAberto(false)}>
      <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
        {leads.length === 1 ? "1 lead novo" : `${leads.length} leads novos`}
      </h3>
      <p className="mt-1 text-sm text-muted">Ninguém respondeu ainda.</p>

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
        {leads.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{l.nome}</span>
              <span className="block text-xs text-faint">
                {formatarTelefone(l.telefone) || "sem número"}
              </span>
            </span>
            {l.conversaId ? (
              <Link
                href={`/captacao/atendimento?c=${l.conversaId}`}
                onClick={() => setAberto(false)}
                className="shrink-0 rounded-md bg-red px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-red-bright"
              >
                Responder →
              </Link>
            ) : (
              <span className="shrink-0 text-xs text-faint">sem conversa</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex gap-3">
        <Link
          href="/captacao"
          onClick={() => setAberto(false)}
          className="flex-1 rounded-lg border border-border-strong px-4 py-2.5 text-center text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Ver a Captação
        </Link>
        <button
          onClick={() => setAberto(false)}
          className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          Depois
        </button>
      </div>
    </Modal>
  );
}
