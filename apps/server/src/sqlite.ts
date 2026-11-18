import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { correcoesVazias, type Correcoes, type Linguagem, type Matriz } from '@bora-mapear/core';
import type { Esforco, Evidencia, TipoProvedor } from '@bora-mapear/agentes';
import type {
  AgenteConfiguravel,
  ConfigAgente,
  EvidenciaSalva,
  Execucao,
  Fonte,
  Provedor,
  ProvedorComChave,
  StatusExecucao,
  TipoExecucao,
  CabecalhoVersao,
  Mapeamento,
  NovoMapeamento,
  RegistroCorrecao,
  Repositorio,
  ResumoMapeamento,
  Versao,
  Visao,
} from './repositorio.ts';

/** Cada item leva o banco da versão i para a i+1. Nunca edite um que já foi publicado: acrescente. */
const MIGRACOES = [
  `
CREATE TABLE IF NOT EXISTS provedor (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  tipo           TEXT NOT NULL,
  url_base       TEXT NOT NULL,
  chave_cifrada  TEXT,
  final_chave    TEXT,
  criado_em      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS config_agente (
  agente      TEXT PRIMARY KEY,
  provedor_id TEXT REFERENCES provedor(id) ON DELETE SET NULL,
  modelo      TEXT NOT NULL DEFAULT '',
  max_tokens  INTEGER,
  esforco     TEXT
);
CREATE TABLE IF NOT EXISTS fonte (
  id            TEXT PRIMARY KEY,
  mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  tamanho       INTEGER NOT NULL,
  texto         TEXT NOT NULL,
  criado_em     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidencia (
  mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
  chave         TEXT NOT NULL,
  fonte_id      TEXT NOT NULL REFERENCES fonte(id) ON DELETE CASCADE,
  citacao       TEXT NOT NULL,
  sobre         TEXT NOT NULL,
  local         TEXT,
  nota          TEXT,
  verificada    INTEGER NOT NULL,
  PRIMARY KEY (mapeamento_id, chave)
);
CREATE TABLE IF NOT EXISTS execucao (
  id                 TEXT PRIMARY KEY,
  mapeamento_id      TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL,
  status             TEXT NOT NULL,
  entrada            TEXT NOT NULL,
  saida              TEXT,
  log                TEXT NOT NULL DEFAULT '[]',
  tokens_entrada     INTEGER NOT NULL DEFAULT 0,
  tokens_saida       INTEGER NOT NULL DEFAULT 0,
  custo              REAL,
  erro               TEXT,
  aplicada_na_versao INTEGER,
  criado_em          TEXT NOT NULL,
  concluido_em       TEXT
);
CREATE INDEX IF NOT EXISTS execucao_por_mapeamento ON execucao (mapeamento_id, criado_em);
ALTER TABLE mapeamento ADD COLUMN proxima_evidencia INTEGER NOT NULL DEFAULT 1;
`,
];

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS mapeamento (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  descricao     TEXT NOT NULL DEFAULT '',
  linguagem     TEXT NOT NULL,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versao_matriz (
  mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  matriz        TEXT NOT NULL,
  autor         TEXT NOT NULL,
  mensagem      TEXT NOT NULL DEFAULT '',
  criado_em     TEXT NOT NULL,
  PRIMARY KEY (mapeamento_id, numero)
);
CREATE TABLE IF NOT EXISTS visao (
  mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
  linguagem     TEXT NOT NULL,
  correcoes     TEXT NOT NULL,
  codigo        TEXT,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (mapeamento_id, linguagem)
);
CREATE TABLE IF NOT EXISTS registro_correcao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
  linguagem     TEXT NOT NULL,
  versao        INTEGER NOT NULL,
  frases        TEXT NOT NULL,
  criado_em     TEXT NOT NULL
);
`;

type Linha = Record<string, unknown>;
const agora = () => new Date().toISOString();
const texto = (v: unknown) => String(v ?? '');

function paraMapeamento(l: Linha): Mapeamento {
  return {
    id: texto(l['id']),
    nome: texto(l['nome']),
    descricao: texto(l['descricao']),
    linguagem: texto(l['linguagem']) as Linguagem,
    criadoEm: texto(l['criado_em']),
    atualizadoEm: texto(l['atualizado_em']),
  };
}

function paraVersao(l: Linha): Versao {
  const matriz = JSON.parse(texto(l['matriz'])) as Matriz;
  return { ...paraCabecalho(l), etapas: matriz.etapas.length, matriz };
}

function paraCabecalho(l: Linha): CabecalhoVersao {
  return {
    numero: Number(l['numero']),
    autor: texto(l['autor']),
    mensagem: texto(l['mensagem']),
    criadoEm: texto(l['criado_em']),
    etapas: Number(l['etapas'] ?? 0),
  };
}

function paraVisao(l: Linha): Visao {
  return {
    linguagem: texto(l['linguagem']) as Linguagem,
    correcoes: JSON.parse(texto(l['correcoes'])) as Correcoes,
    codigo: l['codigo'] === null || l['codigo'] === undefined ? null : texto(l['codigo']),
    atualizadoEm: texto(l['atualizado_em']),
  };
}

/** Repositório em SQLite, com o módulo nativo do Node (sem dependência compilada). */
export class RepositorioSqlite implements Repositorio {
  private readonly db: DatabaseSync;

  constructor(caminho: string) {
    this.db = new DatabaseSync(caminho);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.db.exec(ESQUEMA);
    let versao = Math.max(1, Number((this.db.prepare('PRAGMA user_version').get() as Linha)['user_version'] ?? 0));
    for (; versao <= MIGRACOES.length; versao++) {
      this.transacao(() => {
        this.db.exec(MIGRACOES[versao - 1]!);
        this.db.exec(`PRAGMA user_version = ${versao + 1}`);
      });
    }
  }

  private transacao<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (erro) {
      this.db.exec('ROLLBACK');
      throw erro;
    }
  }

  async listarMapeamentos(): Promise<ResumoMapeamento[]> {
    const linhas = this.db
      .prepare(
        `SELECT m.*, v.numero AS versao_atual, json_array_length(v.matriz, '$.etapas') AS etapas
           FROM mapeamento m
           JOIN versao_matriz v ON v.mapeamento_id = m.id
            AND v.numero = (SELECT MAX(numero) FROM versao_matriz WHERE mapeamento_id = m.id)
          ORDER BY m.atualizado_em DESC`,
      )
      .all() as Linha[];
    return linhas.map((l) => ({ ...paraMapeamento(l), versaoAtual: Number(l['versao_atual']), etapas: Number(l['etapas']) }));
  }

  async obterMapeamento(id: string): Promise<Mapeamento | undefined> {
    const l = this.db.prepare('SELECT * FROM mapeamento WHERE id = ?').get(id) as Linha | undefined;
    return l ? paraMapeamento(l) : undefined;
  }

  async criarMapeamento(dados: NovoMapeamento, matriz: Matriz, autor: string, mensagem: string): Promise<Mapeamento> {
    const id = randomUUID();
    const quando = agora();
    this.transacao(() => {
      this.db
        .prepare('INSERT INTO mapeamento (id, nome, descricao, linguagem, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, dados.nome, dados.descricao, dados.linguagem, quando, quando);
      this.db
        .prepare('INSERT INTO versao_matriz (mapeamento_id, numero, matriz, autor, mensagem, criado_em) VALUES (?, 1, ?, ?, ?, ?)')
        .run(id, JSON.stringify(matriz), autor, mensagem, quando);
    });
    return { id, ...dados, criadoEm: quando, atualizadoEm: quando };
  }

  async atualizarMapeamento(id: string, campos: Partial<NovoMapeamento>): Promise<Mapeamento | undefined> {
    const atual = await this.obterMapeamento(id);
    if (!atual) return undefined;
    const novo = { ...atual, ...campos, atualizadoEm: agora() };
    this.db
      .prepare('UPDATE mapeamento SET nome = ?, descricao = ?, linguagem = ?, atualizado_em = ? WHERE id = ?')
      .run(novo.nome, novo.descricao, novo.linguagem, novo.atualizadoEm, id);
    return novo;
  }

  async apagarMapeamento(id: string): Promise<boolean> {
    return Number(this.db.prepare('DELETE FROM mapeamento WHERE id = ?').run(id).changes) > 0;
  }

  async versaoAtual(id: string): Promise<Versao | undefined> {
    const l = this.db
      .prepare('SELECT * FROM versao_matriz WHERE mapeamento_id = ? ORDER BY numero DESC LIMIT 1')
      .get(id) as Linha | undefined;
    return l ? paraVersao(l) : undefined;
  }

  async listarVersoes(id: string): Promise<CabecalhoVersao[]> {
    const linhas = this.db
      .prepare(
        `SELECT numero, autor, mensagem, criado_em, json_array_length(matriz, '$.etapas') AS etapas
           FROM versao_matriz WHERE mapeamento_id = ? ORDER BY numero DESC`,
      )
      .all(id) as Linha[];
    return linhas.map(paraCabecalho);
  }

  async obterVersao(id: string, numero: number): Promise<Versao | undefined> {
    const l = this.db
      .prepare('SELECT * FROM versao_matriz WHERE mapeamento_id = ? AND numero = ?')
      .get(id, numero) as Linha | undefined;
    return l ? paraVersao(l) : undefined;
  }

  async salvarVersao(id: string, matriz: Matriz, autor: string, mensagem: string): Promise<Versao> {
    const quando = agora();
    const numero = this.transacao(() => {
      const ultima = this.db.prepare('SELECT MAX(numero) AS n FROM versao_matriz WHERE mapeamento_id = ?').get(id) as Linha;
      const n = Number(ultima['n'] ?? 0) + 1;
      this.db
        .prepare('INSERT INTO versao_matriz (mapeamento_id, numero, matriz, autor, mensagem, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, n, JSON.stringify(matriz), autor, mensagem, quando);
      this.db.prepare('UPDATE mapeamento SET atualizado_em = ? WHERE id = ?').run(quando, id);
      return n;
    });
    return { numero, autor, mensagem, criadoEm: quando, etapas: matriz.etapas.length, matriz };
  }

  async listarVisoes(id: string): Promise<Visao[]> {
    return (this.db.prepare('SELECT * FROM visao WHERE mapeamento_id = ?').all(id) as Linha[]).map(paraVisao);
  }

  async obterVisao(id: string, linguagem: Linguagem): Promise<Visao | undefined> {
    const l = this.db
      .prepare('SELECT * FROM visao WHERE mapeamento_id = ? AND linguagem = ?')
      .get(id, linguagem) as Linha | undefined;
    return l ? paraVisao(l) : undefined;
  }

  private gravarVisao(id: string, v: Visao): Visao {
    this.transacao(() => {
      this.db
        .prepare(
          `INSERT INTO visao (mapeamento_id, linguagem, correcoes, codigo, atualizado_em) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (mapeamento_id, linguagem) DO UPDATE
             SET correcoes = excluded.correcoes, codigo = excluded.codigo, atualizado_em = excluded.atualizado_em`,
        )
        .run(id, v.linguagem, JSON.stringify(v.correcoes), v.codigo, v.atualizadoEm);
      this.db.prepare('UPDATE mapeamento SET atualizado_em = ? WHERE id = ?').run(v.atualizadoEm, id);
    });
    return v;
  }

  async salvarCorrecoes(id: string, linguagem: Linguagem, correcoes: Correcoes): Promise<Visao> {
    const atual = await this.obterVisao(id, linguagem);
    return this.gravarVisao(id, { linguagem, correcoes, codigo: atual?.codigo ?? null, atualizadoEm: agora() });
  }

  async salvarCodigo(id: string, linguagem: Linguagem, codigo: string | null): Promise<Visao> {
    const atual = await this.obterVisao(id, linguagem);
    return this.gravarVisao(id, { linguagem, correcoes: atual?.correcoes ?? correcoesVazias(), codigo, atualizadoEm: agora() });
  }

  async registrarCorrecao(id: string, linguagem: Linguagem, versao: number, frases: string[]): Promise<RegistroCorrecao> {
    const quando = agora();
    const r = this.db
      .prepare('INSERT INTO registro_correcao (mapeamento_id, linguagem, versao, frases, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run(id, linguagem, versao, JSON.stringify(frases), quando);
    return { id: Number(r.lastInsertRowid), linguagem, versao, frases, criadoEm: quando };
  }

  async listarRegistro(id: string): Promise<RegistroCorrecao[]> {
    const linhas = this.db
      .prepare('SELECT * FROM registro_correcao WHERE mapeamento_id = ? ORDER BY id DESC')
      .all(id) as Linha[];
    return linhas.map((l) => ({
      id: Number(l['id']),
      linguagem: texto(l['linguagem']) as Linguagem,
      versao: Number(l['versao']),
      frases: JSON.parse(texto(l['frases'])) as string[],
      criadoEm: texto(l['criado_em']),
    }));
  }

  // ---------------------------------------------------------------- provedores e agentes

  private paraProvedor(l: Linha): ProvedorComChave {
    return {
      id: texto(l['id']),
      nome: texto(l['nome']),
      tipo: texto(l['tipo']) as TipoProvedor,
      urlBase: texto(l['url_base']),
      temChave: Boolean(l['chave_cifrada']),
      finalChave: l['final_chave'] ? texto(l['final_chave']) : null,
      criadoEm: texto(l['criado_em']),
      chaveCifrada: l['chave_cifrada'] ? texto(l['chave_cifrada']) : null,
    };
  }

  async listarProvedores(): Promise<Provedor[]> {
    return (this.db.prepare('SELECT * FROM provedor ORDER BY criado_em').all() as Linha[]).map((l) => {
      const { chaveCifrada: _c, ...p } = this.paraProvedor(l);
      return p;
    });
  }

  async obterProvedorComChave(id: string): Promise<ProvedorComChave | undefined> {
    const l = this.db.prepare('SELECT * FROM provedor WHERE id = ?').get(id) as Linha | undefined;
    return l ? this.paraProvedor(l) : undefined;
  }

  async criarProvedor(d: { nome: string; tipo: TipoProvedor; urlBase: string; chaveCifrada: string | null; finalChave: string | null }): Promise<Provedor> {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO provedor (id, nome, tipo, url_base, chave_cifrada, final_chave, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, d.nome, d.tipo, d.urlBase, d.chaveCifrada, d.finalChave, agora());
    const { chaveCifrada: _c, ...p } = (await this.obterProvedorComChave(id))!;
    return p;
  }

  async atualizarProvedor(
    id: string,
    campos: Partial<{ nome: string; urlBase: string; chaveCifrada: string | null; finalChave: string | null }>,
  ): Promise<Provedor | undefined> {
    const atual = await this.obterProvedorComChave(id);
    if (!atual) return undefined;
    const novo = { ...atual, ...campos };
    this.db
      .prepare('UPDATE provedor SET nome = ?, url_base = ?, chave_cifrada = ?, final_chave = ? WHERE id = ?')
      .run(novo.nome, novo.urlBase, novo.chaveCifrada, novo.finalChave, id);
    const { chaveCifrada: _c, ...p } = (await this.obterProvedorComChave(id))!;
    return p;
  }

  async apagarProvedor(id: string): Promise<boolean> {
    return Number(this.db.prepare('DELETE FROM provedor WHERE id = ?').run(id).changes) > 0;
  }

  async listarConfigAgentes(): Promise<ConfigAgente[]> {
    return (this.db.prepare('SELECT * FROM config_agente').all() as Linha[]).map((l) => ({
      agente: texto(l['agente']) as AgenteConfiguravel,
      provedorId: l['provedor_id'] ? texto(l['provedor_id']) : null,
      modelo: texto(l['modelo']),
      maxTokens: l['max_tokens'] === null || l['max_tokens'] === undefined ? null : Number(l['max_tokens']),
      esforco: l['esforco'] ? (texto(l['esforco']) as Esforco) : null,
    }));
  }

  async salvarConfigAgente(c: ConfigAgente): Promise<ConfigAgente> {
    this.db
      .prepare(
        `INSERT INTO config_agente (agente, provedor_id, modelo, max_tokens, esforco) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (agente) DO UPDATE SET provedor_id = excluded.provedor_id, modelo = excluded.modelo,
           max_tokens = excluded.max_tokens, esforco = excluded.esforco`,
      )
      .run(c.agente, c.provedorId, c.modelo, c.maxTokens, c.esforco);
    return c;
  }

  // ---------------------------------------------------------------- fontes e evidências

  private paraFonte(l: Linha): Fonte {
    return {
      id: texto(l['id']),
      nome: texto(l['nome']),
      tipo: texto(l['tipo']),
      tamanho: Number(l['tamanho']),
      caracteres: Number(l['caracteres']),
      evidencias: Number(l['evidencias'] ?? 0),
      criadoEm: texto(l['criado_em']),
    };
  }

  private readonly SELECT_FONTE = `SELECT f.id, f.nome, f.tipo, f.tamanho, length(f.texto) AS caracteres, f.criado_em, f.texto,
      (SELECT COUNT(*) FROM evidencia e WHERE e.fonte_id = f.id) AS evidencias FROM fonte f`;

  async criarFonte(mapeamentoId: string, d: { nome: string; tipo: string; tamanho: number; texto: string }): Promise<Fonte> {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO fonte (id, mapeamento_id, nome, tipo, tamanho, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, mapeamentoId, d.nome, d.tipo, d.tamanho, d.texto, agora());
    return this.paraFonte(this.db.prepare(`${this.SELECT_FONTE} WHERE f.id = ?`).get(id) as Linha);
  }

  async listarFontes(mapeamentoId: string): Promise<Fonte[]> {
    return (this.db.prepare(`${this.SELECT_FONTE} WHERE f.mapeamento_id = ? ORDER BY f.criado_em`).all(mapeamentoId) as Linha[]).map((l) =>
      this.paraFonte(l),
    );
  }

  async obterFonte(mapeamentoId: string, fonteId: string): Promise<(Fonte & { texto: string }) | undefined> {
    const l = this.db.prepare(`${this.SELECT_FONTE} WHERE f.mapeamento_id = ? AND f.id = ?`).get(mapeamentoId, fonteId) as Linha | undefined;
    return l ? { ...this.paraFonte(l), texto: texto(l['texto']) } : undefined;
  }

  async apagarFonte(mapeamentoId: string, fonteId: string): Promise<boolean> {
    return Number(this.db.prepare('DELETE FROM fonte WHERE mapeamento_id = ? AND id = ?').run(mapeamentoId, fonteId).changes) > 0;
  }

  async listarEvidencias(mapeamentoId: string): Promise<EvidenciaSalva[]> {
    const linhas = this.db
      .prepare(
        `SELECT e.*, f.nome AS fonte FROM evidencia e JOIN fonte f ON f.id = e.fonte_id
          WHERE e.mapeamento_id = ? ORDER BY CAST(substr(e.chave, 4) AS INTEGER)`,
      )
      .all(mapeamentoId) as Linha[];
    return linhas.map((l) => {
      const e: EvidenciaSalva = {
        chave: texto(l['chave']),
        fonteId: texto(l['fonte_id']),
        fonte: texto(l['fonte']),
        citacao: texto(l['citacao']),
        sobre: texto(l['sobre']) as EvidenciaSalva['sobre'],
        verificada: Number(l['verificada']) === 1,
      };
      if (l['local']) e.local = texto(l['local']);
      if (l['nota']) e.nota = texto(l['nota']);
      return e;
    });
  }

  async substituirEvidencias(mapeamentoId: string, fonteId: string, evidencias: Array<Omit<Evidencia, 'chave' | 'fonte'>>): Promise<EvidenciaSalva[]> {
    this.transacao(() => {
      this.db.prepare('DELETE FROM evidencia WHERE mapeamento_id = ? AND fonte_id = ?').run(mapeamentoId, fonteId);
      const linha = this.db.prepare('SELECT proxima_evidencia AS n FROM mapeamento WHERE id = ?').get(mapeamentoId) as Linha;
      let n = Number(linha['n']);
      const inserir = this.db.prepare(
        'INSERT INTO evidencia (mapeamento_id, chave, fonte_id, citacao, sobre, local, nota, verificada) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      for (const e of evidencias) {
        inserir.run(mapeamentoId, `EV-${String(n++).padStart(3, '0')}`, fonteId, e.citacao, e.sobre, e.local ?? null, e.nota ?? null, e.verificada ? 1 : 0);
      }
      this.db.prepare('UPDATE mapeamento SET proxima_evidencia = ? WHERE id = ?').run(n, mapeamentoId);
    });
    return (await this.listarEvidencias(mapeamentoId)).filter((e) => e.fonteId === fonteId);
  }

  // ---------------------------------------------------------------- execuções

  private paraExecucao(l: Linha): Execucao {
    return {
      id: texto(l['id']),
      mapeamentoId: texto(l['mapeamento_id']),
      tipo: texto(l['tipo']) as TipoExecucao,
      status: texto(l['status']) as StatusExecucao,
      entrada: JSON.parse(texto(l['entrada'])) as unknown,
      saida: l['saida'] ? (JSON.parse(texto(l['saida'])) as unknown) : null,
      log: JSON.parse(texto(l['log'])) as string[],
      tokensEntrada: Number(l['tokens_entrada']),
      tokensSaida: Number(l['tokens_saida']),
      custo: l['custo'] === null || l['custo'] === undefined ? null : Number(l['custo']),
      erro: l['erro'] ? texto(l['erro']) : null,
      aplicadaNaVersao: l['aplicada_na_versao'] === null || l['aplicada_na_versao'] === undefined ? null : Number(l['aplicada_na_versao']),
      criadoEm: texto(l['criado_em']),
      concluidoEm: l['concluido_em'] ? texto(l['concluido_em']) : null,
    };
  }

  async criarExecucao(mapeamentoId: string, tipo: TipoExecucao, entrada: unknown): Promise<Execucao> {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO execucao (id, mapeamento_id, tipo, status, entrada, criado_em) VALUES (?, ?, ?, 'rodando', ?, ?)")
      .run(id, mapeamentoId, tipo, JSON.stringify(entrada ?? null), agora());
    return (await this.obterExecucao(id))!;
  }

  async atualizarExecucao(id: string, c: Partial<Omit<Execucao, 'id' | 'mapeamentoId' | 'tipo' | 'criadoEm'>>): Promise<void> {
    const colunas: Record<string, unknown> = {
      status: c.status,
      saida: c.saida === undefined ? undefined : JSON.stringify(c.saida),
      log: c.log === undefined ? undefined : JSON.stringify(c.log),
      tokens_entrada: c.tokensEntrada,
      tokens_saida: c.tokensSaida,
      custo: c.custo,
      erro: c.erro,
      aplicada_na_versao: c.aplicadaNaVersao,
      concluido_em: c.concluidoEm,
    };
    const usadas = Object.entries(colunas).filter(([, v]) => v !== undefined);
    if (!usadas.length) return;
    this.db
      .prepare(`UPDATE execucao SET ${usadas.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`)
      .run(...usadas.map(([, v]) => v as string | number | null), id);
  }

  async obterExecucao(id: string): Promise<Execucao | undefined> {
    const l = this.db.prepare('SELECT * FROM execucao WHERE id = ?').get(id) as Linha | undefined;
    return l ? this.paraExecucao(l) : undefined;
  }

  async listarExecucoes(mapeamentoId: string, limite = 20): Promise<Execucao[]> {
    return (this.db.prepare('SELECT * FROM execucao WHERE mapeamento_id = ? ORDER BY criado_em DESC LIMIT ?').all(mapeamentoId, limite) as Linha[]).map((l) =>
      this.paraExecucao(l),
    );
  }

  async marcarInterrompidas(): Promise<number> {
    const r = this.db
      .prepare("UPDATE execucao SET status = 'falhou', erro = 'O servidor parou antes de a execução terminar.', concluido_em = ? WHERE status = 'rodando'")
      .run(agora());
    return Number(r.changes);
  }

  fechar(): void {
    this.db.close();
  }
}
