export * from './provedor.ts';
export * from './json.ts';
export * from './evidencias.ts';
export * from './agentes.ts';

/** Os agentes que o usuário configura, cada um com o seu modelo. */
export const AGENTES = ['leitor', 'mapeador', 'revisor', 'editor'] as const;
export type NomeAgente = (typeof AGENTES)[number];

export const DESCRICOES_AGENTE: Record<NomeAgente, string> = {
  leitor: 'Lê documentos, POPs e transcrições e separa as evidências. Pode ser um modelo barato.',
  mapeador: 'Escreve a matriz a partir das evidências. Vale o modelo mais forte.',
  revisor: 'Aponta lacunas e linhas para revisão humana.',
  editor: 'Muda a matriz a partir de um pedido em português.',
};
