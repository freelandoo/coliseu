/**
 * Carregando genérico das telas de trabalho: o cabeçalho e dois blocos no
 * tamanho típico, em cinza parado (sem shimmer). Aparece na troca de tela
 * enquanto o servidor monta a próxima — o menu nunca some.
 * Telas com layout próprio (Aula experimental) têm o seu `loading.tsx`.
 */
export default function Carregando() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Carregando…
      </p>
      <div className="mb-5 flex items-start gap-3" aria-hidden>
        <span className="mt-1 h-6 w-1.5 shrink-0 bg-brand sm:h-7" />
        <span className="block h-8 w-56 max-w-full bg-surface-2" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-24 rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <span aria-hidden className="mt-4 block h-80 rounded-xl border border-border bg-surface" />
    </div>
  );
}
