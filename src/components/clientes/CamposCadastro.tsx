"use client";

import { useState } from "react";
import { Campo, classeCampo } from "@/components/ui/Campo";
import { cn } from "@/lib/cn";
import { ORIGEM_LABEL, type Origem } from "@/lib/types";
import {
  erroNoEndereco,
  soDigitos,
  type CampoCadastro,
  type ErrosCadastro,
  type FormCadastro,
} from "@/lib/cadastro";

const ORIGENS = Object.entries(ORIGEM_LABEL) as [Origem, string][];

/**
 * Os campos do cadastro de pessoa, em blocos: identificação, contato,
 * documentos e endereço. Só a obrigatoriedade real ganha asterisco. O endereço
 * é opcional e fica recolhido — mas abre sozinho quando tem dado ou erro: erro
 * escondido em seção fechada é erro que ninguém corrige.
 */
export function CamposCadastro({
  form,
  setCampo,
  erros,
  exigeCpf,
  mostrarOrigem,
  desabilitado = false,
}: {
  form: FormCadastro;
  setCampo: (campo: CampoCadastro, valor: string) => void;
  erros: ErrosCadastro;
  exigeCpf: boolean;
  /** Origem só se escolhe na criação; a ficha não a muda. */
  mostrarOrigem: boolean;
  desabilitado?: boolean;
}) {
  const temEndereco = !!(form.cep || form.estado || form.cidade || form.rua || form.numero);
  const [enderecoAberto, setEnderecoAberto] = useState(temEndereco);
  const abrirEndereco = enderecoAberto || erroNoEndereco(erros);

  async function preencherPorCep(cepRaw: string) {
    const cep = soDigitos(cepRaw);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!r.ok) return;
      const d = (await r.json()) as { erro?: boolean; uf?: string; localidade?: string; logradouro?: string };
      if (d.erro) return;
      // Só completa o que está vazio: o CEP não apaga o que a pessoa digitou.
      if (d.uf && !form.estado) setCampo("estado", d.uf);
      if (d.localidade && !form.cidade) setCampo("cidade", d.localidade);
      if (d.logradouro && !form.rua) setCampo("rua", d.logradouro);
    } catch {
      /* sem internet: preenche à mão */
    }
  }

  const texto = (
    campo: CampoCadastro,
    rotulo: string,
    extra: { placeholder?: string; type?: string; inputMode?: "tel" | "email" | "numeric"; autoComplete?: string } = {},
  ) => (
    <Campo rotulo={rotulo} erro={erros[campo]}>
      {(a) => (
        <input
          {...a}
          type={extra.type ?? "text"}
          value={form[campo]}
          onChange={(e) => {
            setCampo(campo, e.target.value);
            if (campo === "cep" && soDigitos(e.target.value).length === 8) void preencherPorCep(e.target.value);
          }}
          placeholder={extra.placeholder}
          inputMode={extra.inputMode}
          autoComplete={extra.autoComplete ?? "off"}
          disabled={desabilitado}
          className={classeCampo}
        />
      )}
    </Campo>
  );

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3" disabled={desabilitado}>
        <legend className="mb-1 text-sm font-semibold text-ink">Identificação</legend>
        {texto("nome", "Nome *")}
        <div className="grid gap-3 sm:grid-cols-2">
          {mostrarOrigem && (
            <Campo rotulo="Origem *">
              {(a) => (
                <select
                  {...a}
                  value={form.origem}
                  onChange={(e) => setCampo("origem", e.target.value)}
                  className={classeCampo}
                >
                  {ORIGENS.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          )}
          {texto("dataNascimento", "Data de nascimento", { type: "date" })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={desabilitado}>
        <legend className="mb-1 text-sm font-semibold text-ink">Contato</legend>
        <p className="-mt-1 text-xs text-muted">Telefone ou e-mail — pelo menos um.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {texto("telefone", "Celular / WhatsApp", { placeholder: "(11) 90000-0000", inputMode: "tel" })}
          {texto("email", "E-mail", { placeholder: "nome@email.com", inputMode: "email" })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={desabilitado}>
        <legend className="mb-1 text-sm font-semibold text-ink">Documentos e endereço</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {texto("cpf", exigeCpf ? "CPF *" : "CPF", { placeholder: "000.000.000-00", inputMode: "numeric" })}
          {texto("rg", "RG", { placeholder: "00.000.000-0" })}
        </div>
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setEnderecoAberto((v) => !v)}
            aria-expanded={abrirEndereco}
            disabled={erroNoEndereco(erros)}
            className={cn(
              "flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-ink",
              "disabled:cursor-default",
            )}
          >
            <span>
              Endereço <span className="font-normal text-muted">(opcional)</span>
            </span>
            <span aria-hidden className={cn("text-xs text-muted transition-transform", abrirEndereco && "rotate-180")}>
              ▼
            </span>
          </button>
          {abrirEndereco && (
            <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
              {texto("cep", "CEP", { placeholder: "00000-000", inputMode: "numeric" })}
              {texto("estado", "Estado", { placeholder: "UF" })}
              {texto("cidade", "Cidade")}
              {texto("numero", "Número")}
              <div className="sm:col-span-2">{texto("rua", "Rua")}</div>
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}
