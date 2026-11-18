import { readFileSync } from 'node:fs';
import { lerMatriz, type Idioma, type Matriz } from '@bora-mapear/core';

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

const ARQUIVO_EXEMPLO: Record<Idioma, string> = { pt: 'pedido-de-venda.json', en: 'sales-order.json' };

const EM_BRANCO: Record<Idioma, { raia: string; inicio: string; tarefa: string; fim: string }> = {
  pt: { raia: 'Raia 1', inicio: 'Início', tarefa: 'Primeira tarefa', fim: 'Fim' },
  en: { raia: 'Lane 1', inicio: 'Start', tarefa: 'First task', fim: 'End' },
};

/** A matriz de partida, no idioma de quem cria: o exemplo traduzido, ou três etapas em branco. */
export function matrizInicial(modelo: Modelo, nome: string, idioma: Idioma = 'pt'): Matriz {
  if (modelo === 'exemplo') {
    const caminho = new URL(`../../../exemplos/${ARQUIVO_EXEMPLO[idioma]}`, import.meta.url);
    const exemplo = lerMatriz(JSON.parse(readFileSync(caminho, 'utf8')));
    return { ...exemplo, processo: { ...exemplo.processo, id: idDoProcesso(nome), nome } };
  }
  const t = EM_BRANCO[idioma];
  return lerMatriz({
    versaoSchema: 1,
    processo: { id: idDoProcesso(nome), nome },
    raias: [{ id: 'raia-1', nome: t.raia }],
    etapas: [
      { chave: 'E01', tipo: 'inicio', nome: t.inicio, raia: 'raia-1', proximos: [{ para: 'E02' }] },
      { chave: 'E02', tipo: 'tarefa_usuario', nome: t.tarefa, raia: 'raia-1', proximos: [{ para: 'E03' }] },
      { chave: 'E03', tipo: 'fim', nome: t.fim, raia: 'raia-1' },
    ],
  });
}
