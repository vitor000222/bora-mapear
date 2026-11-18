import type { Idioma } from '@bora-mapear/core';

export * from './provedor.ts';
export * from './json.ts';
export * from './evidencias.ts';
export * from './agentes.ts';

/** Os agentes que o usuário configura, cada um com o seu modelo. */
export const AGENTES = ['leitor', 'mapeador', 'revisor', 'editor', 'conversor', 'visual'] as const;
export type NomeAgente = (typeof AGENTES)[number];

export const DESCRICOES_AGENTE: Record<NomeAgente, string> = {
  leitor: 'Lê documentos, POPs e transcrições e separa as evidências. Pode ser um modelo barato.',
  mapeador: 'Escreve a matriz a partir das evidências. Vale o modelo mais forte.',
  revisor: 'Aponta lacunas e linhas para revisão humana.',
  editor: 'Muda a matriz a partir de um pedido em português.',
  conversor: 'Converte código ou texto de outra ferramenta (Mermaid, PlantUML, lista de passos) em matriz.',
  visual: 'Aprende o seu estilo de cores a partir das correções que você salvou.',
};

const DESCRICOES = {
  pt: DESCRICOES_AGENTE,
  en: {
    leitor: 'Reads documents, SOPs and transcripts and pulls out the evidence. A cheap model will do.',
    mapeador: 'Writes the matrix from the evidence. Worth the strongest model.',
    revisor: 'Points out gaps and rows for human review.',
    editor: 'Changes the matrix from a request in plain English.',
    conversor: 'Converts code or text from another tool (Mermaid, PlantUML, a list of steps) into a matrix.',
    visual: 'Learns your color style from the corrections you saved.',
  },
} satisfies Record<Idioma, Record<NomeAgente, string>>;

/** O que cada agente faz, no idioma da interface. */
export function descricoesAgente(idioma: Idioma): Record<NomeAgente, string> {
  return { ...DESCRICOES[idioma] };
}
