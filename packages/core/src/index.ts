export * from './matriz.ts';
export * from './ids.ts';
export * from './validar.ts';
export * from './layout.ts';
export * from './correcoes.ts';
export * from './renderizadores/bpmn.ts';
export * from './renderizadores/mermaid.ts';
export * from './renderizadores/reactflow.ts';
export * from './previa.ts';
export * from './operacoes.ts';
export * from './comparar.ts';
export * from './estilo.ts';
export * from './importar-bpmn.ts';
export * from './importar-mermaid.ts';

import type { Matriz } from './matriz.ts';
import type { Correcoes } from './correcoes.ts';
import { renderizarBpmn } from './renderizadores/bpmn.ts';
import { renderizarMermaid } from './renderizadores/mermaid.ts';
import { renderizarReactFlow, type GrafoReactFlow } from './renderizadores/reactflow.ts';

/** As linguagens em que um mapeamento pode ser desenhado. XML é a vista de código do BPMN. */
export const LINGUAGENS = ['bpmn', 'mermaid', 'reactflow'] as const;
export type Linguagem = (typeof LINGUAGENS)[number];

export interface SaidaPorLinguagem {
  bpmn: string;
  mermaid: string;
  reactflow: GrafoReactFlow;
}

/** Um ponto de entrada só: a mesma matriz em qualquer linguagem. */
export function renderizar<L extends Linguagem>(linguagem: L, m: Matriz, correcoes?: Correcoes): SaidaPorLinguagem[L] {
  const opcoes = correcoes ? { correcoes } : {};
  const saidas = {
    bpmn: () => renderizarBpmn(m, opcoes),
    mermaid: () => renderizarMermaid(m),
    reactflow: () => renderizarReactFlow(m, opcoes),
  };
  return saidas[linguagem]() as SaidaPorLinguagem[L];
}
