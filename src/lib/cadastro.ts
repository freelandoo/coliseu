/**
 * Formulário de cadastro de pessoa — regras puras, sem React.
 *
 * A regra que motiva este módulo: **campo não carregado não é campo vazio**.
 * O resumo do lead na Captação só tem nome e telefone; abrir o formulário com
 * esse resumo e mandar tudo no PATCH apagaria e-mail, RG, nascimento e
 * endereço de quem já tinha. Por isso o formulário de pessoa existente nasce
 * da ficha completa (GET /api/pessoas/[id]) e o PATCH leva só o que mudou —
 * no contrato da rota, campo omitido é campo preservado, e vazio é a pessoa
 * apagando de propósito.
 */
import type { Endereco, NovaPessoa, Origem, Pessoa } from "@/lib/types";

export interface FormCadastro {
  nome: string;
  origem: Origem;
  telefone: string;
  email: string;
  cpf: string;
  rg: string;
  dataNascimento: string;
  cep: string;
  estado: string;
  cidade: string;
  rua: string;
  numero: string;
}

export type CampoCadastro = keyof FormCadastro;
export type ErrosCadastro = Partial<Record<CampoCadastro, string>>;

export const FORM_VAZIO: FormCadastro = {
  nome: "",
  origem: "balcao",
  telefone: "",
  email: "",
  cpf: "",
  rg: "",
  dataNascimento: "",
  cep: "",
  estado: "",
  cidade: "",
  rua: "",
  numero: "",
};

const CAMPOS_PESSOA = ["nome", "telefone", "email", "cpf", "rg", "dataNascimento"] as const;
const CAMPOS_ENDERECO = ["cep", "estado", "cidade", "rua", "numero"] as const;
export const CAMPOS_DO_ENDERECO: readonly CampoCadastro[] = CAMPOS_ENDERECO;

export const soDigitos = (s: string) => s.replace(/\D/g, "");
const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** O formulário preenchido com a ficha inteira — o ponto de partida de quem já existe. */
export function formDaPessoa(p: Pessoa): FormCadastro {
  return {
    nome: p.nome,
    origem: p.origem,
    telefone: p.telefone ?? "",
    email: p.email ?? "",
    cpf: p.cpf ?? "",
    rg: p.rg ?? "",
    dataNascimento: p.dataNascimento ?? "",
    cep: p.endereco?.cep ?? "",
    estado: p.endereco?.estado ?? "",
    cidade: p.endereco?.cidade ?? "",
    rua: p.endereco?.rua ?? "",
    numero: p.endereco?.numero ?? "",
  };
}

/** Corpo do POST de pessoa nova. Origem vai; vendedor quem põe é o servidor. */
export function novaPessoaDoForm(f: FormCadastro): NovaPessoa {
  const endereco: Endereco = {};
  for (const c of CAMPOS_ENDERECO) if (f[c].trim()) endereco[c] = f[c].trim();
  return {
    nome: f.nome.trim(),
    origem: f.origem,
    telefone: f.telefone.trim(),
    email: f.email.trim(),
    cpf: f.cpf.trim(),
    rg: f.rg.trim(),
    dataNascimento: f.dataNascimento,
    endereco: Object.keys(endereco).length ? endereco : undefined,
  };
}

export type AlteracoesCadastro = Partial<Pick<Pessoa, (typeof CAMPOS_PESSOA)[number]>> & {
  endereco?: Endereco;
};

/**
 * Só o que mudou entre a base (o que o servidor tem) e o formulário. Espaço
 * nas pontas não é mudança. Campo apagado vai como "" — intenção explícita.
 * Endereço vai parte por parte: mudar o número não reescreve o CEP.
 */
export function alteracoesCadastro(base: FormCadastro, atual: FormCadastro): AlteracoesCadastro {
  const patch: AlteracoesCadastro = {};
  for (const c of CAMPOS_PESSOA) {
    const novo = atual[c].trim();
    if (novo !== base[c].trim()) patch[c] = novo;
  }
  const endereco: Endereco = {};
  for (const c of CAMPOS_ENDERECO) {
    const novo = atual[c].trim();
    if (novo !== base[c].trim()) endereco[c] = novo;
  }
  if (Object.keys(endereco).length) patch.endereco = endereco;
  return patch;
}

export function semAlteracoes(p: AlteracoesCadastro): boolean {
  return Object.keys(p).length === 0;
}

/**
 * O que é obrigatório de verdade: nome; telefone ou e-mail (a rota recusa
 * sem nenhum dos dois); CPF com 11 dígitos só para matricular (o Asaas exige
 * para gerar a assinatura). Formato errado só conta quando o campo foi
 * preenchido.
 */
export function validarCadastro(f: FormCadastro, { exigeCpf }: { exigeCpf: boolean }): ErrosCadastro {
  const e: ErrosCadastro = {};
  if (!f.nome.trim()) e.nome = "Informe o nome.";
  const temEmail = f.email.trim() !== "";
  const temTel = f.telefone.trim() !== "";
  if (temEmail && !emailValido(f.email)) e.email = "E-mail inválido.";
  if (temTel && soDigitos(f.telefone).length < 10) e.telefone = "Celular inválido — use DDD + número.";
  if (!temEmail && !temTel) {
    e.telefone = "Informe telefone ou e-mail.";
    e.email = "Informe telefone ou e-mail.";
  }
  if (exigeCpf && soDigitos(f.cpf).length !== 11) e.cpf = "CPF deve ter 11 dígitos — o Asaas exige para gerar a cobrança.";
  return e;
}

/** Algum erro está dentro do bloco de endereço (que pode estar recolhido)? */
export function erroNoEndereco(e: ErrosCadastro): boolean {
  return CAMPOS_ENDERECO.some((c) => !!e[c]);
}
