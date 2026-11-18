import { z } from 'zod';
import { familiaDoTipo, TIPOS_ETAPA, type Etapa, type Matriz } from './matriz.ts';
import { correcoesVazias, type Correcoes } from './correcoes.ts';
import { etapasUnicas } from './layout.ts';

const COR = /^#[0-9a-fA-F]{6}$/;

/**
 * Uma regra de estilo: "tarefas manuais em laranja". O agente Visual escreve regras, nunca coordenadas;
 * o código decide em quais etapas cada regra vale.
 */
export const RegraVisualSchema = z.object({
  descricao: z.string().describe('A regra em uma frase, para a pessoa ler. Ex.: "Tarefas manuais em laranja".'),
  quando: z
    .object({
      tipos: z.array(z.enum(TIPOS_ETAPA)).optional(),
      familias: z.array(z.enum(['evento', 'tarefa', 'subprocesso', 'gateway'])).optional(),
      raias: z.array(z.string()).optional().describe('Nomes de raia, sem diferença de maiúscula e acento.'),
      nomeContem: z.string().optional().describe('Trecho do nome da etapa.'),
      revisarHumano: z.boolean().optional().describe('true: só etapas marcadas para revisão humana.'),
      semEvidencia: z.boolean().optional().describe('true: só etapas que não citam evidência.'),
    })
    .describe('Todas as condições presentes precisam valer. Sem condição nenhuma, vale para todas as etapas.'),
  corFundo: z.string().regex(COR, 'Use cor no formato #rrggbb.').optional(),
  corBorda: z.string().regex(COR, 'Use cor no formato #rrggbb.').optional(),
});
export type RegraVisual = z.infer<typeof RegraVisualSchema>;

export const EstiloVisualSchema = z.object({
  versao: z.literal(1),
  regras: z.array(RegraVisualSchema).describe('Na ordem: quando duas regras valem para a mesma etapa, a de baixo vence.'),
});
export type EstiloVisual = z.infer<typeof EstiloVisualSchema>;

export const estiloVazio = (): EstiloVisual => ({ versao: 1, regras: [] });

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function regraVale(regra: RegraVisual, e: Etapa, m: Matriz): boolean {
  const q = regra.quando;
  if (q.tipos?.length && !q.tipos.includes(e.tipo)) return false;
  if (q.familias?.length && !q.familias.includes(familiaDoTipo(e.tipo))) return false;
  if (q.raias?.length) {
    const raia = m.raias.find((r) => r.id === e.raia);
    const nomes = [normal(e.raia), raia ? normal(raia.nome) : ''];
    if (!q.raias.some((r) => nomes.includes(normal(r)))) return false;
  }
  if (q.nomeContem && !normal(e.nome).includes(normal(q.nomeContem))) return false;
  if (q.revisarHumano !== undefined && Boolean(e.revisarHumano) !== q.revisarHumano) return false;
  if (q.semEvidencia !== undefined && !e.evidencias?.length !== q.semEvidencia) return false;
  return true;
}

/** A cor de cada etapa segundo o estilo. Etapa sem regra que valha fica de fora. */
export function coresDoEstilo(m: Matriz, estilo: EstiloVisual): Record<string, { corFundo?: string; corBorda?: string }> {
  const cores: Record<string, { corFundo?: string; corBorda?: string }> = {};
  for (const e of etapasUnicas(m)) {
    for (const regra of estilo.regras) {
      if (!regraVale(regra, e, m)) continue;
      const atual = cores[e.chave] ?? {};
      if (regra.corFundo) atual.corFundo = regra.corFundo;
      if (regra.corBorda) atual.corBorda = regra.corBorda;
      cores[e.chave] = atual;
    }
  }
  return cores;
}

/** Aplica o estilo sobre as correções de uma visão: onde uma regra vale, a cor dela vence; o resto fica como está. */
export function aplicarEstilo(m: Matriz, estilo: EstiloVisual, correcoes: Correcoes = correcoesVazias()): Correcoes {
  const nova: Correcoes = structuredClone(correcoes);
  for (const [chave, cor] of Object.entries(coresDoEstilo(m, estilo))) nova.nos[chave] = { ...nova.nos[chave], ...cor };
  return nova;
}
