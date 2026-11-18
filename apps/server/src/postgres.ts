import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { correcoesVazias, type Correcoes, type Linguagem, type Matriz } from '@bora-mapear/core';
import type { Esforco, Evidencia, TipoProvedor } from '@bora-mapear/agentes';
import type {
  AgenteConfiguravel,
  CabecalhoVersao,
  ConfigAgente,
  EvidenciaSalva,
  Execucao,
  Fonte,
  Mapeamento,
  NovoMapeamento,
  Provedor,
  ProvedorComChave,
  RegistroCorrecao,
  Repositorio,
  ResumoMapeamento,
  StatusExecucao,
  TipoExecucao,
  Versao,
  Visao,
} from './repositorio.ts';

type Linha = Record<string, unknown>;

/** O mínimo de um cliente SQL com parâmetros $1, $2…: o node-postgres em produção, o PGlite nos testes. */
export interface ClienteSql {
  consultar(sql: string, parametros?: unknown[]): Promise<{ linhas: Linha[]; afetadas: number }>;
}

export interface BancoSql extends ClienteSql {
  transacao<T>(fn: (q: ClienteSql) => Promise<T>): Promise<T>;
  fechar(): Promise<void>;
}

/** Postgres de verdade, por DATABASE_URL. */
export function bancoPostgres(url: string): BancoSql {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const consultar = async (c: pg.Pool | pg.PoolClient, sql: string, parametros: unknown[] = []) => {
    const r = await c.query(sql, parametros);
    return { linhas: r.rows as Linha[], afetadas: r.rowCount ?? 0 };
  };
  return {
    consultar: (sql, p) => consultar(pool, sql, p),
    async transacao(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({ consultar: (sql, p) => consultar(c, sql, p) });
        await c.query('COMMIT');
        return r;
      } catch (erro) {
        await c.query('ROLLBACK');
        throw erro;
      } finally {
        c.release();
      }
    },
    fechar: () => pool.end(),
  };
}

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS bora_esquema (versao INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS mapeamento (
     id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '', linguagem TEXT NOT NULL,
     criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, proxima_evidencia INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS versao_matriz (
     mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE, numero INTEGER NOT NULL,
     matriz JSONB NOT NULL, autor TEXT NOT NULL, mensagem TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL,
     PRIMARY KEY (mapeamento_id, numero))`,
  `CREATE TABLE IF NOT EXISTS visao (
     mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE, linguagem TEXT NOT NULL,
     correcoes JSONB NOT NULL, codigo TEXT, atualizado_em TEXT NOT NULL, PRIMARY KEY (mapeamento_id, linguagem))`,
  `CREATE TABLE IF NOT EXISTS registro_correcao (
     id BIGSERIAL PRIMARY KEY, mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
     linguagem TEXT NOT NULL, versao INTEGER NOT NULL, frases JSONB NOT NULL, criado_em TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS provedor (
     id TEXT PRIMARY KEY, nome TEXT NOT NULL, tipo TEXT NOT NULL, url_base TEXT NOT NULL,
     chave_cifrada TEXT, final_chave TEXT, criado_em TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS config_agente (
     agente TEXT PRIMARY KEY, provedor_id TEXT REFERENCES provedor(id) ON DELETE SET NULL,
     modelo TEXT NOT NULL DEFAULT '', max_tokens INTEGER, esforco TEXT)`,
  `CREATE TABLE IF NOT EXISTS fonte (
     id TEXT PRIMARY KEY, mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
     nome TEXT NOT NULL, tipo TEXT NOT NULL, tamanho INTEGER NOT NULL, texto TEXT NOT NULL, criado_em TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS evidencia (
     mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE, chave TEXT NOT NULL,
     fonte_id TEXT NOT NULL REFERENCES fonte(id) ON DELETE CASCADE, citacao TEXT NOT NULL, sobre TEXT NOT NULL,
     local TEXT, nota TEXT, verificada BOOLEAN NOT NULL, PRIMARY KEY (mapeamento_id, chave))`,
  `CREATE TABLE IF NOT EXISTS execucao (
     id TEXT PRIMARY KEY, mapeamento_id TEXT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
     tipo TEXT NOT NULL, status TEXT NOT NULL, entrada JSONB, saida JSONB, log JSONB NOT NULL DEFAULT '[]',
     tokens_entrada INTEGER NOT NULL DEFAULT 0, tokens_saida INTEGER NOT NULL DEFAULT 0, custo DOUBLE PRECISION,
     erro TEXT, aplicada_na_versao INTEGER, criado_em TEXT NOT NULL, concluido_em TEXT)`,
  `CREATE INDEX IF NOT EXISTS execucao_por_mapeamento ON execucao (mapeamento_id, criado_em)`,
  `CREATE TABLE IF NOT EXISTS configuracao (chave TEXT PRIMARY KEY, valor JSONB NOT NULL)`,
];

/** Cada item leva o esquema da versão i para a i+1. Nunca edite um já publicado: acrescente. */
const MIGRACOES: string[][] = [];

const agora = () => new Date().toISOString();
const texto = (v: unknown) => String(v ?? '');
const json = (v: unknown) => JSON.stringify(v ?? null);
const numeroOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

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

function paraCabecalho(l: Linha): CabecalhoVersao {
  return { numero: Number(l['numero']), autor: texto(l['autor']), mensagem: texto(l['mensagem']), criadoEm: texto(l['criado_em']), etapas: Number(l['etapas'] ?? 0) };
}

function paraVersao(l: Linha): Versao {
  const matriz = l['matriz'] as Matriz;
  return { ...paraCabecalho(l), etapas: matriz.etapas.length, matriz };
}

function paraVisao(l: Linha): Visao {
  return {
    linguagem: texto(l['linguagem']) as Linguagem,
    correcoes: l['correcoes'] as Correcoes,
    codigo: l['codigo'] === null || l['codigo'] === undefined ? null : texto(l['codigo']),
    atualizadoEm: texto(l['atualizado_em']),
  };
}

function paraRegistro(l: Linha): RegistroCorrecao {
  return { id: Number(l['id']), linguagem: texto(l['linguagem']) as Linguagem, versao: Number(l['versao']), frases: l['frases'] as string[], criadoEm: texto(l['criado_em']) };
}

function paraProvedor(l: Linha): ProvedorComChave {
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

const semChave = ({ chaveCifrada: _c, ...p }: ProvedorComChave): Provedor => p;

function paraFonte(l: Linha): Fonte {
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

function paraExecucao(l: Linha): Execucao {
  return {
    id: texto(l['id']),
    mapeamentoId: texto(l['mapeamento_id']),
    tipo: texto(l['tipo']) as TipoExecucao,
    status: texto(l['status']) as StatusExecucao,
    entrada: l['entrada'] ?? null,
    saida: l['saida'] ?? null,
    log: (l['log'] as string[]) ?? [],
    tokensEntrada: Number(l['tokens_entrada']),
    tokensSaida: Number(l['tokens_saida']),
    custo: numeroOuNulo(l['custo']),
    erro: l['erro'] ? texto(l['erro']) : null,
    aplicadaNaVersao: numeroOuNulo(l['aplicada_na_versao']),
    criadoEm: texto(l['criado_em']),
    concluidoEm: l['concluido_em'] ? texto(l['concluido_em']) : null,
  };
}

const SELECT_FONTE = `SELECT f.id, f.nome, f.tipo, f.tamanho, length(f.texto) AS caracteres, f.criado_em, f.texto,
  (SELECT COUNT(*) FROM evidencia e WHERE e.fonte_id = f.id) AS evidencias FROM fonte f`;

/** Repositório em Postgres. Mesmo contrato do SQLite; JSON guardado como JSONB. */
export class RepositorioPostgres implements Repositorio {
  private readonly banco: BancoSql;

  private constructor(banco: BancoSql) {
    this.banco = banco;
  }

  /** Cria o esquema (idempotente) e aplica as migrações pendentes. */
  static async criar(banco: BancoSql): Promise<RepositorioPostgres> {
    await banco.transacao(async (q) => {
      for (const sql of ESQUEMA) await q.consultar(sql);
      const { linhas } = await q.consultar('SELECT versao FROM bora_esquema LIMIT 1');
      let versao = linhas.length ? Number(linhas[0]!['versao']) : 1;
      if (!linhas.length) await q.consultar('INSERT INTO bora_esquema (versao) VALUES (1)');
      for (; versao <= MIGRACOES.length; versao++) {
        for (const sql of MIGRACOES[versao - 1]!) await q.consultar(sql);
        await q.consultar('UPDATE bora_esquema SET versao = $1', [versao + 1]);
      }
    });
    return new RepositorioPostgres(banco);
  }

  private async um(sql: string, p: unknown[] = []): Promise<Linha | undefined> {
    return (await this.banco.consultar(sql, p)).linhas[0];
  }

  private async todos(sql: string, p: unknown[] = []): Promise<Linha[]> {
    return (await this.banco.consultar(sql, p)).linhas;
  }

  async listarMapeamentos(): Promise<ResumoMapeamento[]> {
    const linhas = await this.todos(
      `SELECT m.*, v.numero AS versao_atual, jsonb_array_length(v.matriz->'etapas') AS etapas
         FROM mapeamento m
         JOIN versao_matriz v ON v.mapeamento_id = m.id
          AND v.numero = (SELECT MAX(numero) FROM versao_matriz WHERE mapeamento_id = m.id)
        ORDER BY m.atualizado_em DESC`,
    );
    return linhas.map((l) => ({ ...paraMapeamento(l), versaoAtual: Number(l['versao_atual']), etapas: Number(l['etapas']) }));
  }

  async obterMapeamento(id: string): Promise<Mapeamento | undefined> {
    const l = await this.um('SELECT * FROM mapeamento WHERE id = $1', [id]);
    return l ? paraMapeamento(l) : undefined;
  }

  async criarMapeamento(dados: NovoMapeamento, matriz: Matriz, autor: string, mensagem: string): Promise<Mapeamento> {
    const id = randomUUID();
    const quando = agora();
    await this.banco.transacao(async (q) => {
      await q.consultar('INSERT INTO mapeamento (id, nome, descricao, linguagem, criado_em, atualizado_em) VALUES ($1, $2, $3, $4, $5, $5)', [
        id,
        dados.nome,
        dados.descricao,
        dados.linguagem,
        quando,
      ]);
      await q.consultar('INSERT INTO versao_matriz (mapeamento_id, numero, matriz, autor, mensagem, criado_em) VALUES ($1, 1, $2::jsonb, $3, $4, $5)', [
        id,
        json(matriz),
        autor,
        mensagem,
        quando,
      ]);
    });
    return { id, ...dados, criadoEm: quando, atualizadoEm: quando };
  }

  async atualizarMapeamento(id: string, campos: Partial<NovoMapeamento>): Promise<Mapeamento | undefined> {
    const atual = await this.obterMapeamento(id);
    if (!atual) return undefined;
    const novo = { ...atual, ...campos, atualizadoEm: agora() };
    await this.banco.consultar('UPDATE mapeamento SET nome = $1, descricao = $2, linguagem = $3, atualizado_em = $4 WHERE id = $5', [
      novo.nome,
      novo.descricao,
      novo.linguagem,
      novo.atualizadoEm,
      id,
    ]);
    return novo;
  }

  async apagarMapeamento(id: string): Promise<boolean> {
    return (await this.banco.consultar('DELETE FROM mapeamento WHERE id = $1', [id])).afetadas > 0;
  }

  async versaoAtual(id: string): Promise<Versao | undefined> {
    const l = await this.um('SELECT * FROM versao_matriz WHERE mapeamento_id = $1 ORDER BY numero DESC LIMIT 1', [id]);
    return l ? paraVersao(l) : undefined;
  }

  async listarVersoes(id: string): Promise<CabecalhoVersao[]> {
    const linhas = await this.todos(
      `SELECT numero, autor, mensagem, criado_em, jsonb_array_length(matriz->'etapas') AS etapas
         FROM versao_matriz WHERE mapeamento_id = $1 ORDER BY numero DESC`,
      [id],
    );
    return linhas.map(paraCabecalho);
  }

  async obterVersao(id: string, numero: number): Promise<Versao | undefined> {
    const l = await this.um('SELECT * FROM versao_matriz WHERE mapeamento_id = $1 AND numero = $2', [id, numero]);
    return l ? paraVersao(l) : undefined;
  }

  async salvarVersao(id: string, matriz: Matriz, autor: string, mensagem: string): Promise<Versao> {
    const quando = agora();
    const numero = await this.banco.transacao(async (q) => {
      // Trava o mapeamento: duas gravações ao mesmo tempo não pegam o mesmo número.
      await q.consultar('SELECT id FROM mapeamento WHERE id = $1 FOR UPDATE', [id]);
      const { linhas } = await q.consultar('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM versao_matriz WHERE mapeamento_id = $1', [id]);
      const n = Number(linhas[0]!['n']);
      await q.consultar('INSERT INTO versao_matriz (mapeamento_id, numero, matriz, autor, mensagem, criado_em) VALUES ($1, $2, $3::jsonb, $4, $5, $6)', [
        id,
        n,
        json(matriz),
        autor,
        mensagem,
        quando,
      ]);
      await q.consultar('UPDATE mapeamento SET atualizado_em = $1 WHERE id = $2', [quando, id]);
      return n;
    });
    return { numero, autor, mensagem, criadoEm: quando, etapas: matriz.etapas.length, matriz };
  }

  async listarVisoes(id: string): Promise<Visao[]> {
    return (await this.todos('SELECT * FROM visao WHERE mapeamento_id = $1', [id])).map(paraVisao);
  }

  async obterVisao(id: string, linguagem: Linguagem): Promise<Visao | undefined> {
    const l = await this.um('SELECT * FROM visao WHERE mapeamento_id = $1 AND linguagem = $2', [id, linguagem]);
    return l ? paraVisao(l) : undefined;
  }

  private async gravarVisao(id: string, v: Visao): Promise<Visao> {
    await this.banco.transacao(async (q) => {
      await q.consultar(
        `INSERT INTO visao (mapeamento_id, linguagem, correcoes, codigo, atualizado_em) VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (mapeamento_id, linguagem) DO UPDATE
           SET correcoes = excluded.correcoes, codigo = excluded.codigo, atualizado_em = excluded.atualizado_em`,
        [id, v.linguagem, json(v.correcoes), v.codigo, v.atualizadoEm],
      );
      await q.consultar('UPDATE mapeamento SET atualizado_em = $1 WHERE id = $2', [v.atualizadoEm, id]);
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
    const l = await this.um(
      'INSERT INTO registro_correcao (mapeamento_id, linguagem, versao, frases, criado_em) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id',
      [id, linguagem, versao, json(frases), quando],
    );
    return { id: Number(l!['id']), linguagem, versao, frases, criadoEm: quando };
  }

  async listarRegistro(id: string): Promise<RegistroCorrecao[]> {
    return (await this.todos('SELECT * FROM registro_correcao WHERE mapeamento_id = $1 ORDER BY id DESC', [id])).map(paraRegistro);
  }

  async listarRegistroGeral(limite: number): Promise<RegistroCorrecao[]> {
    return (await this.todos('SELECT * FROM registro_correcao ORDER BY id DESC LIMIT $1', [limite])).map(paraRegistro);
  }

  async obterConfiguracao<T>(chave: string): Promise<T | undefined> {
    const l = await this.um('SELECT valor FROM configuracao WHERE chave = $1', [chave]);
    return l ? (l['valor'] as T) : undefined;
  }

  async salvarConfiguracao(chave: string, valor: unknown): Promise<void> {
    await this.banco.consultar('INSERT INTO configuracao (chave, valor) VALUES ($1, $2::jsonb) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor', [chave, json(valor)]);
  }

  async listarProvedores(): Promise<Provedor[]> {
    return (await this.todos('SELECT * FROM provedor ORDER BY criado_em')).map((l) => semChave(paraProvedor(l)));
  }

  async obterProvedorComChave(id: string): Promise<ProvedorComChave | undefined> {
    const l = await this.um('SELECT * FROM provedor WHERE id = $1', [id]);
    return l ? paraProvedor(l) : undefined;
  }

  async criarProvedor(d: { nome: string; tipo: TipoProvedor; urlBase: string; chaveCifrada: string | null; finalChave: string | null }): Promise<Provedor> {
    const id = randomUUID();
    await this.banco.consultar('INSERT INTO provedor (id, nome, tipo, url_base, chave_cifrada, final_chave, criado_em) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      id,
      d.nome,
      d.tipo,
      d.urlBase,
      d.chaveCifrada,
      d.finalChave,
      agora(),
    ]);
    return semChave((await this.obterProvedorComChave(id))!);
  }

  async atualizarProvedor(
    id: string,
    campos: Partial<{ nome: string; urlBase: string; chaveCifrada: string | null; finalChave: string | null }>,
  ): Promise<Provedor | undefined> {
    const atual = await this.obterProvedorComChave(id);
    if (!atual) return undefined;
    const novo = { ...atual, ...campos };
    await this.banco.consultar('UPDATE provedor SET nome = $1, url_base = $2, chave_cifrada = $3, final_chave = $4 WHERE id = $5', [
      novo.nome,
      novo.urlBase,
      novo.chaveCifrada,
      novo.finalChave,
      id,
    ]);
    return semChave((await this.obterProvedorComChave(id))!);
  }

  async apagarProvedor(id: string): Promise<boolean> {
    return (await this.banco.consultar('DELETE FROM provedor WHERE id = $1', [id])).afetadas > 0;
  }

  async listarConfigAgentes(): Promise<ConfigAgente[]> {
    return (await this.todos('SELECT * FROM config_agente')).map((l) => ({
      agente: texto(l['agente']) as AgenteConfiguravel,
      provedorId: l['provedor_id'] ? texto(l['provedor_id']) : null,
      modelo: texto(l['modelo']),
      maxTokens: numeroOuNulo(l['max_tokens']),
      esforco: l['esforco'] ? (texto(l['esforco']) as Esforco) : null,
    }));
  }

  async salvarConfigAgente(c: ConfigAgente): Promise<ConfigAgente> {
    await this.banco.consultar(
      `INSERT INTO config_agente (agente, provedor_id, modelo, max_tokens, esforco) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (agente) DO UPDATE SET provedor_id = excluded.provedor_id, modelo = excluded.modelo,
         max_tokens = excluded.max_tokens, esforco = excluded.esforco`,
      [c.agente, c.provedorId, c.modelo, c.maxTokens, c.esforco],
    );
    return c;
  }

  async criarFonte(mapeamentoId: string, d: { nome: string; tipo: string; tamanho: number; texto: string }): Promise<Fonte> {
    const id = randomUUID();
    await this.banco.consultar('INSERT INTO fonte (id, mapeamento_id, nome, tipo, tamanho, texto, criado_em) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      id,
      mapeamentoId,
      d.nome,
      d.tipo,
      d.tamanho,
      d.texto,
      agora(),
    ]);
    return paraFonte((await this.um(`${SELECT_FONTE} WHERE f.id = $1`, [id]))!);
  }

  async listarFontes(mapeamentoId: string): Promise<Fonte[]> {
    return (await this.todos(`${SELECT_FONTE} WHERE f.mapeamento_id = $1 ORDER BY f.criado_em`, [mapeamentoId])).map(paraFonte);
  }

  async obterFonte(mapeamentoId: string, fonteId: string): Promise<(Fonte & { texto: string }) | undefined> {
    const l = await this.um(`${SELECT_FONTE} WHERE f.mapeamento_id = $1 AND f.id = $2`, [mapeamentoId, fonteId]);
    return l ? { ...paraFonte(l), texto: texto(l['texto']) } : undefined;
  }

  async apagarFonte(mapeamentoId: string, fonteId: string): Promise<boolean> {
    return (await this.banco.consultar('DELETE FROM fonte WHERE mapeamento_id = $1 AND id = $2', [mapeamentoId, fonteId])).afetadas > 0;
  }

  async listarEvidencias(mapeamentoId: string): Promise<EvidenciaSalva[]> {
    const linhas = await this.todos(
      `SELECT e.*, f.nome AS fonte FROM evidencia e JOIN fonte f ON f.id = e.fonte_id
        WHERE e.mapeamento_id = $1 ORDER BY CAST(substr(e.chave, 4) AS INTEGER)`,
      [mapeamentoId],
    );
    return linhas.map((l) => {
      const e: EvidenciaSalva = {
        chave: texto(l['chave']),
        fonteId: texto(l['fonte_id']),
        fonte: texto(l['fonte']),
        citacao: texto(l['citacao']),
        sobre: texto(l['sobre']) as EvidenciaSalva['sobre'],
        verificada: Boolean(l['verificada']),
      };
      if (l['local']) e.local = texto(l['local']);
      if (l['nota']) e.nota = texto(l['nota']);
      return e;
    });
  }

  async substituirEvidencias(mapeamentoId: string, fonteId: string, evidencias: Array<Omit<Evidencia, 'chave' | 'fonte'>>): Promise<EvidenciaSalva[]> {
    await this.banco.transacao(async (q) => {
      await q.consultar('DELETE FROM evidencia WHERE mapeamento_id = $1 AND fonte_id = $2', [mapeamentoId, fonteId]);
      const { linhas } = await q.consultar('SELECT proxima_evidencia AS n FROM mapeamento WHERE id = $1 FOR UPDATE', [mapeamentoId]);
      let n = Number(linhas[0]!['n']);
      for (const e of evidencias) {
        await q.consultar(
          'INSERT INTO evidencia (mapeamento_id, chave, fonte_id, citacao, sobre, local, nota, verificada) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [mapeamentoId, `EV-${String(n++).padStart(3, '0')}`, fonteId, e.citacao, e.sobre, e.local ?? null, e.nota ?? null, e.verificada],
        );
      }
      await q.consultar('UPDATE mapeamento SET proxima_evidencia = $1 WHERE id = $2', [n, mapeamentoId]);
    });
    return (await this.listarEvidencias(mapeamentoId)).filter((e) => e.fonteId === fonteId);
  }

  async criarExecucao(mapeamentoId: string, tipo: TipoExecucao, entrada: unknown): Promise<Execucao> {
    const id = randomUUID();
    await this.banco.consultar("INSERT INTO execucao (id, mapeamento_id, tipo, status, entrada, criado_em) VALUES ($1, $2, $3, 'rodando', $4::jsonb, $5)", [
      id,
      mapeamentoId,
      tipo,
      json(entrada),
      agora(),
    ]);
    return (await this.obterExecucao(id))!;
  }

  async atualizarExecucao(id: string, c: Partial<Omit<Execucao, 'id' | 'mapeamentoId' | 'tipo' | 'criadoEm'>>): Promise<void> {
    const colunas: Array<[string, unknown, string?]> = [
      ['status', c.status],
      ['saida', c.saida === undefined ? undefined : json(c.saida), '::jsonb'],
      ['log', c.log === undefined ? undefined : json(c.log), '::jsonb'],
      ['tokens_entrada', c.tokensEntrada],
      ['tokens_saida', c.tokensSaida],
      ['custo', c.custo],
      ['erro', c.erro],
      ['aplicada_na_versao', c.aplicadaNaVersao],
      ['concluido_em', c.concluidoEm],
    ];
    const usadas = colunas.filter(([, v]) => v !== undefined);
    if (!usadas.length) return;
    const sets = usadas.map(([k, , cast], i) => `${k} = $${i + 1}${cast ?? ''}`).join(', ');
    await this.banco.consultar(`UPDATE execucao SET ${sets} WHERE id = $${usadas.length + 1}`, [...usadas.map(([, v]) => v), id]);
  }

  async obterExecucao(id: string): Promise<Execucao | undefined> {
    const l = await this.um('SELECT * FROM execucao WHERE id = $1', [id]);
    return l ? paraExecucao(l) : undefined;
  }

  async listarExecucoes(mapeamentoId: string, limite = 20): Promise<Execucao[]> {
    return (await this.todos('SELECT * FROM execucao WHERE mapeamento_id = $1 ORDER BY criado_em DESC LIMIT $2', [mapeamentoId, limite])).map(paraExecucao);
  }

  async marcarInterrompidas(): Promise<number> {
    const r = await this.banco.consultar(
      "UPDATE execucao SET status = 'falhou', erro = 'O servidor parou antes de a execução terminar.', concluido_em = $1 WHERE status = 'rodando'",
      [agora()],
    );
    return r.afetadas;
  }

  fechar(): Promise<void> {
    return this.banco.fechar();
  }
}
