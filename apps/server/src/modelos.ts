import { readFileSync } from 'node:fs';
import { lerMatriz, type Matriz } from '@bora-mapear/core';

/** Ponto de partida de um mapeamento novo. */
export const MODELOS = ['em-branco', 'exemplo'] as const;
export type Modelo = (typeof MODELOS)[number];

function idDoProcesso(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return /^[a-z]/.test(base) ? base.slice(0, 60) : `processo-${base}`.slice(0, 60).replace(/-+$/, '');
}

export function matrizInicial(modelo: Modelo, nome: string): Matriz {
  if (modelo === 'exemplo') {
    const exemplo = lerMatriz(JSON.parse(readFileSync(new URL('../../../exemplos/pedido-de-venda.json', import.meta.url), 'utf8')));
    return { ...exemplo, processo: { ...exemplo.processo, id: idDoProcesso(nome), nome } };
  }
  return lerMatriz({
    versaoSchema: 1,
    processo: { id: idDoProcesso(nome), nome },
    raias: [{ id: 'raia-1', nome: 'Raia 1' }],
    etapas: [
      { chave: 'E01', tipo: 'inicio', nome: 'Início', raia: 'raia-1', proximos: [{ para: 'E02' }] },
      { chave: 'E02', tipo: 'tarefa_usuario', nome: 'Primeira tarefa', raia: 'raia-1', proximos: [{ para: 'E03' }] },
      { chave: 'E03', tipo: 'fim', nome: 'Fim', raia: 'raia-1' },
    ],
  });
}
