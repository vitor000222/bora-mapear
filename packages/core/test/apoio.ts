import { readFileSync } from 'node:fs';
import { lerMatriz, type Matriz, type MatrizEntrada } from '../src/index.ts';

export function exemplo(): Matriz {
  const caminho = new URL('../../../exemplos/pedido-de-venda.json', import.meta.url);
  return lerMatriz(JSON.parse(readFileSync(caminho, 'utf8')));
}

/** Matriz mínima e válida: início → tarefa → fim. */
export function minima(extra: Partial<MatrizEntrada> = {}): Matriz {
  return lerMatriz({
    versaoSchema: 1,
    processo: { id: 'p', nome: 'Processo' },
    raias: [{ id: 'a', nome: 'A' }],
    etapas: [
      { chave: 'I', tipo: 'inicio', nome: 'Começa', raia: 'a', proximos: [{ para: 'T' }] },
      { chave: 'T', tipo: 'tarefa', nome: 'Fazer algo', raia: 'a', proximos: [{ para: 'F' }] },
      { chave: 'F', tipo: 'fim', nome: 'Termina', raia: 'a' },
    ],
    ...extra,
  });
}
