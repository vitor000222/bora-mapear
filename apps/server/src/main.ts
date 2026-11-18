import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { criarApp } from './app.ts';
import { RepositorioSqlite } from './sqlite.ts';

const raizDoProjeto = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const porta = Number(process.env['PORTA'] ?? 3737);
const host = process.env['HOST'] ?? '127.0.0.1';
const caminhoBanco = resolve(process.env['BORA_DB'] ?? resolve(raizDoProjeto, 'data/bora.db'));
const estaticos = resolve(raizDoProjeto, 'apps/web/dist');

mkdirSync(dirname(caminhoBanco), { recursive: true });
const repo = new RepositorioSqlite(caminhoBanco);
const app = criarApp(repo, existsSync(estaticos) && process.env['BORA_SEM_WEB'] !== '1' ? { estaticos } : {});

const servidor = serve({ fetch: app.fetch, port: porta, hostname: host }, (info) => {
  console.log(`Bora Mapear no ar: http://${host}:${info.port}`);
  console.log(`Banco: ${caminhoBanco}`);
});

const encerrar = () => {
  servidor.close();
  repo.fechar();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
