import { PGlite, type Transaction } from '@electric-sql/pglite';
import { RepositorioSqlite } from '../src/sqlite.ts';
import { RepositorioPostgres, type BancoSql, type ClienteSql } from '../src/postgres.ts';
import type { Repositorio } from '../src/repositorio.ts';

/** O mesmo contrato do node-postgres, sobre o PGlite (Postgres em WebAssembly, dentro do processo). */
function bancoPglite(db: PGlite): BancoSql {
  const consultar = async (q: PGlite | Transaction, sql: string, p: unknown[] = []) => {
    const r = await q.query<Record<string, unknown>>(sql, p);
    return { linhas: r.rows, afetadas: r.affectedRows ?? 0 };
  };
  const cliente = (q: PGlite | Transaction): ClienteSql => ({ consultar: (sql, p) => consultar(q, sql, p) });
  return {
    ...cliente(db),
    transacao: (fn) => db.transaction((tx) => fn(cliente(tx))),
    // O PGlite é compartilhado entre os testes; quem fecha é o processo.
    fechar: async () => {},
  };
}

let pglite: PGlite | undefined;

/** Toda a bateria da API roda nos dois bancos. */
export const BANCOS: Array<{ nome: string; criar: () => Promise<Repositorio> }> = [
  { nome: 'SQLite', criar: async () => new RepositorioSqlite(':memory:') },
  {
    nome: 'Postgres (PGlite)',
    criar: async () => {
      pglite ??= new PGlite();
      const repo = await RepositorioPostgres.criar(bancoPglite(pglite));
      await pglite.exec('TRUNCATE mapeamento, provedor, config_agente, configuracao RESTART IDENTITY CASCADE');
      return repo;
    },
  },
];
