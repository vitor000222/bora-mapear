import { test, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/app.ts';
import type { Repositorio } from '../src/repositorio.ts';
import { BANCOS } from './bancos.ts';
import { Cofre } from '../src/segredo.ts';
import { Executor } from '../src/execucoes.ts';
import { limparLegenda } from '../src/fontes.ts';
import { exemplo, fetchFalso, respostaOpenAI } from '../../../packages/agentes/test/falso.ts';

let repo: Repositorio;
let executor: Executor;

function montar(roteiro: Parameters<typeof fetchFalso>[0] = []) {
  const falso = fetchFalso(roteiro);
  const app = criarApp(repo, { cofre: Cofre.deSegredo('teste'), executor, fetch: falso.fn });
  const pedir = async (metodo: string, caminho: string, corpo?: unknown) => {
    const init: RequestInit = { method: metodo };
    if (corpo instanceof FormData) init.body = corpo;
    else if (corpo !== undefined) {
      init.body = JSON.stringify(corpo);
      init.headers = { 'Content-Type': 'application/json' };
    }
    const r = await app.request(caminho, init);
    const texto = await r.text();
    return { status: r.status, dados: texto ? JSON.parse(texto) : null };
  };
  return { pedir, chamadas: falso.chamadas };
}

async function preparar(pedir: ReturnType<typeof montar>['pedir']) {
  const { dados: m } = await pedir('POST', '/api/mapeamentos', { nome: 'Pedido B2B', modelo: 'em-branco' });
  const { dados: p } = await pedir('POST', '/api/provedores', { nome: 'OpenRouter', tipo: 'openai', urlBase: 'https://openrouter.ai/api/v1', chave: 'sk-or-v1-segredo-1234' });
  await pedir('PUT', '/api/agentes/padrao', { provedorId: p.id, modelo: 'anthropic/claude-sonnet-5-5' });
  return { id: m.id as string, provedorId: p.id as string };
}

const POP = 'O cliente envia o pedido por e-mail. O vendedor registra o pedido no ERP. O vendedor confere se há estoque. O financeiro analisa o crédito.';
const TRANSCRICAO = 'WEBVTT\n\n00:00:05.000 --> 00:00:09.000\n<v Ana>Depois a logística separa a mercadoria.\n\n00:00:10.000 --> 00:00:12.000\n<v Ana>E emite a nota no ERP.\n';

function evidenciasDe(frases: string[]) {
  return respostaOpenAI({ evidencias: frases.map((citacao) => ({ citacao, sobre: 'etapa' })) });
}

for (const banco of BANCOS) describe(banco.nome, () => {
beforeEach(async () => {
  repo = await banco.criar();
  executor = new Executor(repo);
});
afterEach(async () => {
  await executor.aguardar();
  await repo.fechar();
});

test('a chave fica cifrada no banco e nunca volta pela API', async () => {
  const { pedir } = montar();
  const { provedorId } = await preparar(pedir);
  const lista = await pedir('GET', '/api/provedores');
  assert.equal(JSON.stringify(lista.dados).includes('segredo'), false);
  assert.equal(lista.dados[0].temChave, true);
  assert.equal(lista.dados[0].finalChave, '1234');
  const guardado = (await repo.obterProvedorComChave(provedorId))!.chaveCifrada!;
  assert.match(guardado, /^v1:/);
  assert.equal(guardado.includes('segredo'), false);
  assert.equal(Cofre.deSegredo('teste').decifrar(guardado), 'sk-or-v1-segredo-1234');
  await pedir('PATCH', `/api/provedores/${provedorId}`, { chave: null });
  assert.equal((await pedir('GET', '/api/provedores')).dados[0].temChave, false);
});

test('sem modelo configurado, o agente avisa o caminho', async () => {
  const { pedir } = montar();
  const { dados: m } = await pedir('POST', '/api/mapeamentos', { nome: 'X' });
  await pedir('POST', `/api/mapeamentos/${m.id}/fontes`, { nome: 'notas', texto: 'algo' });
  const r = await pedir('POST', `/api/mapeamentos/${m.id}/ia/mapear`, {});
  assert.equal(r.status, 409);
  assert.match(r.dados.erro, /Configurações/);
});

test('fontes: arquivo e texto colado; legenda limpa; formato desconhecido recusado', async () => {
  const { pedir } = montar();
  const { id } = await preparar(pedir);
  const form = new FormData();
  form.append('arquivos', new File([POP], 'pop-pedidos.txt', { type: 'text/plain' }));
  form.append('arquivos', new File([TRANSCRICAO], 'entrevista.vtt', { type: 'text/vtt' }));
  form.append('arquivos', new File(['x'], 'planilha.xlsx'));
  const r = await pedir('POST', `/api/mapeamentos/${id}/fontes`, form);
  assert.equal(r.status, 201);
  assert.deepEqual(r.dados.map((f: { nome: string }) => f.nome), ['pop-pedidos.txt', 'entrevista.vtt']);
  const vtt = await pedir('GET', `/api/mapeamentos/${id}/fontes/${r.dados[1].id}`);
  assert.equal(vtt.dados.texto, '[00:00:05] Ana: Depois a logística separa a mercadoria. E emite a nota no ERP.');
  assert.equal(limparLegenda('1\n00:01:02,000 --> 00:01:04,000\nJoão: oi\n'), '[00:01:02] João: oi');
});

test('mapear: lê as fontes, mapeia, conta tokens e a proposta vira versão com o agente como autor', async () => {
  const { pedir, chamadas } = montar([
    () => evidenciasDe(['O cliente envia o pedido por e-mail.', 'O vendedor registra o pedido no ERP.', 'O vendedor confere se há estoque.', 'O financeiro analisa o crédito.']),
    () => evidenciasDe(['Depois a logística separa a mercadoria.', 'E emite a nota no ERP.', 'frase que não está na fonte', 'Ana: Depois a logística']),
    () => respostaOpenAI(exemplo(), { uso: [5000, 3000], custo: 0.05 }),
  ]);
  const { id } = await preparar(pedir);
  const form = new FormData();
  form.append('arquivos', new File([POP], 'pop.txt'));
  form.append('arquivos', new File([TRANSCRICAO], 'entrevista.vtt'));
  await pedir('POST', `/api/mapeamentos/${id}/fontes`, form);

  const inicio = await pedir('POST', `/api/mapeamentos/${id}/ia/mapear`, { instrucoes: 'Só o fluxo principal.' });
  assert.equal(inicio.status, 202);
  assert.equal(inicio.dados.status, 'rodando');
  await executor.aguardar();
  const { dados: exec } = await pedir('GET', `/api/execucoes/${inicio.dados.id}`);
  assert.equal(exec.status, 'concluida', exec.erro);
  assert.equal(exec.saida.validacao.ok, true);
  assert.equal(exec.saida.matriz.processo.nome, 'Pedido B2B');
  assert.equal(exec.tokensEntrada, 100 + 100 + 5000);
  assert.ok(exec.log.some((l: string) => /Portão: aprovada/.test(l)));
  assert.match((chamadas[2]!.corpo['messages'] as Array<{ content: string }>)[1]!.content, /Só o fluxo principal/);

  const evidencias = await pedir('GET', `/api/mapeamentos/${id}/evidencias`);
  assert.deepEqual(evidencias.dados.map((e: { chave: string }) => e.chave), ['EV-001', 'EV-002', 'EV-003', 'EV-004', 'EV-005', 'EV-006', 'EV-007', 'EV-008']);
  assert.equal(evidencias.dados.filter((e: { verificada: boolean }) => !e.verificada).length, 1);

  const aplicada = await pedir('POST', `/api/execucoes/${exec.id}/aplicar`, {});
  assert.equal(aplicada.status, 201);
  assert.equal(aplicada.dados.versao.numero, 2);
  assert.equal(aplicada.dados.versao.autor, 'agente:mapeador');
  assert.equal((await pedir('POST', `/api/execucoes/${exec.id}/aplicar`, {})).status, 409, 'não aplica duas vezes');
});

test('ler de novo uma fonte troca as evidências dela sem reaproveitar chave', async () => {
  const { pedir } = montar([() => evidenciasDe(['O cliente envia o pedido por e-mail.']), () => evidenciasDe(['O financeiro analisa o crédito.'])]);
  const { id } = await preparar(pedir);
  const { dados: fontes } = await pedir('POST', `/api/mapeamentos/${id}/fontes`, { nome: 'pop', texto: POP });
  await pedir('POST', `/api/mapeamentos/${id}/ia/ler`, {});
  await executor.aguardar();
  assert.equal((await pedir('POST', `/api/mapeamentos/${id}/ia/ler`, {})).status, 400, 'nada pendente');
  await pedir('POST', `/api/mapeamentos/${id}/ia/ler`, { fonteIds: [fontes[0].id] });
  await executor.aguardar();
  const { dados } = await pedir('GET', `/api/mapeamentos/${id}/evidencias`);
  assert.deepEqual(dados.map((e: { chave: string; citacao: string }) => [e.chave, e.citacao]), [['EV-002', 'O financeiro analisa o crédito.']]);
});

test('editar: proposta sobre a versão atual; se a matriz mudou, pede confirmação para aplicar', async () => {
  const { pedir } = montar([
    () =>
      respostaOpenAI({
        resumo: 'Renomeia a primeira tarefa',
        operacoes: [{ op: 'alterar_etapa', chave: 'E02', campos: { nome: 'Registrar pedido' } }],
      }),
  ]);
  const { id } = await preparar(pedir);
  const r = await pedir('POST', `/api/mapeamentos/${id}/ia/editar`, { pedido: 'renomeia a primeira tarefa para Registrar pedido' });
  await executor.aguardar();
  const { dados: exec } = await pedir('GET', `/api/execucoes/${r.dados.id}`);
  assert.equal(exec.status, 'concluida', exec.erro);
  assert.deepEqual(exec.saida.frases, ['Altera "Primeira tarefa" (E02): nome.']);
  const { dados: atual } = await pedir('GET', `/api/mapeamentos/${id}`);
  await pedir('POST', `/api/mapeamentos/${id}/versoes`, { matriz: atual.matriz, mensagem: 'mudança no meio' });
  const conflito = await pedir('POST', `/api/execucoes/${exec.id}/aplicar`, {});
  assert.equal(conflito.status, 409);
  assert.match(conflito.dados.erro, /v1 → v2/);
  const forcada = await pedir('POST', `/api/execucoes/${exec.id}/aplicar`, { forcar: true });
  assert.equal(forcada.dados.versao.numero, 3);
  assert.match(forcada.dados.versao.mensagem, /Renomeia a primeira tarefa \(pedido:/);
});

test('falha do provedor vira execução falha, com a mensagem e sem a chave', async () => {
  const { pedir } = montar([() => ({ status: 401, json: { error: { message: 'Invalid key sk-or-v1-segredo-1234' } } })]);
  const { id } = await preparar(pedir);
  const r = await pedir('POST', `/api/mapeamentos/${id}/ia/revisar`, {});
  await executor.aguardar();
  const { dados } = await pedir('GET', `/api/execucoes/${r.dados.id}`);
  assert.equal(dados.status, 'falhou');
  assert.match(dados.erro, /chave foi recusada/);
});

test('testar provedor e listar modelos', async () => {
  const { pedir } = montar([() => respostaOpenAI({ ok: true }), () => ({ json: { data: [{ id: 'b/modelo' }, { id: 'a/modelo' }] } })]);
  const { provedorId } = await preparar(pedir);
  const teste = await pedir('POST', `/api/provedores/${provedorId}/testar`, { modelo: 'a/modelo' });
  assert.equal(teste.dados.ok, true);
  const modelos = await pedir('GET', `/api/provedores/${provedorId}/modelos`);
  assert.deepEqual(modelos.dados, ['a/modelo', 'b/modelo']);
});

test('execução interrompida pelo desligamento é marcada como falha no próximo arranque', async () => {
  const { pedir } = montar();
  const { id } = await preparar(pedir);
  await repo.criarExecucao(id, 'mapear', {});
  assert.equal(await repo.marcarInterrompidas(), 1);
  const [e] = await repo.listarExecucoes(id);
  assert.equal(e!.status, 'falhou');
});

test('importar: BPMN do Bora Mapear mantém as posições; Mermaid vira mapeamento; formato desconhecido sugere a IA', async () => {
  const { pedir } = montar();
  const { renderizarBpmn, renderizarMermaid, calcularLayout } = await import('@bora-mapear/core');
  const m = exemplo();
  const auto = calcularLayout(m);
  const xml = renderizarBpmn(m, { correcoes: { versao: 1, nos: { E04: { x: auto.nos['E04']!.x + 30, y: auto.nos['E04']!.y } }, arestas: {}, raias: {} } });
  const bpmn = await pedir('POST', '/api/mapeamentos/importar', { nome: 'Pedido importado', conteudo: xml });
  assert.equal(bpmn.status, 201);
  assert.equal(bpmn.dados.validacao.ok, true);
  const { dados } = await pedir('GET', `/api/mapeamentos/${bpmn.dados.mapeamento.id}`);
  assert.equal(dados.matriz.processo.nome, 'Pedido importado');
  assert.equal(dados.visoes.bpmn.correcoes.nos.E04.x, auto.nos['E04']!.x + 30);

  const mmd = await pedir('POST', '/api/mapeamentos/importar', { nome: 'Do Mermaid', conteudo: renderizarMermaid(m) });
  assert.equal(mmd.status, 201);
  assert.equal(mmd.dados.mapeamento.linguagem, 'mermaid');

  const lista = await pedir('POST', '/api/mapeamentos/importar', { nome: 'Lista', conteudo: '1. cliente pede\n2. vendedor atende' });
  assert.equal(lista.status, 422);
  assert.equal(lista.dados.detalhes.podeUsarIa, true);
});

test('importar com IA: cria o mapeamento e o Conversor propõe a matriz', async () => {
  const { pedir } = montar([() => respostaOpenAI(exemplo())]);
  await preparar(pedir);
  const r = await pedir('POST', '/api/mapeamentos/importar-com-ia', { nome: 'Da lista', conteudo: '1. cliente pede\n2. vendedor atende' });
  assert.equal(r.status, 202);
  await executor.aguardar();
  const { dados: exec } = await pedir('GET', `/api/execucoes/${r.dados.execucao.id}`);
  assert.equal(exec.status, 'concluida', exec.erro);
  const aplicada = await pedir('POST', `/api/execucoes/${exec.id}/aplicar`, {});
  assert.equal(aplicada.dados.versao.autor, 'agente:conversor');
});

test('estilo: guarda, valida e o Visual aprende das cores salvas em todos os mapeamentos', async () => {
  const { pedir, chamadas } = montar([
    () => respostaOpenAI({ regras: [{ descricao: 'Manuais em laranja', quando: { tipos: ['tarefa_manual'] }, corFundo: '#fff3e0' }], observacoes: ['Você pinta só tarefas.'] }),
  ]);
  const { id } = await preparar(pedir);
  assert.deepEqual((await pedir('GET', '/api/estilo')).dados, { versao: 1, regras: [] });
  assert.equal((await pedir('PUT', '/api/estilo', { versao: 1, regras: [{ descricao: 'x', quando: {}, corFundo: 'laranja' }] })).status, 400);

  const semCor = await pedir('POST', '/api/estilo/aprender', {});
  assert.equal(semCor.status, 422, 'sem exemplos de cor ainda');

  // Duas tarefas pintadas no mapeamento em branco (E02 é tarefa_usuario) e no exemplo importado.
  await pedir('PUT', `/api/mapeamentos/${id}/visoes/bpmn/correcoes`, { correcoes: { versao: 1, nos: { E02: { corFundo: '#fff3e0' } }, arestas: {}, raias: {} } });
  const { renderizarMermaid } = await import('@bora-mapear/core');
  const imp = await pedir('POST', '/api/mapeamentos/importar', { nome: 'Outro', conteudo: renderizarMermaid(exemplo()) });
  await pedir('PUT', `/api/mapeamentos/${imp.dados.mapeamento.id}/visoes/reactflow/correcoes`, {
    correcoes: { versao: 1, nos: { E07: { corFundo: '#fff3e0', corBorda: '#ef6c00' } }, arestas: {}, raias: {} },
  });
  const r = await pedir('POST', '/api/estilo/aprender', {});
  assert.equal(r.status, 200);
  assert.equal(r.dados.exemplos, 2);
  assert.deepEqual(r.dados.cobertura, [{ vale: 1, acerta: 1 }]);
  const enviado = (chamadas[0]!.corpo['messages'] as Array<{ content: string }>)[1]!.content;
  assert.match(enviado, /"tipo":"tarefa_manual","raia":"Logística"/);
  assert.match(enviado, /Pintou/);
  assert.equal((await pedir('PUT', '/api/estilo', r.dados.estilo)).status, 200);
  assert.equal((await pedir('GET', '/api/estilo')).dados.regras.length, 1);
});

});
