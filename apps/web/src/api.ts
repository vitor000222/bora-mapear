import type { Correcoes, Linguagem, Matriz, ResultadoValidacao } from '@bora-mapear/core';

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
  constructor(status: number, mensagem: string, detalhes: string[] = []) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
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
    throw new ErroApi(resposta.status, erro.erro ?? `Erro ${resposta.status}`, detalhes);
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
