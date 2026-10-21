/**
 * CPF — funções puras, usadas pela migração do CloudGym, pela Gym Provider API
 * e pela elegibilidade da conta Freelandoo.
 */

/** Só dígitos. Não completa zeros nem confere DV — é a chave de comparação. */
export function normalizarCpf(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** Dígitos verificadores do CPF. Sequências repetidas (111…) são inválidas. */
export function cpfValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(digitos[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(digitos[9]) && dv(10) === Number(digitos[10]);
}
