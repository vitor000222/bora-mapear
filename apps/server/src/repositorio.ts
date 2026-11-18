import type { Correcoes, Linguagem, Matriz } from '@bora-mapear/core';
import type { Esforco, Evidencia, TipoProvedor } from '@bora-mapear/agentes';

/** Provedor como a interface vê: nunca com a chave. */
export interface Provedor {
  id: string;
  nome: string;
  tipo: TipoProvedor;
  urlBase: string;
  temChave: boolean;
  /** Últimos 4 caracteres, para reconhecer a chave. */
  finalChave: string | null;
  criadoEm: string;
}

export interface ProvedorComChave extends Provedor {
  chaveCifrada: string | null;
}

/** "padrao" vale para todo agente sem configuração própria. */
export type AgenteConfiguravel = 'padrao' | 'leitor' | 'mapeador' | 'revisor' | 'editor';

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

export interface EvidenciaSalva extends Evidencia {
  fonteId: string;
}

export type StatusExecucao = 'rodando' | 'concluida' | 'falhou';
export type TipoExecucao = 'ler' | 'mapear' | 'revisar' | 'editar';

export interface Execucao {
  id: string;
  mapeamentoId: string;
  tipo: TipoExecucao;
  status: StatusExecucao;
  entrada: unknown;
  saida: unknown;
  log: string[];
  tokensEntrada: number;
  tokensSaida: number;
  custo: number | null;
  erro: string | null;
  aplicadaNaVersao: number | null;
  criadoEm: string;
  concluidoEm: string | null;
}

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

  listarProvedores(): Promise<Provedor[]>;
  obterProvedorComChave(id: string): Promise<ProvedorComChave | undefined>;
  criarProvedor(dados: { nome: string; tipo: TipoProvedor; urlBase: string; chaveCifrada: string | null; finalChave: string | null }): Promise<Provedor>;
  atualizarProvedor(
    id: string,
    campos: Partial<{ nome: string; urlBase: string; chaveCifrada: string | null; finalChave: string | null }>,
  ): Promise<Provedor | undefined>;
  apagarProvedor(id: string): Promise<boolean>;

  listarConfigAgentes(): Promise<ConfigAgente[]>;
  salvarConfigAgente(config: ConfigAgente): Promise<ConfigAgente>;

  criarFonte(mapeamentoId: string, dados: { nome: string; tipo: string; tamanho: number; texto: string }): Promise<Fonte>;
  listarFontes(mapeamentoId: string): Promise<Fonte[]>;
  obterFonte(mapeamentoId: string, fonteId: string): Promise<(Fonte & { texto: string }) | undefined>;
  apagarFonte(mapeamentoId: string, fonteId: string): Promise<boolean>;

  listarEvidencias(mapeamentoId: string): Promise<EvidenciaSalva[]>;
  /** Troca as evidências de uma fonte. As chaves novas continuam a numeração do mapeamento; nenhuma é reaproveitada. */
  substituirEvidencias(mapeamentoId: string, fonteId: string, evidencias: Array<Omit<Evidencia, 'chave' | 'fonte'>>): Promise<EvidenciaSalva[]>;

  criarExecucao(mapeamentoId: string, tipo: TipoExecucao, entrada: unknown): Promise<Execucao>;
  atualizarExecucao(id: string, campos: Partial<Omit<Execucao, 'id' | 'mapeamentoId' | 'tipo' | 'criadoEm'>>): Promise<void>;
  obterExecucao(id: string): Promise<Execucao | undefined>;
  listarExecucoes(mapeamentoId: string, limite?: number): Promise<Execucao[]>;
  /** Execuções que estavam rodando quando o servidor caiu. */
  marcarInterrompidas(): Promise<number>;

  fechar(): void;
}
