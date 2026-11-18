import type { Correcoes, Linguagem, Matriz } from '@bora-mapear/core';

export interface Mapeamento {
  id: string;
  nome: string;
  descricao: string;
  /** A linguagem em que o mapeamento abre. Dá para ver em qualquer outra. */
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
  /** "pessoa" ou "agente:<nome>". */
  autor: string;
  mensagem: string;
  criadoEm: string;
  etapas: number;
}

export interface Versao extends CabecalhoVersao {
  matriz: Matriz;
}

export interface Visao {
  linguagem: Linguagem;
  correcoes: Correcoes;
  /** Código editado à mão que substitui o gerado (Mermaid). */
  codigo: string | null;
  atualizadoEm: string;
}

export interface RegistroCorrecao {
  id: number;
  linguagem: Linguagem;
  versao: number;
  frases: string[];
  criadoEm: string;
}

export interface NovoMapeamento {
  nome: string;
  descricao: string;
  linguagem: Linguagem;
}

/**
 * O que o servidor precisa do banco. Assíncrono de propósito: o SQLite responde na hora,
 * mas o Postgres (fase 4) não.
 */
export interface Repositorio {
  listarMapeamentos(): Promise<ResumoMapeamento[]>;
  obterMapeamento(id: string): Promise<Mapeamento | undefined>;
  criarMapeamento(dados: NovoMapeamento, matriz: Matriz, autor: string, mensagem: string): Promise<Mapeamento>;
  atualizarMapeamento(id: string, campos: Partial<NovoMapeamento>): Promise<Mapeamento | undefined>;
  apagarMapeamento(id: string): Promise<boolean>;

  versaoAtual(id: string): Promise<Versao | undefined>;
  listarVersoes(id: string): Promise<CabecalhoVersao[]>;
  obterVersao(id: string, numero: number): Promise<Versao | undefined>;
  salvarVersao(id: string, matriz: Matriz, autor: string, mensagem: string): Promise<Versao>;

  listarVisoes(id: string): Promise<Visao[]>;
  obterVisao(id: string, linguagem: Linguagem): Promise<Visao | undefined>;
  salvarCorrecoes(id: string, linguagem: Linguagem, correcoes: Correcoes): Promise<Visao>;
  salvarCodigo(id: string, linguagem: Linguagem, codigo: string | null): Promise<Visao>;

  registrarCorrecao(id: string, linguagem: Linguagem, versao: number, frases: string[]): Promise<RegistroCorrecao>;
  listarRegistro(id: string): Promise<RegistroCorrecao[]>;

  fechar(): void;
}
