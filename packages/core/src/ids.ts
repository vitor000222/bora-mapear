import type { Matriz } from './matriz.ts';

/** Uma seta da matriz, com o id estável que ela recebe em todo desenho. */
export interface Fluxo {
  id: string;
  de: string;
  para: string;
  rotulo?: string;
}

export function idDaRaia(raiaId: string): string {
  return `Raia_${raiaId}`;
}

/** Ids das setas: `Fluxo_<de>_<para>`, com `_2`, `_3`… quando há setas repetidas. */
export function fluxosDaMatriz(m: Matriz): Fluxo[] {
  const usados = new Map<string, number>();
  const fluxos: Fluxo[] = [];
  for (const etapa of m.etapas) {
    for (const saida of etapa.proximos) {
      const base = `Fluxo_${etapa.chave}_${saida.para}`;
      const n = (usados.get(base) ?? 0) + 1;
      usados.set(base, n);
      const fluxo: Fluxo = { id: n === 1 ? base : `${base}_${n}`, de: etapa.chave, para: saida.para };
      if (saida.rotulo) fluxo.rotulo = saida.rotulo;
      fluxos.push(fluxo);
    }
  }
  return fluxos;
}
