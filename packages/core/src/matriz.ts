import { z } from 'zod';

/** Os tipos de elemento que uma linha da matriz pode ter. Ver docs/matriz.md. */
export const TIPOS_ETAPA = [
  'inicio',
  'fim',
  'evento_intermediario',
  'evento_timer',
  'evento_mensagem',
  'tarefa',
  'tarefa_usuario',
  'tarefa_manual',
  'tarefa_servico',
  'tarefa_envio',
  'tarefa_recebimento',
  'tarefa_regra',
  'subprocesso',
  'gateway_exclusivo',
  'gateway_paralelo',
  'gateway_inclusivo',
  'gateway_evento',
] as const;

export type TipoEtapa = (typeof TIPOS_ETAPA)[number];

/** Nome de cada tipo para gente ler, agrupado como aparece num seletor. */
export const ROTULOS_TIPO: Record<TipoEtapa, string> = {
  inicio: 'Início',
  fim: 'Fim',
  evento_intermediario: 'Marco intermediário',
  evento_timer: 'Espera de prazo',
  evento_mensagem: 'Espera de mensagem',
  tarefa: 'Tarefa',
  tarefa_usuario: 'Tarefa com sistema',
  tarefa_manual: 'Tarefa manual',
  tarefa_servico: 'Tarefa automática',
  tarefa_envio: 'Envio',
  tarefa_recebimento: 'Recebimento',
  tarefa_regra: 'Regra de negócio',
  subprocesso: 'Subprocesso',
  gateway_exclusivo: 'Decisão (um caminho)',
  gateway_paralelo: 'Paralelo',
  gateway_inclusivo: 'Decisão (um ou mais)',
  gateway_evento: 'Decisão por evento',
};

export const GRUPOS_TIPO: Array<{ grupo: string; tipos: TipoEtapa[] }> = [
  { grupo: 'Eventos', tipos: ['inicio', 'fim', 'evento_intermediario', 'evento_timer', 'evento_mensagem'] },
  {
    grupo: 'Tarefas',
    tipos: ['tarefa_usuario', 'tarefa_manual', 'tarefa_servico', 'tarefa_envio', 'tarefa_recebimento', 'tarefa_regra', 'tarefa', 'subprocesso'],
  },
  { grupo: 'Gateways', tipos: ['gateway_exclusivo', 'gateway_paralelo', 'gateway_inclusivo', 'gateway_evento'] },
];

/** Família visual de cada tipo: decide forma e tamanho no desenho. */
export type Familia = 'evento' | 'tarefa' | 'subprocesso' | 'gateway';

export function familiaDoTipo(tipo: TipoEtapa): Familia {
  if (tipo === 'inicio' || tipo === 'fim' || tipo.startsWith('evento_')) return 'evento';
  if (tipo.startsWith('gateway_')) return 'gateway';
  if (tipo === 'subprocesso') return 'subprocesso';
  return 'tarefa';
}

const CHAVE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export const SaidaSchema = z.object({
  para: z.string().min(1).describe('Chave da etapa de destino.'),
  rotulo: z
    .string()
    .optional()
    .describe('Texto da seta. Obrigatório em toda saída de gateway exclusivo ou inclusivo com mais de uma saída.'),
});

export const EtapaSchema = z.object({
  chave: z
    .string()
    .regex(CHAVE, 'A chave começa com letra e só tem letras, números, _ e -.')
    .describe('Chave estável da linha. Nunca reaproveitada. Vira o id do elemento no desenho.'),
  tipo: z.enum(TIPOS_ETAPA).describe('Tipo do elemento. Ver docs/matriz.md.'),
  nome: z.string().describe('Verbo no infinitivo + objeto, no vocabulário de quem faz. Em gateway de decisão, a pergunta.'),
  raia: z.string().min(1).describe('Id da raia. Raia é função, não pessoa.'),
  descricao: z.string().optional().describe('Uma ou duas frases. Vira a documentação do elemento.'),
  ator: z.string().optional().describe('Quem executa, quando difere da raia.'),
  sistema: z.string().optional().describe('Ferramenta usada na etapa.'),
  entrada: z.string().optional().describe('O que entra na etapa.'),
  saida: z.string().optional().describe('O que sai da etapa.'),
  regra: z.string().optional().describe('Alçada, política ou critério aplicado.'),
  proximos: z.array(SaidaSchema).default([]).describe('As saídas da etapa. É isto que desenha o fluxo.'),
  evidencias: z.array(z.string()).optional().describe('Chaves das evidências que sustentam a linha (EV-001).'),
  confianca: z.number().min(0).max(1).optional().describe('Autoavaliação do agente, de 0 a 1.'),
  revisarHumano: z.boolean().optional().describe('true quando a linha pede revisão humana.'),
});

export const RaiaSchema = z.object({
  id: z.string().regex(CHAVE, 'O id da raia começa com letra e só tem letras, números, _ e -.'),
  nome: z.string().min(1),
});

export const MatrizSchema = z.object({
  versaoSchema: z.literal(1),
  processo: z.object({
    id: z.string().regex(CHAVE, 'O id do processo começa com letra e só tem letras, números, _ e -.'),
    nome: z.string().min(1),
    descricao: z.string().optional(),
  }),
  raias: z.array(RaiaSchema).min(1).describe('Na ordem em que aparecem, de cima para baixo.'),
  etapas: z.array(EtapaSchema).min(1).describe('Na ordem de leitura. Uma linha por elemento do processo.'),
});

export type Saida = z.infer<typeof SaidaSchema>;
export type Etapa = z.infer<typeof EtapaSchema>;
export type Raia = z.infer<typeof RaiaSchema>;
export type Matriz = z.infer<typeof MatrizSchema>;
/** A matriz como chega de fora, antes dos valores padrão. */
export type MatrizEntrada = z.input<typeof MatrizSchema>;

/** Lê e normaliza uma matriz. Lança erro com os campos inválidos se o formato não bater. */
export function lerMatriz(dado: unknown): Matriz {
  const resultado = MatrizSchema.safeParse(dado);
  if (!resultado.success) {
    const linhas = resultado.error.issues.map((i) => `- ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    throw new Error(`Matriz fora do formato:\n${linhas.join('\n')}`);
  }
  return resultado.data;
}

/** JSON Schema da matriz, para structured output dos agentes. */
export function matrizJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(MatrizSchema, { io: 'input' }) as Record<string, unknown>;
}
