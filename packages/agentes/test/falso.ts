import { readFileSync } from 'node:fs';
import { lerMatriz, type Matriz } from '@bora-mapear/core';

export interface Chamada {
  url: string;
  cabecalhos: Record<string, string>;
  corpo: Record<string, unknown>;
}

type Roteiro = (chamada: Chamada) => { status?: number; json?: unknown; sse?: string };

/** fetch falso: cada chamada consome o próximo passo do roteiro e fica registrada. */
export function fetchFalso(roteiro: Roteiro[]) {
  const chamadas: Chamada[] = [];
  const fn = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const cabecalhos: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (cabecalhos[k] = v));
    const chamada: Chamada = { url, cabecalhos, corpo: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {} };
    chamadas.push(chamada);
    const passo = roteiro[chamadas.length - 1];
    if (!passo) throw new Error(`Chamada inesperada nº ${chamadas.length}`);
    const r = passo(chamada);
    if (r.sse !== undefined) return new Response(r.sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, chamadas };
}

/** Resposta no formato /chat/completions. */
export function respostaOpenAI(conteudo: unknown, extra: { finish?: string; uso?: [number, number]; custo?: number } = {}) {
  return {
    json: {
      choices: [{ message: { role: 'assistant', content: typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo) }, finish_reason: extra.finish ?? 'stop' }],
      usage: { prompt_tokens: extra.uso?.[0] ?? 100, completion_tokens: extra.uso?.[1] ?? 50, ...(extra.custo !== undefined ? { cost: extra.custo } : {}) },
    },
  };
}

/** Resposta da Messages API da Anthropic em streaming (SSE). */
export function respostaAnthropicSse(texto: string, stop = 'end_turn'): { sse: string } {
  const evento = (tipo: string, dados: unknown) => `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
  return {
    sse:
      evento('message_start', {
        type: 'message_start',
        message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } },
      }) +
      evento('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
      evento('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: texto } }) +
      evento('content_block_stop', { type: 'content_block_stop', index: 0 }) +
      evento('message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 500 } }) +
      evento('message_stop', { type: 'message_stop' }),
  };
}

export function exemplo(): Matriz {
  return lerMatriz(JSON.parse(readFileSync(new URL('../../../exemplos/pedido-de-venda.json', import.meta.url), 'utf8')));
}
