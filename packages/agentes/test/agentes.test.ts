import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarMatriz } from '@bora-mapear/core';
import {
  aprenderEstilo,
  citacaoNaFonte,
  converter,
  criarCliente,
  dividirTexto,
  editar,
  ErroAgente,
  ErroProvedor,
  gerarJson,
  lerFonte,
  limparSchema,
  mapear,
  revisar,
  type Evidencia,
} from '../src/index.ts';
import { z } from 'zod';
import { exemplo, fetchFalso, respostaAnthropicSse, respostaOpenAI } from './falso.ts';

const OPENROUTER = { tipo: 'openai' as const, urlBase: 'https://openrouter.ai/api/v1', chave: 'sk-teste' };

test('compatível com OpenAI: manda schema, cabeçalhos e lê uso e custo do OpenRouter', async () => {
  const { fn, chamadas } = fetchFalso([() => respostaOpenAI({ ok: true }, { custo: 0.0123 })]);
  const cliente = criarCliente(OPENROUTER, { modelo: 'anthropic/claude-sonnet-5-5' }, { fetch: fn });
  const r = await gerarJson(cliente, { sistema: 's', usuario: 'u', schema: z.object({ ok: z.boolean() }), nomeSchema: 'teste' });
  assert.deepEqual(r.dado, { ok: true });
  assert.equal(r.uso.custo, 0.0123);
  const c = chamadas[0]!;
  assert.equal(c.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(c.cabecalhos['authorization'], 'Bearer sk-teste');
  assert.equal((c.corpo['response_format'] as { type: string }).type, 'json_schema');
  assert.deepEqual(c.corpo['usage'], { include: true });
});

test('resposta fora do formato: devolve o erro ao modelo e aceita a segunda', async () => {
  const { fn, chamadas } = fetchFalso([() => respostaOpenAI('isto não é json'), () => respostaOpenAI('```json\n{"n": 3}\n```')]);
  const cliente = criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn });
  const r = await gerarJson(cliente, { sistema: 's', usuario: 'u', schema: z.object({ n: z.number() }), nomeSchema: 't' });
  assert.equal(r.dado.n, 3);
  assert.equal(r.uso.tokensEntrada, 200, 'soma o uso das duas chamadas');
  const mensagens = chamadas[1]!.corpo['messages'] as Array<{ role: string; content: string }>;
  assert.deepEqual(mensagens.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.match(mensagens[3]!.content, /não seguiu o formato/);
});

test('provedor sem json_schema: cai para json_object sozinho e lembra', async () => {
  const { fn, chamadas } = fetchFalso([
    () => ({ status: 400, json: { error: { message: 'response_format json_schema is not supported' } } }),
    () => respostaOpenAI({ a: 1 }),
    () => respostaOpenAI({ a: 2 }),
  ]);
  const cliente = criarCliente({ tipo: 'openai', urlBase: 'http://127.0.0.1:11434/v1' }, { modelo: 'llama' }, { fetch: fn });
  const schema = z.object({ a: z.number() });
  await gerarJson(cliente, { sistema: 's', usuario: 'u', schema, nomeSchema: 't' });
  await gerarJson(cliente, { sistema: 's', usuario: 'u', schema, nomeSchema: 't' });
  assert.deepEqual(chamadas.map((c) => (c.corpo['response_format'] as { type: string }).type), ['json_schema', 'json_object', 'json_object']);
  assert.equal(chamadas[0]!.cabecalhos['authorization'], undefined, 'sem chave, sem cabeçalho');
});

test('erros com mensagem para gente: chave recusada e resposta cortada', async () => {
  const recusada = criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fetchFalso([() => ({ status: 401, json: { error: { message: 'No auth' } } })]).fn });
  await assert.rejects(
    gerarJson(recusada, { sistema: 's', usuario: 'u', schema: z.object({}), nomeSchema: 't' }),
    (e: unknown) => e instanceof ErroProvedor && e.motivo === 'chave' && !/sk-teste/.test(e.message),
  );
  const cortada = criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fetchFalso([() => respostaOpenAI('{"a":', { finish: 'length' })]).fn });
  await assert.rejects(gerarJson(cortada, { sistema: 's', usuario: 'u', schema: z.object({}), nomeSchema: 't' }), (e: unknown) => e instanceof ErroAgente && /cortada/.test(e.message));
});

test('Anthropic pelo SDK: streaming, schema em output_config, fallback no servidor e custo estimado', async () => {
  const { fn, chamadas } = fetchFalso([() => respostaAnthropicSse('{"ok":true}')]);
  const cliente = criarCliente({ tipo: 'anthropic', urlBase: 'https://api.anthropic.com', chave: 'sk-ant-teste' }, { modelo: 'claude-opus-5-5', esforco: 'high' }, { fetch: fn });
  const r = await gerarJson(cliente, { sistema: 's', usuario: 'u', schema: z.object({ ok: z.boolean() }), nomeSchema: 't' });
  assert.deepEqual(r.dado, { ok: true });
  const c = chamadas[0]!;
  assert.match(c.url, /\/v1\/messages/);
  assert.equal(c.cabecalhos['authorization'], 'Bearer sk-ant-teste', 'o SDK 1.x manda a chave como Bearer');
  assert.match(c.cabecalhos['anthropic-beta'] ?? '', /server-side-fallback-2026-07-01/);
  assert.equal(c.corpo['fallbacks'], 'default');
  assert.equal(c.corpo['stream'], true);
  const config = c.corpo['output_config'] as { effort: string; format: { type: string; schema: { additionalProperties: boolean } } };
  assert.equal(config.effort, 'high');
  assert.equal(config.format.type, 'json_schema');
  assert.equal(config.format.schema.additionalProperties, false);
  assert.equal(r.uso.custo, (1000 * 4 + 500 * 20) / 1_000_000);
});

test('Anthropic: recusa vira erro claro', async () => {
  const cliente = criarCliente(
    { tipo: 'anthropic', urlBase: 'https://api.anthropic.com', chave: 'k' },
    { modelo: 'claude-haiku-5-5' },
    { fetch: fetchFalso([() => respostaAnthropicSse('', 'refusal')]).fn },
  );
  await assert.rejects(gerarJson(cliente, { sistema: 's', usuario: 'u', schema: z.object({}), nomeSchema: 't' }), (e: unknown) => e instanceof ErroProvedor && e.motivo === 'recusa');
});

test('schema limpo: sem limites numéricos nem de texto, objetos fechados, oneOf vira anyOf', () => {
  const limpo = limparSchema({ type: 'object', properties: { a: { type: 'string', minLength: 1 }, b: { oneOf: [{ type: 'number', minimum: 0 }] } } }) as Record<string, any>;
  assert.equal(limpo['additionalProperties'], false);
  assert.equal(limpo['properties'].a.minLength, undefined);
  assert.equal(limpo['properties'].b.anyOf[0].minimum, undefined);
});

test('citação conferida contra a fonte, com reticências e sem diferença de espaço ou aspas', () => {
  const fonte = 'O vendedor digita o pedido no ERP.\nDepois, o  financeiro analisa o “crédito” do cliente.';
  assert.equal(citacaoNaFonte('o financeiro analisa o "crédito"', fonte), true);
  assert.equal(citacaoNaFonte('O vendedor digita … analisa o "crédito"', fonte), true);
  assert.equal(citacaoNaFonte('o gerente aprova o crédito', fonte), false);
  assert.equal(dividirTexto('a\n\n'.repeat(30_000)).length > 1, true);
});

test('Leitor: confere cada citação e descarta repetidas', async () => {
  const texto = 'O vendedor digita o pedido no ERP. O financeiro analisa o crédito em até dois dias.';
  const { fn } = fetchFalso([
    () =>
      respostaOpenAI({
        evidencias: [
          { citacao: 'O vendedor digita o pedido no ERP.', sobre: 'etapa' },
          { citacao: 'o vendedor digita o pedido no ERP.', sobre: 'etapa' },
          { citacao: 'O financeiro aprova sempre.', sobre: 'regra' },
        ],
      }),
  ]);
  const r = await lerFonte(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }), { nome: 'pop.txt', texto });
  assert.equal(r.evidencias.length, 2);
  assert.deepEqual(r.evidencias.map((e) => e.verificada), [true, false]);
});

const EVIDENCIAS: Evidencia[] = ['EV-001', 'EV-002', 'EV-003', 'EV-004', 'EV-005', 'EV-006', 'EV-007', 'EV-008'].map((chave) => ({
  chave,
  fonte: 'entrevista.vtt',
  citacao: 'trecho',
  sobre: 'etapa',
  verificada: true,
}));

test('Mapeador: o portão reprova, o modelo corrige na segunda rodada', async () => {
  const quebrada = exemplo();
  quebrada.etapas.find((e) => e.chave === 'E02')!.proximos = [{ para: 'E99' }];
  const { fn, chamadas } = fetchFalso([() => respostaOpenAI(quebrada), () => respostaOpenAI(exemplo())]);
  const progresso: string[] = [];
  const r = await mapear(
    criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }),
    { nomeProcesso: 'Pedido B2B', idProcesso: 'pedido-b2b', evidencias: EVIDENCIAS },
    (m) => progresso.push(m),
  );
  assert.equal(r.rodadas, 2);
  assert.equal(r.validacao.ok, true);
  assert.equal(r.matriz.processo.nome, 'Pedido B2B', 'nome e id vêm do mapeamento, não do modelo');
  assert.match((chamadas[1]!.corpo['messages'] as Array<{ content: string }>).at(-1)!.content, /DESTINO_INEXISTENTE/);
  assert.ok(progresso.some((p) => /Rodada 2/.test(p)));
  // E15 e E13 (fim) e gateways não precisam de evidência; as tarefas citam EV que existem.
  assert.deepEqual(r.avisos, []);
});

test('Mapeador: evidência inventada vira aviso e a linha vai para revisão humana', async () => {
  const m = exemplo();
  m.etapas.find((e) => e.chave === 'E02')!.evidencias = ['EV-999'];
  const { fn } = fetchFalso([() => respostaOpenAI(m)]);
  const r = await mapear(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }), { nomeProcesso: 'P', idProcesso: 'p', evidencias: EVIDENCIAS });
  assert.ok(r.avisos.some((a) => /E02 cita evidências que não existem: EV-999/.test(a)));
  assert.equal(r.matriz.etapas.find((e) => e.chave === 'E02')!.revisarHumano, true);
});

test('Editor: aplica as operações; operação impossível volta ao modelo', async () => {
  const { fn, chamadas } = fetchFalso([
    () => respostaOpenAI({ resumo: 'x', operacoes: [{ op: 'alterar_etapa', chave: 'E77', campos: { nome: 'y' } }] }),
    () =>
      respostaOpenAI({
        resumo: 'Inclui registro de rastreio antes de despachar',
        operacoes: [
          { op: 'adicionar_etapa', depoisDe: 'E12', etapa: { chave: 'E16', tipo: 'tarefa_usuario', nome: 'Registrar rastreio', raia: 'logistica', proximos: [{ para: 'E13' }] } },
          { op: 'alterar_etapa', chave: 'E12', campos: { proximos: [{ para: 'E16' }] } },
        ],
      }),
  ]);
  const r = await editar(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }), { matriz: exemplo(), pedido: 'registrar o rastreio depois de despachar' });
  assert.equal(r.rodadas, 2);
  assert.match((chamadas[1]!.corpo['messages'] as Array<{ content: string }>).at(-1)!.content, /E77/);
  assert.equal(validarMatriz(r.matriz).ok, true);
  assert.deepEqual(r.frases, ['Adiciona "Registrar rastreio" (E16) depois de "Despachar e avisar o cliente" (E12).', 'Altera "Despachar e avisar o cliente" (E12): proximos.']);
});

test('Revisor: junta o relatório do modelo com as conferências automáticas', async () => {
  const m = exemplo();
  delete m.etapas.find((e) => e.chave === 'E10')!.evidencias;
  const { fn } = fetchFalso([
    () =>
      respostaOpenAI({
        resumo: 'Bom mapeamento.',
        lacunas: [{ descricao: 'Não se sabe quem aprova acima de 50 mil.', pergunta: 'Quem aprova pedidos acima de R$ 50 mil?', chaves: ['E04'] }],
        revisar: [{ chave: 'E07', motivo: 'Confiança baixa.' }, { chave: 'E99', motivo: 'não existe' }],
      }),
  ]);
  const r = await revisar(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }), { matriz: m, evidencias: EVIDENCIAS });
  assert.deepEqual(r.relatorio.revisar.map((x) => x.chave), ['E07'], 'descarta chave que não existe');
  assert.ok(r.automaticos.some((a) => /E10/.test(a)));
});

test('Conversor: mesmo laço do portão, com nome e id do mapeamento', async () => {
  const quebrada = exemplo();
  quebrada.etapas.find((e) => e.chave === 'E15')!.proximos = [{ para: 'E01' }];
  const { fn, chamadas } = fetchFalso([() => respostaOpenAI(quebrada), () => respostaOpenAI(exemplo())]);
  const r = await converter(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }), { conteudo: '@startuml\n:Pedido;\n@enduml', nomeProcesso: 'Pedido', idProcesso: 'pedido' });
  assert.equal(r.rodadas, 2);
  assert.equal(r.validacao.ok, true);
  assert.equal(r.matriz.processo.id, 'pedido');
  assert.match((chamadas[0]!.corpo['messages'] as Array<{ content: string }>)[1]!.content, /@startuml/);
});

test('Visual: aprende regras dos exemplos e mede em quantos a regra acerta', async () => {
  const exemplos = [
    { tipo: 'tarefa_manual' as const, raia: 'Logística', nome: 'Separar', corFundo: '#fff3e0', corBorda: '#ef6c00' },
    { tipo: 'tarefa_manual' as const, raia: 'Vendas', nome: 'Conferir', corFundo: '#fff3e0', corBorda: '#ef6c00' },
    { tipo: 'tarefa_manual' as const, raia: 'Vendas', nome: 'Embalar', corFundo: '#e3f2fd' },
  ];
  const { fn } = fetchFalso([
    () => respostaOpenAI({ regras: [{ descricao: 'Tarefas manuais em laranja', quando: { tipos: ['tarefa_manual'] }, corFundo: '#fff3e0', corBorda: '#ef6c00' }], observacoes: [] }),
  ]);
  const r = await aprenderEstilo(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }), { exemplos, frases: [] });
  assert.equal(r.estilo.regras.length, 1);
  assert.deepEqual(r.cobertura, [{ vale: 3, acerta: 2 }]);
  await assert.rejects(aprenderEstilo(criarCliente(OPENROUTER, { modelo: 'm' }, { fetch: fn }), { exemplos: [], frases: [] }), /Pinte algumas etapas/);
});
