import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { criarApp } from './app.ts';
import { RepositorioSqlite } from './sqlite.ts';
import { bancoPostgres, RepositorioPostgres } from './postgres.ts';
import type { Repositorio } from './repositorio.ts';
import { Cofre } from './segredo.ts';
import { Executor } from './execucoes.ts';

const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const porta = Number(process.env['PORTA'] ?? 3737);
const host = process.env['HOST'] ?? '127.0.0.1';
const caminhoBanco = resolve(process.env['BORA_DB'] ?? resolve(raizDoProjeto, 'data/bora.db'));
const estaticos = resolve(raizDoProjeto, 'apps/web/dist');

mkdirSync(dirname(caminhoBanco), { recursive: true });
const urlPostgres = process.env['DATABASE_URL'];
let repo: Repositorio;
let descricaoBanco: string;
if (urlPostgres) {
  repo = await RepositorioPostgres.criar(bancoPostgres(urlPostgres));
  descricaoBanco = `Postgres em ${new URL(urlPostgres).host}`;
} else {
  repo = new RepositorioSqlite(caminhoBanco);
  descricaoBanco = caminhoBanco;
}
const cofre = Cofre.carregar(resolve(dirname(caminhoBanco), 'segredo.key'), process.env['BORA_SECRET']);
const executor = new Executor(repo);
const interrompidas = await repo.marcarInterrompidas();
if (interrompidas) console.log(`${interrompidas} execução(ões) de agente ficaram pela metade na última vez e foram marcadas como falhas.`);
const app = criarApp(repo, {
  cofre,
  executor,
  ...(existsSync(estaticos) && process.env['BORA_SEM_WEB'] !== '1' ? { estaticos } : {}),
});

const servidor = serve({ fetch: app.fetch, port: porta, hostname: host }, (info) => {
  console.log(`Bora Mapear no ar: http://${host}:${info.port}`);
  console.log(`Banco: ${descricaoBanco}`);
});

const encerrar = async () => {
  servidor.close();
  await executor.aguardar();
  await repo.fechar();
  process.exit(0);
};
process.on('SIGINT', () => void encerrar());
process.on('SIGTERM', () => void encerrar());
