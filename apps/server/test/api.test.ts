import { test, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLayout, type Matriz } from '@bora-mapear/core';
import { criarApp } from '../src/app.ts';
import type { Repositorio } from '../src/repositorio.ts';
import { BANCOS } from './bancos.ts';

let repo: Repositorio;
let app: ReturnType<typeof criarApp>;

async function pedir(metodo: string, caminho: string, corpo?: unknown, idioma?: 'en' | 'pt-BR') {
  const init: RequestInit = { method: metodo, headers: idioma ? { 'Accept-Language': idioma } : {} };
  if (corpo !== undefined) {
    init.body = JSON.stringify(corpo);
    init.headers = { ...(idioma ? { 'Accept-Language': idioma } : {}), 'Content-Type': 'application/json' };
  }
  const r = await app.request(caminho, init);
  const texto = await r.text();
  return { status: r.status, dados: texto ? JSON.parse(texto) : null };
}

async function criarExemplo() {
  const { dados } = await pedir('POST', '/api/mapeamentos', { nome: 'Pedido de venda', linguagem: 'bpmn', modelo: 'exemplo' });
  return dados.id as string;
}

for (const banco of BANCOS) describe(banco.nome, () => {
beforeEach(async () => {
  repo = await banco.criar();
  app = criarApp(repo);
});
afterEach(() => repo.fechar());

test('cria em branco e abre com versão 1, matriz aprovada e visões vazias', async () => {
  const criado = await pedir('POST', '/api/mapeamentos', { nome: 'Onboarding de cliente', linguagem: 'mermaid' });
  assert.equal(criado.status, 201);
  const { status, dados } = await pedir('GET', `/api/mapeamentos/${criado.dados.id}`);
  assert.equal(status, 200);
  assert.equal(dados.mapeamento.linguagem, 'mermaid');
  assert.equal(dados.versao.numero, 1);
  assert.equal(dados.matriz.processo.id, 'onboarding-de-cliente');
  assert.equal(dados.validacao.ok, true);
  assert.deepEqual(Object.keys(dados.visoes).sort(), ['bpmn', 'mermaid', 'reactflow']);
});

test('lista com a versão atual e o número de etapas', async () => {
  await criarExemplo();
  const { dados } = await pedir('GET', '/api/mapeamentos');
  assert.equal(dados.length, 1);
  assert.equal(dados[0].versaoAtual, 1);
  assert.equal(dados[0].etapas, 15);
});

test('nova versão: salva mesmo reprovada no portão, e devolve a validação', async () => {
  const id = await criarExemplo();
  const { dados: atual } = await pedir('GET', `/api/mapeamentos/${id}`);
  const matriz: Matriz = atual.matriz;
  matriz.etapas.find((e) => e.chave === 'E02')!.proximos = [{ para: 'NAO_EXISTE' }];
  const { status, dados } = await pedir('POST', `/api/mapeamentos/${id}/versoes`, { matriz, mensagem: 'Teste' });
  assert.equal(status, 201);
  assert.equal(dados.versao.numero, 2);
  assert.equal(dados.validacao.ok, false);
  const versoes = await pedir('GET', `/api/mapeamentos/${id}/versoes`);
  assert.deepEqual(versoes.dados.map((v: { numero: number }) => v.numero), [2, 1]);
  const v1 = await pedir('GET', `/api/mapeamentos/${id}/versoes/1`);
  assert.equal(v1.dados.validacao.ok, true);
});

test('matriz fora do formato é recusada com o motivo', async () => {
  const id = await criarExemplo();
  const { status, dados } = await pedir('POST', `/api/mapeamentos/${id}/versoes`, { matriz: { versaoSchema: 1 } });
  assert.equal(status, 422);
  assert.match(dados.erro, /Matriz fora do formato/);
});

test('correções: grava, registra em frases só o que mudou, e não registra gravação igual', async () => {
  const id = await criarExemplo();
  const { dados: atual } = await pedir('GET', `/api/mapeamentos/${id}`);
  const auto = calcularLayout(atual.matriz);
  const correcoes = {
    versao: 1,
    nos: { E04: { x: auto.nos['E04']!.x + 40, y: auto.nos['E04']!.y } },
    arestas: {},
    raias: {},
  };
  const r1 = await pedir('PUT', `/api/mapeamentos/${id}/visoes/bpmn/correcoes`, { correcoes });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.dados.registro.frases, ['Moveu "Analisar crédito do cliente" (E04) 40 px para a direita.']);
  const r2 = await pedir('PUT', `/api/mapeamentos/${id}/visoes/bpmn/correcoes`, { correcoes });
  assert.equal(r2.dados.registro, null);
  const { dados } = await pedir('GET', `/api/mapeamentos/${id}`);
  assert.deepEqual(dados.visoes.bpmn.correcoes, correcoes);
  const registro = await pedir('GET', `/api/mapeamentos/${id}/registro`);
  assert.equal(registro.dados.length, 1);
});

test('código Mermaid editado à mão é guardado e pode voltar ao gerado', async () => {
  const id = await criarExemplo();
  await pedir('PUT', `/api/mapeamentos/${id}/visoes/mermaid/codigo`, { codigo: 'flowchart LR\n  A --> B' });
  let { dados } = await pedir('GET', `/api/mapeamentos/${id}`);
  assert.equal(dados.visoes.mermaid.codigo, 'flowchart LR\n  A --> B');
  await pedir('PUT', `/api/mapeamentos/${id}/visoes/mermaid/codigo`, { codigo: null });
  ({ dados } = await pedir('GET', `/api/mapeamentos/${id}`));
  assert.equal(dados.visoes.mermaid.codigo, null);
  const bpmn = await pedir('PUT', `/api/mapeamentos/${id}/visoes/bpmn/codigo`, { codigo: 'x' });
  assert.equal(bpmn.status, 400);
});

test('editar e apagar', async () => {
  const id = await criarExemplo();
  const editado = await pedir('PATCH', `/api/mapeamentos/${id}`, { nome: 'Pedido B2B', linguagem: 'reactflow' });
  assert.equal(editado.dados.nome, 'Pedido B2B');
  assert.equal(editado.dados.linguagem, 'reactflow');
  assert.equal((await pedir('DELETE', `/api/mapeamentos/${id}`)).status, 204);
  assert.equal((await pedir('GET', `/api/mapeamentos/${id}`)).status, 404);
  assert.equal((await pedir('DELETE', `/api/mapeamentos/${id}`)).status, 404);
});

test('erros claros: corpo inválido, linguagem desconhecida, rota inexistente', async () => {
  const semNome = await pedir('POST', '/api/mapeamentos', { nome: '  ' });
  assert.equal(semNome.status, 400);
  assert.match(semNome.dados.detalhes[0], /nome/);
  const id = await criarExemplo();
  const lingua = await pedir('PUT', `/api/mapeamentos/${id}/visoes/visio/correcoes`, { correcoes: {} });
  assert.equal(lingua.status, 404);
  assert.equal((await pedir('GET', '/api/nada')).status, 404);
});

test('subprocesso: cria o mapeamento filho, liga ao pai e cada um sabe do outro', async () => {
  const id = await criarExemplo();
  const { dados: atual } = await pedir('GET', `/api/mapeamentos/${id}`);
  const matriz = atual.matriz;
  matriz.etapas.find((e: { chave: string }) => e.chave === 'E07').tipo = 'subprocesso';
  await pedir('POST', `/api/mapeamentos/${id}/versoes`, { matriz, mensagem: 'E07 vira subprocesso' });
  assert.equal((await pedir('POST', `/api/mapeamentos/${id}/subprocessos`, { chave: 'E02' })).status, 400, 'E02 não é subprocesso');
  const r = await pedir('POST', `/api/mapeamentos/${id}/subprocessos`, { chave: 'E07' });
  assert.equal(r.status, 201);
  assert.equal(r.dados.filho.nome, 'Separar e embalar mercadoria');
  assert.equal(r.dados.versaoPai, 3);
  const pai = await pedir('GET', `/api/mapeamentos/${id}`);
  assert.deepEqual(pai.dados.filhos, { E07: { id: r.dados.filho.id, nome: 'Separar e embalar mercadoria' } });
  const filho = await pedir('GET', `/api/mapeamentos/${r.dados.filho.id}`);
  assert.deepEqual(filho.dados.pais, [{ id, nome: 'Pedido de venda', chave: 'E07', etapa: 'Separar e embalar mercadoria' }]);
  assert.equal((await pedir('POST', `/api/mapeamentos/${id}/subprocessos`, { chave: 'E07' })).status, 409);
});

test('importar planilha CSV', async () => {
  const { matrizParaCsv, lerMatriz } = await import('@bora-mapear/core');
  const { readFileSync } = await import('node:fs');
  const m = lerMatriz(JSON.parse(readFileSync(new URL('../../../exemplos/pedido-de-venda.json', import.meta.url), 'utf8')));
  const r = await pedir('POST', '/api/mapeamentos/importar', { nome: 'Da planilha', conteudo: matrizParaCsv(m) });
  assert.equal(r.status, 201);
  assert.equal(r.dados.validacao.ok, true);
  const ruim = await pedir('POST', '/api/mapeamentos/importar', { nome: 'X', conteudo: ['chave;tipo', 'E1;tarefa'].join('\n') });
  assert.equal(ruim.status, 422);
  assert.match(ruim.dados.erro, /nome, raia/);
  assert.equal(ruim.dados.detalhes.podeUsarIa, false);
});

test('em inglês: exemplo, portão, erros e registro seguem o Accept-Language', async () => {
  const criado = await pedir('POST', '/api/mapeamentos', { nome: 'Sales order', modelo: 'exemplo' }, 'en');
  assert.equal(criado.status, 201);
  const id = criado.dados.id as string;
  const { dados } = await pedir('GET', `/api/mapeamentos/${id}`, undefined, 'en');
  assert.equal(dados.matriz.raias[0].nome, 'Customer');
  assert.equal(dados.versao.mensagem, 'Created from the example.');

  // Portão em inglês na resposta da versão salva.
  const quebrada = structuredClone(dados.matriz) as Matriz;
  quebrada.etapas.find((e) => e.chave === 'E02')!.proximos = [];
  const salva = await pedir('POST', `/api/mapeamentos/${id}/versoes`, { matriz: quebrada }, 'en');
  assert.match(salva.dados.validacao.problemas.find((p: { codigo: string }) => p.codigo === 'BECO_SEM_SAIDA').mensagem, /has no outgoing flow/);
  // A mesma matriz, sem cabeçalho, em português.
  const pt = await pedir('GET', `/api/mapeamentos/${id}`);
  assert.match(pt.dados.validacao.problemas.find((p: { codigo: string }) => p.codigo === 'BECO_SEM_SAIDA').mensagem, /não tem saída/);

  const faltando = await pedir('GET', '/api/mapeamentos/nao-existe', undefined, 'en');
  assert.equal(faltando.status, 404);
  assert.equal(faltando.dados.erro, 'Process map not found.');
  assert.equal((await pedir('GET', '/api/mapeamentos/nao-existe')).dados.erro, 'Mapeamento não encontrado.');

  const correcoes = { versao: 1, nos: { E02: { corFundo: '#ffcc00' } }, arestas: {}, raias: {} };
  const r = await pedir('PUT', `/api/mapeamentos/${id}/visoes/bpmn/correcoes`, { correcoes }, 'en');
  assert.match(r.dados.registro.frases[0], /^Colored /);

  const branco = await pedir('POST', '/api/mapeamentos', { nome: 'Blank' }, 'en');
  const aberto = await pedir('GET', `/api/mapeamentos/${branco.dados.id}`, undefined, 'en');
  assert.deepEqual(aberto.dados.matriz.etapas.map((e: { nome: string }) => e.nome), ['Start', 'First task', 'End']);
});

test('em inglês: importar CSV avisa em inglês', async () => {
  const csv = ['key,type,name,lane,next', 'E1,Start,Begin,Sales,E2', 'E2,Unknown thing,Do it,Sales,E3', 'E3,End,Done,Sales,'].join('\n');
  const r = await pedir('POST', '/api/mapeamentos/importar', { nome: 'From sheet', conteudo: csv }, 'en');
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  assert.deepEqual(r.dados.avisos, ['Row 3: unknown type "Unknown thing"; it became "Task".']);
  const versoes = await pedir('GET', `/api/mapeamentos/${r.dados.mapeamento.id}/versoes`);
  assert.equal(versoes.dados[0].mensagem, 'Imported from a spreadsheet (CSV).');
});

});
