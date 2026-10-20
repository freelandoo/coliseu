import { Listras } from "@/components/ui/editorial";

/**
 * O dia de hoje como carimbo do tabloide, ao lado da abertura da central.
 * Decoração: não mede nada. Bate na página uma vez ao abrir (`.carimbo`) e
 * fica levemente torta. A data por extenso já está no texto da abertura.
 */
export function CarimboData({ dia, mesAno }: { dia: string; mesAno: string }) {
  return (
    <div aria-hidden className="carimbo relative w-[5.5rem] select-none sm:w-[8.5rem]">
      <div className="corte-canto bg-brand px-2 pb-2 pt-2.5 text-center text-white [--corte:12px] sm:px-3 sm:pb-3 sm:pt-4">
        <span className="block font-display text-[2.5rem] font-bold leading-none tabular-nums sm:text-[4rem]">{dia}</span>
        <span className="meta-mono mt-1.5 block whitespace-nowrap text-[0.5625rem] tracking-[0.06em] text-white sm:text-[0.6875rem] sm:tracking-[0.14em]">{mesAno}</span>
      </div>
      <Listras className="mt-1.5 h-2.5 w-full text-brand" />
    </div>
  );
}
