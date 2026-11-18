import { z } from 'zod';
import type { Idioma } from '@bora-mapear/core';
import { somarUso, USO_ZERO, type ClienteModelo, type Mensagem, type Uso } from './provedor.ts';

/** Erro de um agente, com o que dá para fazer a respeito. */
export class ErroAgente extends Error {}

const MENSAGENS = {
  pt: {
    semJson: 'não há JSON na resposta',
    raiz: '(raiz)',
    cortada: 'A resposta do modelo foi cortada no limite de tokens. Aumente o limite do agente nas Configurações ou use um modelo com saída maior.',
    foraDoFormato: (maximo: number, problema: string) => `O modelo não devolveu a resposta no formato pedido depois de ${maximo} tentativas:\n${problema}`,
  },
  en: {
    semJson: 'there is no JSON in the response',
    raiz: '(root)',
    cortada: "The model's response was cut off at the token limit. Raise the agent's limit in Settings or use a model with a larger output.",
    foraDoFormato: (maximo: number, problema: string) => `The model did not return the response in the requested format after ${maximo} attempts:\n${problema}`,
  },
} satisfies Record<Idioma, unknown>;

const NAO_SUPORTADAS = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'pattern',
  'default',
  'format',
]);

/** Leva o JSON Schema ao subconjunto que os provedores aceitam: sem limites numéricos, objetos fechados. */
export function limparSchema(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(limparSchema);
  if (!no || typeof no !== 'object') return no;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(no as Record<string, unknown>)) {
    if (NAO_SUPORTADAS.has(k)) continue;
    saida[k === 'oneOf' ? 'anyOf' : k] = limparSchema(v);
  }
  if (saida['type'] === 'object') saida['additionalProperties'] = false;
  return saida;
}

export function schemaParaModelo(schema: z.ZodType): Record<string, unknown> {
  return limparSchema(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })) as Record<string, unknown>;
}

/** Tira o JSON de uma resposta que pode vir com cerca de código ou texto em volta. */
export function extrairJson(texto: string, idioma: Idioma = 'pt'): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio >= 0 && fim > inicio) return JSON.parse(limpo.slice(inicio, fim + 1));
    throw new Error(MENSAGENS[idioma].semJson);
  }
}

export interface PedidoJson<T extends z.ZodType> {
  sistema: string;
  usuario: string;
  schema: T;
  nomeSchema: string;
  maxTokens?: number;
  /** Conversa anterior (para rodadas de correção). */
  historico?: Mensagem[];
  tentativas?: number;
}

export interface RespostaJson<T> {
  dado: T;
  uso: Uso;
  /** A última resposta crua, para continuar a conversa numa rodada de correção. */
  texto: string;
  mensagens: Mensagem[];
}

/**
 * Pede uma resposta em JSON e valida com Zod. Se vier fora do formato, devolve os erros
 * ao modelo e pede de novo, até o número de tentativas.
 */
export async function gerarJson<T extends z.ZodType>(cliente: ClienteModelo, pedido: PedidoJson<T>): Promise<RespostaJson<z.infer<T>>> {
  const idioma = cliente.idioma ?? 'pt';
  const t = MENSAGENS[idioma];
  const schemaJson = schemaParaModelo(pedido.schema);
  const sistema =
    `${pedido.sistema}\n\nResponda SOMENTE com um objeto JSON válido que siga este JSON Schema, sem texto antes ou depois:\n` +
    JSON.stringify(schemaJson);
  const mensagens: Mensagem[] = [...(pedido.historico ?? []), { papel: 'user', texto: pedido.usuario }];
  let uso = USO_ZERO;
  const maximo = pedido.tentativas ?? 3;

  for (let tentativa = 1; ; tentativa++) {
    const resposta = await cliente.gerar({
      sistema,
      mensagens,
      schema: schemaJson,
      nomeSchema: pedido.nomeSchema,
      ...(pedido.maxTokens ? { maxTokens: pedido.maxTokens } : {}),
    });
    uso = somarUso(uso, resposta.uso);
    if (resposta.truncada) {
      throw new ErroAgente(t.cortada);
    }
    let problema: string;
    try {
      const r = pedido.schema.safeParse(extrairJson(resposta.texto, idioma));
      if (r.success) return { dado: r.data, uso, texto: resposta.texto, mensagens: [...mensagens, { papel: 'assistant', texto: resposta.texto }] };
      problema = r.error.issues
        .slice(0, 20)
        .map((i) => `- ${i.path.join('.') || t.raiz}: ${i.message}`)
        .join('\n');
    } catch (erro) {
      problema = `- ${erro instanceof Error ? erro.message : String(erro)}`;
    }
    if (tentativa >= maximo) {
      throw new ErroAgente(t.foraDoFormato(maximo, problema));
    }
    mensagens.push(
      { papel: 'assistant', texto: resposta.texto },
      { papel: 'user', texto: `Sua resposta não seguiu o formato pedido:\n${problema}\nResponda de novo, só com o JSON corrigido e completo.` },
    );
  }
}
