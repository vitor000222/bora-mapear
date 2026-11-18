import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  LINGUAGENS,
  correcoesVazias,
  descreverMudanca,
  lerMatriz,
  matrizJsonSchema,
  validarMatriz,
  type Correcoes,
  type Linguagem,
  type Matriz,
} from '@bora-mapear/core';
import type { Repositorio } from './repositorio.ts';
import { MODELOS, matrizInicial } from './modelos.ts';
import { corpo, ErroHttp } from './http.ts';
import { registrarRotasIa } from './rotas-ia.ts';
import { Cofre } from './segredo.ts';
import { Executor } from './execucoes.ts';

export { ErroHttp } from './http.ts';

const Linguagem = z.enum(LINGUAGENS);

const NovoMapeamento = z.object({
  nome: z.string().trim().min(1, 'Dê um nome ao mapeamento.').max(200),
  descricao: z.string().max(2000).default(''),
  linguagem: Linguagem.default('bpmn'),
  modelo: z.enum(MODELOS).default('em-branco'),
});

const EdicaoMapeamento = z.object({
  nome: z.string().trim().min(1).max(200).optional(),
  descricao: z.string().max(2000).optional(),
  linguagem: Linguagem.optional(),
});

const NovaVersao = z.object({
  matriz: z.unknown(),
  mensagem: z.string().max(500).default(''),
});

const Ponto = z.object({ x: z.number(), y: z.number() });
const Caixa = z.object({ x: z.number(), y: z.number(), largura: z.number(), altura: z.number() });
const CorrecoesSchema = z.object({
  versao: z.literal(1),
  nos: z.record(
    z.string(),
    z.object({
      x: z.number().optional(),
      y: z.number().optional(),
      largura: z.number().optional(),
      altura: z.number().optional(),
      corFundo: z.string().max(40).optional(),
      corBorda: z.string().max(40).optional(),
    }),
  ),
  arestas: z.record(z.string(), z.object({ pontos: z.array(Ponto) })),
  raias: z.record(z.string(), Caixa.partial()),
  pool: Caixa.partial().optional(),
});

const NovoCodigo = z.object({ codigo: z.string().max(200_000).nullable() });

function matrizOuErro(dado: unknown) {
  try {
    return lerMatriz(dado);
  } catch (erro) {
    throw new ErroHttp(422, erro instanceof Error ? erro.message : 'Matriz fora do formato.');
  }
}

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

export interface OpcoesApp {
  /** Pasta do front-end compilado (apps/web/dist). Sem ela, só a API responde. */
  estaticos?: string;
  /** Cifra das chaves de API. Sem ele, um cofre só de memória (testes). */
  cofre?: Cofre;
  executor?: Executor;
  /** Para testes: o fetch que os agentes usam. */
  fetch?: typeof fetch;
}

export function criarApp(repo: Repositorio, opcoes: OpcoesApp = {}): Hono {
  const app = new Hono();
  const cofre = opcoes.cofre ?? Cofre.deSegredo(crypto.randomUUID());
  const executor = opcoes.executor ?? new Executor(repo);

  app.onError((erro, c) => {
    if (erro instanceof ErroHttp) return c.json({ erro: erro.message, detalhes: erro.detalhes ?? null }, erro.status);
    console.error(erro);
    return c.json({ erro: 'Erro interno no servidor.' }, 500);
  });

  const exigirMapeamento = async (id: string) => {
    const m = await repo.obterMapeamento(id);
    if (!m) throw new ErroHttp(404, 'Mapeamento não encontrado.');
    return m;
  };
  /** Quem aponta para este mapeamento como subprocesso, e para quem as etapas dele apontam. */
  const parentesco = async (id: string, matriz: Matriz) => {
    const pais: Array<{ id: string; nome: string; chave: string; etapa: string }> = [];
    for (const m of await repo.listarMapeamentos()) {
      if (m.id === id) continue;
      const v = await repo.versaoAtual(m.id);
      for (const e of v?.matriz.etapas ?? []) if (e.subprocesso === id) pais.push({ id: m.id, nome: m.nome, chave: e.chave, etapa: e.nome });
    }
    const filhos: Record<string, { id: string; nome: string } | null> = {};
    for (const e of matriz.etapas) {
      if (!e.subprocesso) continue;
      const f = await repo.obterMapeamento(e.subprocesso);
      filhos[e.chave] = f ? { id: f.id, nome: f.nome } : null;
    }
    return { pais, filhos };
  };

  const exigirLinguagem = (valor: string): Linguagem => {
    const r = Linguagem.safeParse(valor);
    if (!r.success) throw new ErroHttp(404, `Linguagem desconhecida: ${valor}. Use ${LINGUAGENS.join(', ')}.`);
    return r.data;
  };

  app.get('/api/saude', (c) => c.json({ ok: true }));
  app.get('/api/schema', (c) => c.json(matrizJsonSchema()));

  app.get('/api/mapeamentos', async (c) => c.json(await repo.listarMapeamentos()));

  app.post('/api/mapeamentos', async (c) => {
    const { modelo, ...dados } = await corpo(c, NovoMapeamento);
    const matriz = matrizInicial(modelo, dados.nome);
    const mapeamento = await repo.criarMapeamento(dados, matriz, 'pessoa', modelo === 'exemplo' ? 'Criado a partir do exemplo.' : 'Criado em branco.');
    return c.json(mapeamento, 201);
  });

  app.get('/api/mapeamentos/:id', async (c) => {
    const id = c.req.param('id');
    const mapeamento = await exigirMapeamento(id);
    const versao = (await repo.versaoAtual(id))!;
    const visoes: Record<string, { correcoes: Correcoes; codigo: string | null; atualizadoEm: string | null }> = {};
    for (const l of LINGUAGENS) visoes[l] = { correcoes: correcoesVazias(), codigo: null, atualizadoEm: null };
    for (const v of await repo.listarVisoes(id)) visoes[v.linguagem] = v;
    const { matriz, ...cabecalho } = versao;
    const { pais, filhos } = await parentesco(id, matriz);
    return c.json({ mapeamento, versao: cabecalho, matriz, validacao: validarMatriz(matriz), visoes, pais, filhos });
  });

  /** Cria o mapeamento que detalha uma etapa de subprocesso e liga os dois (versão nova do pai). */
  app.post('/api/mapeamentos/:id/subprocessos', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const { chave } = await corpo(c, z.object({ chave: z.string().min(1) }));
    const versao = (await repo.versaoAtual(id))!;
    const etapa = versao.matriz.etapas.find((e) => e.chave === chave);
    if (!etapa) throw new ErroHttp(404, `A etapa ${chave} não existe na versão atual.`);
    if (etapa.tipo !== 'subprocesso') throw new ErroHttp(400, `A etapa ${chave} não é do tipo subprocesso. Mude o tipo na Matriz antes.`);
    if (etapa.subprocesso && (await repo.obterMapeamento(etapa.subprocesso))) throw new ErroHttp(409, 'Esta etapa já tem um mapeamento filho.');
    const nome = etapa.nome.trim() || `Subprocesso ${chave}`;
    const filho = await repo.criarMapeamento({ nome, descricao: `Detalha a etapa ${chave} de "${versao.matriz.processo.nome}".`, linguagem: 'bpmn' }, matrizInicial('em-branco', nome), 'pessoa', 'Criado como subprocesso.');
    const matriz = { ...versao.matriz, etapas: versao.matriz.etapas.map((e) => (e.chave === chave ? { ...e, subprocesso: filho.id } : e)) };
    const nova = await repo.salvarVersao(id, matriz, 'pessoa', `Ligou "${nome}" (${chave}) ao mapeamento filho.`);
    return c.json({ filho, versaoPai: nova.numero }, 201);
  });

  app.patch('/api/mapeamentos/:id', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const campos = await corpo(c, EdicaoMapeamento);
    const limpos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));
    return c.json(await repo.atualizarMapeamento(id, limpos));
  });

  app.delete('/api/mapeamentos/:id', async (c) => {
    if (!(await repo.apagarMapeamento(c.req.param('id')))) throw new ErroHttp(404, 'Mapeamento não encontrado.');
    return c.body(null, 204);
  });

  app.get('/api/mapeamentos/:id/versoes', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    return c.json(await repo.listarVersoes(id));
  });

  app.get('/api/mapeamentos/:id/versoes/:numero', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const versao = await repo.obterVersao(id, Number(c.req.param('numero')));
    if (!versao) throw new ErroHttp(404, 'Versão não encontrada.');
    return c.json({ ...versao, validacao: validarMatriz(versao.matriz) });
  });

  /** Salva uma versão nova. Matriz reprovada no portão também é salva (rascunho); a validação volta junto. */
  app.post('/api/mapeamentos/:id/versoes', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const { matriz: dado, mensagem } = await corpo(c, NovaVersao);
    const matriz = matrizOuErro(dado);
    const versao = await repo.salvarVersao(id, matriz, 'pessoa', mensagem);
    const { matriz: _m, ...cabecalho } = versao;
    return c.json({ versao: cabecalho, validacao: validarMatriz(matriz) }, 201);
  });

  /** Grava as correções de uma visão e registra, em frases, o que mudou desde a última gravação. */
  app.put('/api/mapeamentos/:id/visoes/:linguagem/correcoes', async (c) => {
    const id = c.req.param('id');
    const linguagem = exigirLinguagem(c.req.param('linguagem'));
    await exigirMapeamento(id);
    const { correcoes } = await corpo(c, z.object({ correcoes: CorrecoesSchema }));
    const versao = (await repo.versaoAtual(id))!;
    const antes = (await repo.obterVisao(id, linguagem))?.correcoes ?? correcoesVazias();
    const frases = descreverMudanca(versao.matriz, antes, correcoes as Correcoes);
    const visao = await repo.salvarCorrecoes(id, linguagem, correcoes as Correcoes);
    const registro = frases.length ? await repo.registrarCorrecao(id, linguagem, versao.numero, frases) : null;
    return c.json({ visao, registro });
  });

  app.put('/api/mapeamentos/:id/visoes/:linguagem/codigo', async (c) => {
    const id = c.req.param('id');
    const linguagem = exigirLinguagem(c.req.param('linguagem'));
    if (linguagem !== 'mermaid') throw new ErroHttp(400, 'Só a visão Mermaid aceita código editado à mão por enquanto.');
    await exigirMapeamento(id);
    const { codigo } = await corpo(c, NovoCodigo);
    const visao = await repo.salvarCodigo(id, linguagem, codigo);
    const versao = (await repo.versaoAtual(id))!;
    const registro = await repo.registrarCorrecao(id, linguagem, versao.numero, [
      codigo === null ? 'Voltou o código Mermaid ao gerado pela matriz.' : 'Editou o código Mermaid à mão.',
    ]);
    return c.json({ visao, registro });
  });

  app.get('/api/mapeamentos/:id/registro', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    return c.json(await repo.listarRegistro(id));
  });

  registrarRotasIa(app, { repo, cofre, executor, ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}) });

  app.all('/api/*', () => {
    throw new ErroHttp(404, 'Rota não encontrada.');
  });

  if (opcoes.estaticos) {
    const raiz = normalize(opcoes.estaticos);
    app.get('*', async (c) => {
      const pedido = decodeURIComponent(new URL(c.req.url).pathname);
      let arquivo = normalize(join(raiz, pedido));
      if (!arquivo.startsWith(raiz + sep) && arquivo !== raiz) return c.notFound();
      const info = await stat(arquivo).catch(() => undefined);
      if (!info?.isFile()) arquivo = join(raiz, 'index.html');
      const conteudo = await readFile(arquivo).catch(() => undefined);
      if (!conteudo) return c.notFound();
      return c.body(conteudo, 200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
    });
  }

  return app;
}
