import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { correcoesVazias, type Correcoes, type Linguagem, type Matriz } from '@bora-mapear/core';
import type {
  CabecalhoVersao,
  Mapeamento,
  NovoMapeamento,
  RegistroCorrecao,
  Repositorio,
  ResumoMapeamento,
  Versao,
  Visao,
} from './repositorio.ts';

const VERSAO_DO_BANCO = 1;

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
    this.db.exec(`PRAGMA user_version = ${VERSAO_DO_BANCO}`);
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

  fechar(): void {
    this.db.close();
  }
}
