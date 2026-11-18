import { z } from 'zod';
import { EtapaSchema, RaiaSchema, SaidaSchema, type Etapa, type Matriz } from './matriz.ts';

/**
 * Operações sobre a matriz: é assim que o agente Editor muda um mapeamento.
 * Ele não reescreve a matriz inteira; devolve uma lista curta de operações,
 * aplicadas aqui por código, na ordem.
 */
export const OperacaoSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('adicionar_etapa'),
    etapa: EtapaSchema.describe('A etapa nova, com chave que ainda não existe.'),
    depoisDe: z.string().optional().describe('Chave da etapa depois da qual ela entra na ordem de leitura. Sem isso, entra no fim.'),
  }),
  z.object({
    op: z.literal('alterar_etapa'),
    chave: z.string().describe('Chave da etapa a alterar.'),
    // "proximos" redefinido sem valor padrão: no Zod 4 o padrão valeria mesmo dentro de partial() e apagaria as setas.
    campos: EtapaSchema.omit({ chave: true, proximos: true })
      .partial()
      .extend({ proximos: z.array(SaidaSchema).optional() })
      .describe('Só os campos que mudam. "proximos" substitui a lista inteira.'),
  }),
  z.object({
    op: z.literal('remover_etapa'),
    chave: z.string(),
    religarPara: z
      .array(SaidaSchema)
      .optional()
      .describe('Para onde vão as setas que chegavam nesta etapa. Sem isso, elas são apagadas.'),
  }),
  z.object({
    op: z.literal('adicionar_raia'),
    raia: RaiaSchema,
    depoisDe: z.string().optional().describe('Id da raia depois da qual ela entra. Sem isso, entra no fim.'),
  }),
  z.object({ op: z.literal('renomear_raia'), id: z.string(), nome: z.string().min(1) }),
  z.object({ op: z.literal('remover_raia'), id: z.string().describe('Só raia sem nenhuma etapa.') }),
]);

export type Operacao = z.infer<typeof OperacaoSchema>;

export const ListaOperacoesSchema = z.object({
  resumo: z.string().describe('Uma frase dizendo o que muda, para o histórico.'),
  operacoes: z.array(OperacaoSchema),
});
export type ListaOperacoes = z.infer<typeof ListaOperacoesSchema>;

export class ErroOperacao extends Error {
  readonly indice: number;
  constructor(indice: number, mensagem: string) {
    super(`Operação ${indice + 1}: ${mensagem}`);
    this.indice = indice;
  }
}

/** Aplica as operações em ordem, sem mexer na matriz original. Lança ErroOperacao na primeira que não cabe. */
export function aplicarOperacoes(m: Matriz, operacoes: Operacao[]): Matriz {
  const nova: Matriz = structuredClone(m);
  operacoes.forEach((op, i) => {
    const acharEtapa = (chave: string) => {
      const j = nova.etapas.findIndex((e) => e.chave === chave);
      if (j < 0) throw new ErroOperacao(i, `a etapa "${chave}" não existe.`);
      return j;
    };
    switch (op.op) {
      case 'adicionar_etapa': {
        if (nova.etapas.some((e) => e.chave === op.etapa.chave)) throw new ErroOperacao(i, `a chave "${op.etapa.chave}" já existe.`);
        const posicao = op.depoisDe ? acharEtapa(op.depoisDe) + 1 : nova.etapas.length;
        nova.etapas.splice(posicao, 0, structuredClone(op.etapa));
        break;
      }
      case 'alterar_etapa': {
        const j = acharEtapa(op.chave);
        const campos = Object.fromEntries(Object.entries(op.campos).filter(([, v]) => v !== undefined)) as Partial<Etapa>;
        nova.etapas[j] = { ...nova.etapas[j]!, ...structuredClone(campos) };
        break;
      }
      case 'remover_etapa': {
        const j = acharEtapa(op.chave);
        nova.etapas.splice(j, 1);
        for (const e of nova.etapas) {
          const chegavam = e.proximos.filter((s) => s.para === op.chave);
          if (!chegavam.length) continue;
          const resto = e.proximos.filter((s) => s.para !== op.chave);
          const religadas = (op.religarPara ?? []).map((s) => ({ ...s, ...(chegavam[0]?.rotulo && !s.rotulo ? { rotulo: chegavam[0].rotulo } : {}) }));
          e.proximos = [...resto, ...religadas.filter((s) => !resto.some((r) => r.para === s.para))];
        }
        break;
      }
      case 'adicionar_raia': {
        if (nova.raias.some((r) => r.id === op.raia.id)) throw new ErroOperacao(i, `a raia "${op.raia.id}" já existe.`);
        const k = op.depoisDe ? nova.raias.findIndex((r) => r.id === op.depoisDe) : -1;
        if (op.depoisDe && k < 0) throw new ErroOperacao(i, `a raia "${op.depoisDe}" não existe.`);
        nova.raias.splice(k < 0 ? nova.raias.length : k + 1, 0, { ...op.raia });
        break;
      }
      case 'renomear_raia': {
        const raia = nova.raias.find((r) => r.id === op.id);
        if (!raia) throw new ErroOperacao(i, `a raia "${op.id}" não existe.`);
        raia.nome = op.nome;
        break;
      }
      case 'remover_raia': {
        if (!nova.raias.some((r) => r.id === op.id)) throw new ErroOperacao(i, `a raia "${op.id}" não existe.`);
        const usando = nova.etapas.filter((e) => e.raia === op.id).map((e) => e.chave);
        if (usando.length) throw new ErroOperacao(i, `a raia "${op.id}" ainda tem etapas: ${usando.join(', ')}. Mude-as de raia antes.`);
        nova.raias = nova.raias.filter((r) => r.id !== op.id);
        break;
      }
    }
  });
  return nova;
}

/** Frases curtas do que as operações fazem, para mostrar ao usuário antes de aplicar. */
export function descreverOperacoes(m: Matriz, operacoes: Operacao[]): string[] {
  const nome = (chave: string) => {
    const e = m.etapas.find((x) => x.chave === chave);
    return e?.nome ? `"${e.nome}" (${chave})` : chave;
  };
  return operacoes.map((op) => {
    switch (op.op) {
      case 'adicionar_etapa':
        return `Adiciona "${op.etapa.nome}" (${op.etapa.chave})${op.depoisDe ? ` depois de ${nome(op.depoisDe)}` : ''}.`;
      case 'alterar_etapa':
        return `Altera ${nome(op.chave)}: ${Object.keys(op.campos).join(', ')}.`;
      case 'remover_etapa':
        return `Remove ${nome(op.chave)}${op.religarPara?.length ? `, religando para ${op.religarPara.map((s) => s.para).join(', ')}` : ''}.`;
      case 'adicionar_raia':
        return `Adiciona a raia "${op.raia.nome}".`;
      case 'renomear_raia':
        return `Renomeia a raia ${op.id} para "${op.nome}".`;
      case 'remover_raia':
        return `Remove a raia ${op.id}.`;
    }
  });
}
