import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  criarCliente,
  descricoesAgente,
  DESCRICOES_AGENTE,
  editar,
  ErroAgente,
  ErroProvedor,
  gerarJson,
  lerFonte,
  listarModelos,
  mapear,
  revisar,
  USO_ZERO,
  type ClienteModelo,
  type Evidencia,
} from '../src/index.ts';
import { exemplo, fetchFalso, respostaAnthropicSse, respostaOpenAI, type Chamada } from './falso.ts';

const OPENROUTER = { tipo: 'openai' as const, urlBase: 'https://openrouter.ai/api/v1', chave: 'sk-teste' };
const INSTRUCAO_INGLES = /OUTPUT LANGUAGE: ENGLISH/;

const EVIDENCIAS: Evidencia[] = ['EV-001', 'EV-002', 'EV-003', 'EV-004', 'EV-005', 'EV-006', 'EV-007', 'EV-008'].map((chave) => ({
  chave,
  fonte: 'entrevista.vtt',
  citacao: 'trecho',
  sobre: 'etapa',
  verificada: true,
}));

const sistemaDe = (c: Chamada) => (c.corpo['messages'] as Array<{ role: string; content: string }>)[0]!.content;
const ultimaMensagem = (c: Chamada) => (c.corpo['messages'] as Array<{ content: string }>).at(-1)!.content;

test('o cliente guarda o idioma; sem opção, português', () => {
  const { fn } = fetchFalso([]);
  assert.equal(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn, idioma: 'en' }).idioma, 'en');
  assert.equal(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }).idioma, 'pt');
  assert.equal(criarCliente({ tipo: 'anthropic', urlBase: 'https://api.anthropic.com', chave: 'k' }, { modelo: 'm' }, { idioma: 'en' }).idioma, 'en');
});

test('inglês: erro do provedor, recusa da Anthropic e resposta cortada em inglês; o padrão segue em português', async () => {
  const chave401 = () => fetchFalso([() => ({ status: 401, json: { error: { message: 'No auth' } } })]).fn;
  const pedido = { sistema: 's', usuario: 'u', schema: z.object({}), nomeSchema: 't' };

  const en = criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: chave401(), idioma: 'en' });
  await assert.rejects(gerarJson(en, pedido), (e: unknown) => e instanceof ErroProvedor && e.motivo === 'chave' && e.message === 'The provider rejected the key (401): No auth');
  const pt = criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: chave401() });
  await assert.rejects(gerarJson(pt, pedido), (e: unknown) => e instanceof ErroProvedor && e.message === 'A chave foi recusada pelo provedor (401): No auth');

  const anthropic = criarCliente(
    { tipo: 'anthropic', urlBase: 'https://api.anthropic.com', chave: 'k' },
    { modelo: 'claude-haiku-5-5' },
    { fetch: fetchFalso([() => respostaAnthropicSse('', 'refusal')]).fn, idioma: 'en' },
  );
  await assert.rejects(gerarJson(anthropic, pedido), (e: unknown) => e instanceof ErroProvedor && e.message === 'The model refused the request under its safety policy.');

  const cortada = criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fetchFalso([() => respostaOpenAI('{"a":', { finish: 'length' })]).fn, idioma: 'en' });
  await assert.rejects(gerarJson(cortada, pedido), (e: unknown) => e instanceof ErroAgente && /cut off at the token limit/.test(e.message));

  await assert.rejects(
    listarModelos(OPENROUTER, { fetch: fetchFalso([() => ({ status: 500, json: {} })]).fn, idioma: 'en' }),
    (e: unknown) => e instanceof ErroProvedor && e.message === 'The provider answered 500 when listing the models.',
  );
  await assert.rejects(
    listarModelos(OPENROUTER, { fetch: fetchFalso([() => ({ status: 500, json: {} })]).fn }),
    (e: unknown) => e instanceof ErroProvedor && e.message === 'O provedor respondeu 500 ao listar os modelos.',
  );
});

test('cliente sem idioma (implementação própria de ClienteModelo) vale como português', async () => {
  const cliente: ClienteModelo = { descricao: 'falso', gerar: async () => ({ texto: '{"a":', uso: USO_ZERO, truncada: true }) };
  await assert.rejects(gerarJson(cliente, { sistema: 's', usuario: 'u', schema: z.object({}), nomeSchema: 't' }), /cortada no limite de tokens/);
});

test('inglês: progresso, portão e prompt de sistema do Mapeador; o padrão não muda', async () => {
  const rodar = async (idioma?: 'en') => {
    const quebrada = exemplo();
    quebrada.etapas.find((e) => e.chave === 'E02')!.proximos = [{ para: 'E99' }];
    const { fn, chamadas } = fetchFalso([() => respostaOpenAI(quebrada), () => respostaOpenAI(exemplo())]);
    const progresso: string[] = [];
    const cliente = criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn, ...(idioma ? { idioma } : {}) });
    const r = await mapear(cliente, { nomeProcesso: 'Pedido B2B', idProcesso: 'pedido-b2b', evidencias: EVIDENCIAS }, (m) => progresso.push(m));
    return { r, progresso, chamadas };
  };

  const en = await rodar('en');
  assert.equal(en.r.validacao.ok, true);
  assert.equal(en.progresso[0], 'Mapping from 8 pieces of evidence…');
  assert.match(en.progresso[1]!, /^Gate: \d+ errors?\.$/);
  assert.equal(en.progresso[2], 'Round 2: fixing what the gate flagged…');
  assert.match(en.progresso[3]!, /^Gate: passed \(\d+ steps, \d+ lanes\)\.$/);
  assert.ok(!en.progresso.some((p) => /Mapeando|Portão|Rodada/.test(p)), 'nenhuma mensagem de progresso em português');
  assert.match(sistemaDe(en.chamadas[0]!), INSTRUCAO_INGLES);
  assert.match(sistemaDe(en.chamadas[1]!), INSTRUCAO_INGLES, 'a rodada de correção usa o mesmo prompt');
  assert.match(ultimaMensagem(en.chamadas[1]!), /Matrix failed the gate:/);

  const pt = await rodar();
  assert.equal(pt.progresso[0], 'Mapeando a partir de 8 evidências…');
  assert.match(pt.progresso[1]!, /^Portão: \d+ erros?\.$/);
  assert.equal(pt.progresso[2], 'Rodada 2: corrigindo o que o portão apontou…');
  assert.match(pt.progresso[3]!, /^Portão: aprovada \(\d+ etapas, \d+ raias\)\.$/);
  assert.doesNotMatch(sistemaDe(pt.chamadas[0]!), INSTRUCAO_INGLES);
  assert.match(ultimaMensagem(pt.chamadas[1]!), /Matriz reprovada no portão:/);
});

test('inglês: avisos do Mapeador, conferências do Revisor com "Gate:" e frases do Editor', async () => {
  const comEvidenciaFalsa = exemplo();
  comEvidenciaFalsa.etapas.find((e) => e.chave === 'E02')!.evidencias = ['EV-999'];
  const mapeado = await mapear(
    criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fetchFalso([() => respostaOpenAI(comEvidenciaFalsa)]).fn, idioma: 'en' }),
    { nomeProcesso: 'P', idProcesso: 'p', evidencias: EVIDENCIAS },
  );
  assert.ok(mapeado.avisos.includes('E02 cites evidence that does not exist: EV-999.'));
  assert.ok(mapeado.avisos.some((a) => /flagged for human review/.test(a)));

  const m = exemplo();
  delete m.etapas.find((e) => e.chave === 'E10')!.evidencias;
  m.raias.push({ id: 'vazia', nome: 'Vazia' });
  const relatorio = () => respostaOpenAI({ resumo: 'Good.', lacunas: [], revisar: [] });
  const progressoEn: string[] = [];
  const { fn, chamadas } = fetchFalso([relatorio]);
  const revEn = await revisar(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn, idioma: 'en' }), { matriz: m, evidencias: EVIDENCIAS }, (p) => progressoEn.push(p));
  assert.ok(revEn.automaticos.some((a) => /^E10 \(".*"\) cites no evidence\.$/.test(a)));
  assert.ok(revEn.automaticos.includes('Gate: Lane "Vazia" (vazia) has no steps.'));
  assert.deepEqual(progressoEn, ['Reviewing the matrix against the evidence…', '0 gaps and 0 rows to review.']);
  assert.match(sistemaDe(chamadas[0]!), INSTRUCAO_INGLES);
  const revPt = await revisar(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fetchFalso([relatorio]).fn }), { matriz: m, evidencias: EVIDENCIAS });
  assert.ok(revPt.automaticos.includes('Portão: A raia "Vazia" (vazia) não tem nenhuma etapa.'));

  const operacoes = () =>
    respostaOpenAI({
      resumo: 'Adds tracking before dispatch',
      operacoes: [
        { op: 'adicionar_etapa', depoisDe: 'E12', etapa: { chave: 'E16', tipo: 'tarefa_usuario', nome: 'Record tracking', raia: 'logistica', proximos: [{ para: 'E13' }] } },
        { op: 'alterar_etapa', chave: 'E12', campos: { proximos: [{ para: 'E16' }] } },
      ],
    });
  const progressoEditor: string[] = [];
  const editado = await editar(
    criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fetchFalso([operacoes]).fn, idioma: 'en' }),
    { matriz: exemplo(), pedido: 'record tracking after dispatch' },
    (p) => progressoEditor.push(p),
  );
  assert.deepEqual(editado.frases, ['Adds "Record tracking" (E16) after "Despachar e avisar o cliente" (E12).', 'Changes "Despachar e avisar o cliente" (E12): proximos.']);
  assert.deepEqual(progressoEditor, ['Interpreting the request…', '2 operations.']);
  await assert.rejects(
    editar(criarCliente(OPENROUTER, { modelo: 'm' }, { idioma: 'en' }), { matriz: exemplo(), pedido: ' ' }),
    (e: unknown) => e instanceof ErroAgente && e.message === 'Write what to change.',
  );
});

test('inglês: o prompt de sistema do Leitor (e da Anthropic) leva a instrução; o padrão é o prompt de antes', async () => {
  const texto = 'O vendedor digita o pedido no ERP.';
  const resposta = () => respostaOpenAI({ evidencias: [{ citacao: 'O vendedor digita o pedido no ERP.', sobre: 'etapa', nota: 'Order entry.' }] });

  const en = fetchFalso([resposta]);
  const progresso: string[] = [];
  const r = await lerFonte(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: en.fn, idioma: 'en' }), { nome: 'pop.txt', texto }, (p) => progresso.push(p));
  assert.equal(r.evidencias[0]!.verificada, true);
  assert.deepEqual(progresso, ['Reading "pop.txt"…', '"pop.txt": 1 piece of evidence.']);
  const sistemaEn = sistemaDe(en.chamadas[0]!);
  assert.match(sistemaEn, INSTRUCAO_INGLES);
  assert.match(sistemaEn, /evidence quotes \(word for word, in the language of the source\)/);
  assert.ok(sistemaEn.indexOf('OUTPUT LANGUAGE') < sistemaEn.indexOf('Responda SOMENTE'), 'a instrução vem antes do JSON Schema');

  const pt = fetchFalso([resposta]);
  const progressoPt: string[] = [];
  await lerFonte(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: pt.fn }), { nome: 'pop.txt', texto }, (p) => progressoPt.push(p));
  assert.deepEqual(progressoPt, ['Lendo "pop.txt"…', '"pop.txt": 1 evidências.']);
  assert.equal(sistemaDe(pt.chamadas[0]!), sistemaEn.replace(/\n\nOUTPUT LANGUAGE: ENGLISH[\s\S]*?(?=\n\nResponda SOMENTE)/, ''), 'em português, o prompt é o mesmo sem o bloco');

  const anthropic = fetchFalso([() => respostaAnthropicSse(JSON.stringify({ evidencias: [] }))]);
  await lerFonte(
    criarCliente({ tipo: 'anthropic', urlBase: 'https://api.anthropic.com', chave: 'k' }, { modelo: 'claude-haiku-5-5' }, { fetch: anthropic.fn, idioma: 'en' }),
    { nome: 'pop.txt', texto },
  );
  assert.match(String(anthropic.chamadas[0]!.corpo['system']), INSTRUCAO_INGLES);
});

test('descrições dos agentes: português por padrão, inglês quando pedido', () => {
  assert.deepEqual(descricoesAgente('pt'), DESCRICOES_AGENTE);
  const en = descricoesAgente('en');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(DESCRICOES_AGENTE).sort());
  assert.match(en.mapeador, /strongest model/);
  assert.equal(DESCRICOES_AGENTE.editor, 'Muda a matriz a partir de um pedido em português.');
});
