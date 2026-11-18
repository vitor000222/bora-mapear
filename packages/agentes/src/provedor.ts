import Anthropic from '@anthropic-ai/sdk';
import type { Idioma } from '@bora-mapear/core';

/**
 * Dois jeitos de falar com um modelo:
 * - "openai": qualquer endpoint compatível com /chat/completions (OpenRouter, OpenAI, Groq, DeepSeek,
 *   Google Gemini, Ollama, LM Studio…). Chamado por fetch.
 * - "anthropic": a API da Anthropic, pelo SDK oficial.
 */
export type TipoProvedor = 'openai' | 'anthropic';

export interface ConfigProvedor {
  tipo: TipoProvedor;
  urlBase: string;
  chave?: string;
}

export type Esforco = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ConfigModelo {
  modelo: string;
  maxTokens?: number;
  /** Só modelos Claude recentes entendem; os outros ignoram. */
  esforco?: Esforco;
  /** Preço por milhão de tokens, para estimar custo quando o provedor não informa. */
  precoEntrada?: number;
  precoSaida?: number;
}

export interface Mensagem {
  papel: 'user' | 'assistant';
  texto: string;
}

export interface PedidoModelo {
  sistema: string;
  mensagens: Mensagem[];
  /** JSON Schema da resposta, já no subconjunto que os provedores aceitam. */
  schema?: Record<string, unknown>;
  nomeSchema?: string;
  maxTokens?: number;
}

export interface Uso {
  tokensEntrada: number;
  tokensSaida: number;
  /** Em dólares, quando o provedor informa ou há preço configurado. */
  custo?: number;
}

export interface RespostaModelo {
  texto: string;
  uso: Uso;
  /** A resposta parou no limite de tokens. */
  truncada: boolean;
}

export interface ClienteModelo {
  readonly descricao: string;
  /** Idioma das mensagens para gente ler (erros, progresso, avisos) e da saída dos agentes. Ausente = português. */
  readonly idioma?: Idioma;
  gerar(pedido: PedidoModelo): Promise<RespostaModelo>;
}

export type MotivoErro = 'chave' | 'limite' | 'pedido' | 'recusa' | 'rede' | 'provedor';

const MENSAGENS = {
  pt: {
    descricaoOpenAI: (modelo: string, url: string) => `${modelo} em ${url}`,
    descricaoAnthropic: (modelo: string) => `${modelo} na Anthropic`,
    semConexao: (url: string, detalhe: string) => `Não deu para falar com ${url}: ${detalhe}`,
    listarModelos: (status: number) => `O provedor respondeu ${status} ao listar os modelos.`,
    naoEhJson: (status: number) => `O provedor respondeu algo que não é JSON (status ${status}).`,
    recusaHttp: (motivo: MotivoErro, status: number, detalhe: string) =>
      `${motivo === 'chave' ? 'A chave foi recusada pelo provedor' : motivo === 'limite' ? 'Limite de uso do provedor atingido' : 'O provedor recusou o pedido'} (${status}): ${detalhe}`,
    semResposta: 'O provedor não devolveu nenhuma resposta.',
    modeloRecusou: (motivo: string) => `O modelo recusou: ${motivo}`,
    chaveAnthropic: 'A chave foi recusada pela Anthropic.',
    limiteAnthropic: 'Limite de uso da Anthropic atingido. Tente de novo em instantes.',
    pedidoAnthropic: (detalhe: string) => `A Anthropic recusou o pedido: ${detalhe}`,
    semConexaoAnthropic: (detalhe: string) => `Não deu para falar com a Anthropic: ${detalhe}`,
    erroAnthropic: (status: number | undefined, detalhe: string) => `Erro da Anthropic (${status}): ${detalhe}`,
    recusaSeguranca: 'O modelo recusou o pedido por política de segurança.',
  },
  en: {
    descricaoOpenAI: (modelo: string, url: string) => `${modelo} at ${url}`,
    descricaoAnthropic: (modelo: string) => `${modelo} on Anthropic`,
    semConexao: (url: string, detalhe: string) => `Could not reach ${url}: ${detalhe}`,
    listarModelos: (status: number) => `The provider answered ${status} when listing the models.`,
    naoEhJson: (status: number) => `The provider answered with something that is not JSON (status ${status}).`,
    recusaHttp: (motivo: MotivoErro, status: number, detalhe: string) =>
      `${motivo === 'chave' ? 'The provider rejected the key' : motivo === 'limite' ? 'Provider usage limit reached' : 'The provider rejected the request'} (${status}): ${detalhe}`,
    semResposta: 'The provider returned no response.',
    modeloRecusou: (motivo: string) => `The model refused: ${motivo}`,
    chaveAnthropic: 'Anthropic rejected the key.',
    limiteAnthropic: 'Anthropic usage limit reached. Try again in a moment.',
    pedidoAnthropic: (detalhe: string) => `Anthropic rejected the request: ${detalhe}`,
    semConexaoAnthropic: (detalhe: string) => `Could not reach Anthropic: ${detalhe}`,
    erroAnthropic: (status: number | undefined, detalhe: string) => `Anthropic error (${status}): ${detalhe}`,
    recusaSeguranca: 'The model refused the request under its safety policy.',
  },
} satisfies Record<Idioma, unknown>;

/** Erro do provedor, com mensagem para gente ler. Nunca carrega a chave. */
export class ErroProvedor extends Error {
  readonly motivo: MotivoErro;
  readonly status: number | undefined;
  constructor(motivo: MotivoErro, mensagem: string, status?: number) {
    super(mensagem);
    this.motivo = motivo;
    this.status = status;
  }
}

export function somarUso(a: Uso, b: Uso): Uso {
  const custo = a.custo !== undefined || b.custo !== undefined ? (a.custo ?? 0) + (b.custo ?? 0) : undefined;
  return { tokensEntrada: a.tokensEntrada + b.tokensEntrada, tokensSaida: a.tokensSaida + b.tokensSaida, ...(custo !== undefined ? { custo } : {}) };
}

export const USO_ZERO: Uso = { tokensEntrada: 0, tokensSaida: 0 };

function estimarCusto(uso: Uso, modelo: ConfigModelo): Uso {
  if (uso.custo !== undefined || modelo.precoEntrada === undefined || modelo.precoSaida === undefined) return uso;
  return { ...uso, custo: (uso.tokensEntrada * modelo.precoEntrada + uso.tokensSaida * modelo.precoSaida) / 1_000_000 };
}

const TEMPO_LIMITE_MS = 10 * 60 * 1000;

export interface OpcoesCliente {
  /** Para testes: substitui o fetch global. */
  fetch?: typeof fetch;
  /** Idioma das mensagens e da saída dos agentes. Padrão: português. */
  idioma?: Idioma;
}

const detalheDoErro = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

export function criarCliente(provedor: ConfigProvedor, modelo: ConfigModelo, opcoes: OpcoesCliente = {}): ClienteModelo {
  const idioma = opcoes.idioma ?? 'pt';
  return provedor.tipo === 'anthropic' ? clienteAnthropic(provedor, modelo, opcoes, idioma) : clienteOpenAI(provedor, modelo, opcoes, idioma);
}

/** Os modelos que o provedor oferece, para a pessoa escolher em vez de digitar. */
export async function listarModelos(provedor: ConfigProvedor, opcoes: OpcoesCliente = {}): Promise<string[]> {
  const t = MENSAGENS[opcoes.idioma ?? 'pt'];
  if (provedor.tipo === 'anthropic') {
    const cliente = new Anthropic({ apiKey: provedor.chave ?? '', ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}), maxRetries: 1 });
    const ids: string[] = [];
    try {
      for await (const m of cliente.models.list()) {
        ids.push(m.id);
        if (ids.length >= 200) break;
      }
    } catch (erro) {
      if (erro instanceof Anthropic.AuthenticationError) throw new ErroProvedor('chave', t.chaveAnthropic, 401);
      if (erro instanceof Anthropic.APIError) throw new ErroProvedor('provedor', t.erroAnthropic(erro.status, erro.message), erro.status);
      throw erro;
    }
    return ids;
  }
  const chamar = opcoes.fetch ?? fetch;
  let resposta: Response;
  try {
    resposta = await chamar(`${provedor.urlBase.replace(/\/+$/, '')}/models`, {
      headers: provedor.chave ? { Authorization: `Bearer ${provedor.chave}` } : {},
      signal: AbortSignal.timeout(30_000),
    });
  } catch (erro) {
    throw new ErroProvedor('rede', t.semConexao(provedor.urlBase, detalheDoErro(erro)));
  }
  if (!resposta.ok) {
    throw new ErroProvedor(resposta.status === 401 || resposta.status === 403 ? 'chave' : 'provedor', t.listarModelos(resposta.status), resposta.status);
  }
  const dados = (await resposta.json()) as { data?: Array<{ id?: string }>; models?: Array<{ id?: string; name?: string }> };
  return [...(dados.data ?? []), ...(dados.models ?? [])]
    .map((m) => m.id ?? ('name' in m ? m.name : undefined))
    .filter((id): id is string => Boolean(id))
    .sort()
    .slice(0, 1000);
}

// ---------------------------------------------------------------- compatível com OpenAI

type ModoJson = 'json_schema' | 'json_object' | 'nenhum';

function clienteOpenAI(provedor: ConfigProvedor, modelo: ConfigModelo, opcoes: OpcoesCliente, idioma: Idioma): ClienteModelo {
  const t = MENSAGENS[idioma];
  const chamar = opcoes.fetch ?? fetch;
  const url = `${provedor.urlBase.replace(/\/+$/, '')}/chat/completions`;
  const ehOpenRouter = /openrouter\.ai/i.test(provedor.urlBase);
  // Nem todo provedor aceita json_schema; descobre na primeira chamada e lembra.
  let modo: ModoJson = 'json_schema';

  async function enviar(pedido: PedidoModelo, modoAtual: ModoJson): Promise<Response> {
    const corpo: Record<string, unknown> = {
      model: modelo.modelo,
      messages: [
        { role: 'system', content: pedido.sistema },
        ...pedido.mensagens.map((m) => ({ role: m.papel, content: m.texto })),
      ],
      max_tokens: pedido.maxTokens ?? modelo.maxTokens ?? 16000,
    };
    if (pedido.schema && modoAtual === 'json_schema') {
      corpo['response_format'] = { type: 'json_schema', json_schema: { name: pedido.nomeSchema ?? 'resposta', schema: pedido.schema, strict: false } };
    } else if (pedido.schema && modoAtual === 'json_object') {
      corpo['response_format'] = { type: 'json_object' };
    }
    if (ehOpenRouter) corpo['usage'] = { include: true };
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provedor.chave) cabecalhos['Authorization'] = `Bearer ${provedor.chave}`;
    if (ehOpenRouter) {
      cabecalhos['X-Title'] = 'Bora Mapear';
      cabecalhos['HTTP-Referer'] = 'https://github.com/vitor000222/bora-mapear';
    }
    try {
      return await chamar(url, { method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo), signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    } catch (erro) {
      throw new ErroProvedor('rede', t.semConexao(provedor.urlBase, detalheDoErro(erro)));
    }
  }

  return {
    descricao: t.descricaoOpenAI(modelo.modelo, provedor.urlBase),
    idioma,
    async gerar(pedido) {
      let resposta = await enviar(pedido, modo);
      // Formato de resposta recusado: tenta o modo mais simples seguinte.
      while (resposta.status === 400 && pedido.schema && modo !== 'nenhum') {
        const texto = await resposta.clone().text();
        if (!/response_format|json_schema|json_object|structured/i.test(texto)) break;
        modo = modo === 'json_schema' ? 'json_object' : 'nenhum';
        resposta = await enviar(pedido, modo);
      }
      const texto = await resposta.text();
      let dados: Record<string, unknown> = {};
      try {
        dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
      } catch {
        throw new ErroProvedor('provedor', t.naoEhJson(resposta.status), resposta.status);
      }
      if (!resposta.ok) {
        const erro = dados['error'] as { message?: string } | string | undefined;
        const detalhe = typeof erro === 'string' ? erro : erro?.message ?? texto.slice(0, 300);
        const motivo: MotivoErro =
          resposta.status === 401 || resposta.status === 403 ? 'chave' : resposta.status === 429 ? 'limite' : resposta.status >= 500 ? 'provedor' : 'pedido';
        throw new ErroProvedor(motivo, t.recusaHttp(motivo, resposta.status, detalhe), resposta.status);
      }
      const escolha = (dados['choices'] as Array<{ message?: { content?: unknown; refusal?: string }; finish_reason?: string }> | undefined)?.[0];
      if (!escolha) throw new ErroProvedor('provedor', t.semResposta);
      if (escolha.message?.refusal) throw new ErroProvedor('recusa', t.modeloRecusou(escolha.message.refusal));
      const conteudo = escolha.message?.content;
      const textoResposta = typeof conteudo === 'string' ? conteudo : Array.isArray(conteudo) ? conteudo.map((p: { text?: string }) => p.text ?? '').join('') : '';
      const usage = (dados['usage'] ?? {}) as { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      const uso: Uso = {
        tokensEntrada: usage.prompt_tokens ?? 0,
        tokensSaida: usage.completion_tokens ?? 0,
        ...(typeof usage.cost === 'number' ? { custo: usage.cost } : {}),
      };
      return { texto: textoResposta, uso: estimarCusto(uso, modelo), truncada: escolha.finish_reason === 'length' };
    },
  };
}

// ---------------------------------------------------------------- Anthropic (SDK oficial)

/** Preço por milhão de tokens (entrada, saída) dos modelos atuais, para estimar o custo. */
const PRECOS_CLAUDE: Record<string, [number, number]> = {
  'claude-fable-5-2': [8, 40],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
};

/** Modelos em que o fallback do lado do servidor vale: se o modelo recusar, outro termina o pedido. */
const COM_FALLBACK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

function clienteAnthropic(provedor: ConfigProvedor, modelo: ConfigModelo, opcoes: OpcoesCliente, idioma: Idioma): ClienteModelo {
  const t = MENSAGENS[idioma];
  const cliente = new Anthropic({
    apiKey: provedor.chave ?? '',
    ...(provedor.urlBase && !/api\.anthropic\.com/.test(provedor.urlBase) ? { baseURL: provedor.urlBase } : {}),
    ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
    maxRetries: 2,
    timeout: TEMPO_LIMITE_MS,
  });
  const preco = PRECOS_CLAUDE[modelo.modelo];
  const comPreco: ConfigModelo = preco && modelo.precoEntrada === undefined ? { ...modelo, precoEntrada: preco[0], precoSaida: preco[1] } : modelo;

  return {
    descricao: t.descricaoAnthropic(modelo.modelo),
    idioma,
    async gerar(pedido) {
      const outputConfig: Anthropic.OutputConfig = {};
      if (pedido.schema) outputConfig.format = { type: 'json_schema', schema: pedido.schema };
      if (modelo.esforco) outputConfig.effort = modelo.esforco;
      const base = {
        model: modelo.modelo,
        max_tokens: pedido.maxTokens ?? modelo.maxTokens ?? 32000,
        system: pedido.sistema,
        messages: pedido.mensagens.map((m) => ({ role: m.papel, content: m.texto })),
        ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
      };
      let mensagem: { content: Array<{ type: string; text?: string }>; stop_reason: string | null; usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } };
      try {
        // Streaming: saídas grandes (uma matriz inteira) passam do tempo de uma requisição comum.
        mensagem = COM_FALLBACK.has(modelo.modelo)
          ? await cliente.beta.messages.stream({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage()
          : await cliente.messages.stream(base).finalMessage();
      } catch (erro) {
        if (erro instanceof Anthropic.AuthenticationError || erro instanceof Anthropic.PermissionDeniedError) {
          throw new ErroProvedor('chave', t.chaveAnthropic, erro.status);
        }
        if (erro instanceof Anthropic.RateLimitError) throw new ErroProvedor('limite', t.limiteAnthropic, 429);
        if (erro instanceof Anthropic.BadRequestError || erro instanceof Anthropic.NotFoundError) {
          throw new ErroProvedor('pedido', t.pedidoAnthropic(erro.message), erro.status);
        }
        if (erro instanceof Anthropic.APIConnectionError) throw new ErroProvedor('rede', t.semConexaoAnthropic(erro.message));
        if (erro instanceof Anthropic.APIError) throw new ErroProvedor('provedor', t.erroAnthropic(erro.status, erro.message), erro.status);
        throw erro;
      }
      if (mensagem.stop_reason === 'refusal') throw new ErroProvedor('recusa', t.recusaSeguranca);
      const texto = mensagem.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      const u = mensagem.usage;
      const uso: Uso = {
        tokensEntrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        tokensSaida: u.output_tokens,
      };
      return { texto, uso: estimarCusto(uso, comPreco), truncada: mensagem.stop_reason === 'max_tokens' };
    },
  };
}
