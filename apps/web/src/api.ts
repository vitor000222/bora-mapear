import type { Correcoes, EstiloVisual, Linguagem, Matriz, RegraVisual, ResultadoValidacao } from '@bora-mapear/core';

export interface Mapeamento {
  id: string;
  nome: string;
  descricao: string;
  linguagem: Linguagem;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ResumoMapeamento extends Mapeamento {
  versaoAtual: number;
  etapas: number;
}

export interface CabecalhoVersao {
  numero: number;
  autor: string;
  mensagem: string;
  criadoEm: string;
  etapas: number;
}

export interface VisaoSalva {
  correcoes: Correcoes;
  codigo: string | null;
  atualizadoEm: string | null;
}

export interface MapeamentoCompleto {
  mapeamento: Mapeamento;
  versao: CabecalhoVersao;
  matriz: Matriz;
  validacao: ResultadoValidacao;
  visoes: Record<Linguagem, VisaoSalva>;
}

export interface RegistroCorrecao {
  id: number;
  linguagem: Linguagem;
  versao: number;
  frases: string[];
  criadoEm: string;
}

export class ErroApi extends Error {
  readonly status: number;
  readonly detalhes: string[];
  /** Detalhes que não são lista de mensagens (ex.: { podeUsarIa: true }). */
  readonly extra: Record<string, unknown>;
  constructor(status: number, mensagem: string, detalhes: string[] = [], extra: Record<string, unknown> = {}) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
    this.extra = extra;
  }
}

async function pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const init: RequestInit = { method: metodo };
  if (corpo !== undefined) {
    init.body = JSON.stringify(corpo);
    init.headers = { 'Content-Type': 'application/json' };
  }
  let resposta: Response;
  try {
    resposta = await fetch(caminho, init);
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor do Bora Mapear. Ele está rodando?');
  }
  const texto = await resposta.text();
  const dados = texto ? (JSON.parse(texto) as unknown) : null;
  if (!resposta.ok) {
    const erro = (dados ?? {}) as { erro?: string; detalhes?: unknown };
    const detalhes = Array.isArray(erro.detalhes) ? erro.detalhes.map(String) : [];
    const extra = erro.detalhes && typeof erro.detalhes === 'object' && !Array.isArray(erro.detalhes) ? (erro.detalhes as Record<string, unknown>) : {};
    throw new ErroApi(resposta.status, erro.erro ?? `Erro ${resposta.status}`, detalhes, extra);
  }
  return dados as T;
}

export const api = {
  listar: () => pedir<ResumoMapeamento[]>('GET', '/api/mapeamentos'),
  criar: (dados: { nome: string; descricao: string; linguagem: Linguagem; modelo: 'em-branco' | 'exemplo' }) =>
    pedir<Mapeamento>('POST', '/api/mapeamentos', dados),
  obter: (id: string) => pedir<MapeamentoCompleto>('GET', `/api/mapeamentos/${id}`),
  editar: (id: string, campos: Partial<Pick<Mapeamento, 'nome' | 'descricao' | 'linguagem'>>) =>
    pedir<Mapeamento>('PATCH', `/api/mapeamentos/${id}`, campos),
  apagar: (id: string) => pedir<null>('DELETE', `/api/mapeamentos/${id}`),
  versoes: (id: string) => pedir<CabecalhoVersao[]>('GET', `/api/mapeamentos/${id}/versoes`),
  versao: (id: string, numero: number) =>
    pedir<CabecalhoVersao & { matriz: Matriz; validacao: ResultadoValidacao }>('GET', `/api/mapeamentos/${id}/versoes/${numero}`),
  salvarVersao: (id: string, matriz: Matriz, mensagem: string) =>
    pedir<{ versao: CabecalhoVersao; validacao: ResultadoValidacao }>('POST', `/api/mapeamentos/${id}/versoes`, { matriz, mensagem }),
  salvarCorrecoes: (id: string, linguagem: Linguagem, correcoes: Correcoes) =>
    pedir<{ registro: RegistroCorrecao | null }>('PUT', `/api/mapeamentos/${id}/visoes/${linguagem}/correcoes`, { correcoes }),
  salvarCodigo: (id: string, linguagem: Linguagem, codigo: string | null) =>
    pedir<{ registro: RegistroCorrecao | null }>('PUT', `/api/mapeamentos/${id}/visoes/${linguagem}/codigo`, { codigo }),
  registro: (id: string) => pedir<RegistroCorrecao[]>('GET', `/api/mapeamentos/${id}/registro`),
};

// ---------------------------------------------------------------- IA

export type TipoProvedor = 'openai' | 'anthropic';
export type Esforco = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type AgenteConfiguravel = 'padrao' | 'leitor' | 'mapeador' | 'revisor' | 'editor' | 'conversor' | 'visual';

export interface Provedor {
  id: string;
  nome: string;
  tipo: TipoProvedor;
  urlBase: string;
  temChave: boolean;
  finalChave: string | null;
  criadoEm: string;
}

export interface ConfigAgente {
  agente: AgenteConfiguravel;
  provedorId: string | null;
  modelo: string;
  maxTokens: number | null;
  esforco: Esforco | null;
}

export interface Fonte {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  caracteres: number;
  evidencias: number;
  criadoEm: string;
}

export interface Evidencia {
  chave: string;
  fonteId: string;
  fonte: string;
  citacao: string;
  sobre: string;
  local?: string;
  nota?: string;
  verificada: boolean;
}

export type TipoExecucao = 'ler' | 'mapear' | 'revisar' | 'editar' | 'converter';

export interface Execucao {
  id: string;
  mapeamentoId: string;
  tipo: TipoExecucao;
  status: 'rodando' | 'concluida' | 'falhou';
  entrada: Record<string, unknown> | null;
  saida: Record<string, unknown> | null;
  log: string[];
  tokensEntrada: number;
  tokensSaida: number;
  custo: number | null;
  erro: string | null;
  aplicadaNaVersao: number | null;
  criadoEm: string;
  concluidoEm: string | null;
}

async function enviarArquivos(id: string, arquivos: File[]): Promise<Fonte[]> {
  const form = new FormData();
  for (const a of arquivos) form.append('arquivos', a);
  let resposta: Response;
  try {
    resposta = await fetch(`/api/mapeamentos/${id}/fontes`, { method: 'POST', body: form });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor do Bora Mapear.');
  }
  const dados = (await resposta.json()) as unknown;
  if (!resposta.ok) {
    const erro = dados as { erro?: string; detalhes?: unknown };
    throw new ErroApi(resposta.status, erro.erro ?? `Erro ${resposta.status}`, Array.isArray(erro.detalhes) ? erro.detalhes.map(String) : []);
  }
  const avisos = resposta.headers.get('X-Bora-Avisos');
  if (avisos) throw Object.assign(new ErroApi(207, 'Alguns arquivos não foram aceitos.', decodeURIComponent(avisos).split(' | ')), { aceitos: dados as Fonte[] });
  return dados as Fonte[];
}

export const apiIa = {
  provedores: () => pedir<Provedor[]>('GET', '/api/provedores'),
  criarProvedor: (d: { nome: string; tipo: TipoProvedor; urlBase: string; chave?: string }) => pedir<Provedor>('POST', '/api/provedores', d),
  editarProvedor: (id: string, d: { nome?: string; urlBase?: string; chave?: string | null }) => pedir<Provedor>('PATCH', `/api/provedores/${id}`, d),
  apagarProvedor: (id: string) => pedir<null>('DELETE', `/api/provedores/${id}`),
  testarProvedor: (id: string, modelo: string) =>
    pedir<{ ok: boolean; ms: number; erro?: string; uso?: { tokensEntrada: number; tokensSaida: number; custo?: number } }>('POST', `/api/provedores/${id}/testar`, { modelo }),
  modelos: (id: string) => pedir<string[]>('GET', `/api/provedores/${id}/modelos`),
  agentes: () => pedir<{ agentes: ConfigAgente[]; descricoes: Record<AgenteConfiguravel, string> }>('GET', '/api/agentes'),
  salvarAgente: (c: ConfigAgente) => pedir<ConfigAgente>('PUT', `/api/agentes/${c.agente}`, c),
  fontes: (id: string) => pedir<Fonte[]>('GET', `/api/mapeamentos/${id}/fontes`),
  fonte: (id: string, fonteId: string) => pedir<Fonte & { texto: string }>('GET', `/api/mapeamentos/${id}/fontes/${fonteId}`),
  enviarArquivos,
  colarTexto: (id: string, nome: string, texto: string) => pedir<Fonte[]>('POST', `/api/mapeamentos/${id}/fontes`, { nome, texto }),
  apagarFonte: (id: string, fonteId: string) => pedir<null>('DELETE', `/api/mapeamentos/${id}/fontes/${fonteId}`),
  evidencias: (id: string) => pedir<Evidencia[]>('GET', `/api/mapeamentos/${id}/evidencias`),
  ler: (id: string, fonteIds?: string[]) => pedir<Execucao>('POST', `/api/mapeamentos/${id}/ia/ler`, fonteIds ? { fonteIds } : {}),
  mapear: (id: string, instrucoes: string) => pedir<Execucao>('POST', `/api/mapeamentos/${id}/ia/mapear`, instrucoes.trim() ? { instrucoes } : {}),
  revisar: (id: string) => pedir<Execucao>('POST', `/api/mapeamentos/${id}/ia/revisar`, {}),
  editar: (id: string, pedido: string) => pedir<Execucao>('POST', `/api/mapeamentos/${id}/ia/editar`, { pedido }),
  execucoes: (id: string) => pedir<Execucao[]>('GET', `/api/mapeamentos/${id}/execucoes`),
  aplicar: (execId: string, forcar = false) => pedir<{ versao: CabecalhoVersao }>('POST', `/api/execucoes/${execId}/aplicar`, { forcar }),
  converter: (id: string, conteudo: string) => pedir<Execucao>('POST', `/api/mapeamentos/${id}/ia/converter`, { conteudo }),
  importar: (nome: string, conteudo: string) =>
    pedir<{ mapeamento: Mapeamento; avisos: string[]; validacao: ResultadoValidacao }>('POST', '/api/mapeamentos/importar', { nome, conteudo }),
  importarComIa: (nome: string, conteudo: string) => pedir<{ mapeamento: Mapeamento; execucao: Execucao }>('POST', '/api/mapeamentos/importar-com-ia', { nome, conteudo }),
  estilo: () => pedir<EstiloVisual>('GET', '/api/estilo'),
  salvarEstilo: (e: EstiloVisual) => pedir<EstiloVisual>('PUT', '/api/estilo', e),
  aprenderEstilo: () =>
    pedir<{ estilo: EstiloVisual; observacoes: string[]; cobertura: Array<{ vale: number; acerta: number }>; exemplos: number; uso: { custo?: number } }>(
      'POST',
      '/api/estilo/aprender',
      {},
    ),
};

export type { EstiloVisual, RegraVisual };

export function formatarCusto(custo: number | null | undefined): string {
  if (custo === null || custo === undefined) return '';
  return custo < 0.01 ? '< US$ 0,01' : `US$ ${custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatarTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(n);
}

export const NOMES_LINGUAGEM: Record<Linguagem, string> = {
  bpmn: 'BPMN 2.0',
  mermaid: 'Mermaid',
  reactflow: 'React Flow',
};

export const DESCRICOES_LINGUAGEM: Record<Linguagem, string> = {
  bpmn: 'Raias, eventos e gateways. Edita no bpmn-js e exporta o XML que o Camunda abre.',
  mermaid: 'Código de texto. Bom para documentação, Markdown e wiki.',
  reactflow: 'Canvas livre: arrastar, pintar e organizar.',
};

export function formatarData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function baixar(nomeArquivo: string, conteudo: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
