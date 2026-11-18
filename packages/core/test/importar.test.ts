import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarEstilo,
  calcularLayout,
  compararMatrizes,
  coresDoEstilo,
  detectarFormato,
  ErroImportacao,
  importarBpmn,
  importarMermaid,
  reconciliarComOriginal,
  renderizarBpmn,
  renderizarMermaid,
  validarMatriz,
  type Correcoes,
  type EstiloVisual,
  type Matriz,
} from '../src/index.ts';
import { exemplo } from './apoio.ts';

const resumo = (m: Matriz) => m.etapas.map((e) => `${e.chave}|${e.nome}|${e.raia}|${e.proximos.map((s) => `${s.para}:${s.rotulo ?? ''}`).join(',')}`);

test('BPMN do próprio Bora Mapear volta como a mesma matriz, com tipos, detalhes e posições', async () => {
  const m = exemplo();
  const auto = calcularLayout(m);
  const correcoes: Correcoes = { versao: 1, nos: { E04: { x: auto.nos['E04']!.x + 30, y: auto.nos['E04']!.y, corFundo: '#fff3e0' } }, arestas: {}, raias: {} };
  const r = await importarBpmn(renderizarBpmn(m, { correcoes }));
  assert.equal(validarMatriz(r.matriz).ok, true);
  assert.deepEqual(r.matriz.raias, m.raias);
  assert.deepEqual(new Set(resumo(r.matriz)), new Set(resumo(m)));
  const e02 = r.matriz.etapas.find((e) => e.chave === 'E02')!;
  assert.equal(e02.tipo, 'tarefa_usuario');
  assert.equal(e02.sistema, 'ERP');
  assert.equal(e02.descricao, 'O vendedor digita o pedido no ERP a partir do e-mail do cliente.');
  assert.deepEqual(e02.evidencias, ['EV-002']);
  assert.equal(r.matriz.etapas.find((e) => e.chave === 'E14')!.tipo, 'evento_timer');
  assert.deepEqual(r.correcoes?.nos['E04'], correcoes.nos['E04']);
  assert.deepEqual(compararMatrizes(m, r.matriz).filter((f) => !/^Detalhes/.test(f)), []);
});

test('BPMN de outra ferramenta: raias pelo nome, ids viram chaves, elementos sem par ficam de fora com aviso', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="x" exporter="Camunda Modeler">
  <bpmn:collaboration id="c"><bpmn:participant id="p" name="Compras" processRef="P1" /></bpmn:collaboration>
  <bpmn:process id="P1">
    <bpmn:laneSet id="ls">
      <bpmn:lane id="Lane_1" name="Solicitante"><bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef><bpmn:flowNodeRef>Activity_1</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lane_2" name="Área de Compras"><bpmn:flowNodeRef>Gw_1</bpmn:flowNodeRef><bpmn:flowNodeRef>_9-x</bpmn:flowNodeRef><bpmn:flowNodeRef>End_1</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_1" name="Necessidade identificada" />
    <bpmn:userTask id="Activity_1" name="Abrir requisição" />
    <bpmn:exclusiveGateway id="Gw_1" name="Aprovada?" />
    <bpmn:task id="_9-x" name="Cotar fornecedores" />
    <bpmn:endEvent id="End_1" name="Pedido emitido" />
    <bpmn:dataObjectReference id="Doc_1" name="Requisição" />
    <bpmn:sequenceFlow id="f1" sourceRef="Start_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="f2" sourceRef="Activity_1" targetRef="Gw_1" />
    <bpmn:sequenceFlow id="f3" name="Sim" sourceRef="Gw_1" targetRef="_9-x" />
    <bpmn:sequenceFlow id="f4" name="Não" sourceRef="Gw_1" targetRef="End_1" />
    <bpmn:sequenceFlow id="f5" sourceRef="_9-x" targetRef="End_1" />
  </bpmn:process>
</bpmn:definitions>`;
  const r = await importarBpmn(xml);
  assert.equal(r.matriz.processo.nome, 'Compras');
  assert.deepEqual(r.matriz.raias, [{ id: 'solicitante', nome: 'Solicitante' }, { id: 'area-de-compras', nome: 'Área de Compras' }]);
  assert.equal(validarMatriz(r.matriz).ok, true);
  assert.deepEqual(r.matriz.etapas.find((e) => e.chave === 'Gw_1')!.proximos, [{ para: 'E__9-x', rotulo: 'Sim' }, { para: 'End_1', rotulo: 'Não' }]);
  assert.equal(r.correcoes, undefined, 'layout refeito');
  assert.ok(r.avisos.some((a) => /DataObjectReference/.test(a)));
  await assert.rejects(importarBpmn('<nao-e-bpmn/>'), ErroImportacao);
});

test('Mermaid do próprio Bora Mapear volta com as mesmas etapas, setas e raias', () => {
  const m = exemplo();
  const r = importarMermaid(renderizarMermaid(m), 'Pedido de venda');
  assert.deepEqual(r.matriz.raias.map((x) => [x.id, x.nome]), m.raias.map((x) => [x.id, x.nome]));
  assert.deepEqual(new Set(resumo(r.matriz)), new Set(resumo(m)));
  assert.equal(validarMatriz(r.matriz).ok, true);
  assert.deepEqual(
    Object.fromEntries(['E01', 'E03', 'E06', 'E07', 'E13'].map((c) => [c, r.matriz.etapas.find((e) => e.chave === c)!.tipo])),
    { E01: 'inicio', E03: 'gateway_exclusivo', E06: 'gateway_paralelo', E07: 'tarefa_manual', E13: 'fim' },
  );
});

test('Mermaid escrito à mão: cadeias, &, rótulos nos dois formatos, estádio como início e fim', () => {
  const codigo = `graph TD
    A([Início]) --> B[Receber pedido] --> C{Tem estoque?}
    C -->|Sim| D[Separar] & E[Faturar]
    C -- Não --> F[Avisar cliente]
    D & E --> G([Fim])
    F --> G`;
  const r = importarMermaid(codigo);
  const tipo = (c: string) => r.matriz.etapas.find((e) => e.chave === c)!.tipo;
  assert.equal(tipo('A'), 'inicio');
  assert.equal(tipo('G'), 'fim');
  assert.equal(tipo('C'), 'gateway_exclusivo');
  assert.deepEqual(r.matriz.etapas.find((e) => e.chave === 'C')!.proximos, [{ para: 'D', rotulo: 'Sim' }, { para: 'E', rotulo: 'Sim' }, { para: 'F', rotulo: 'Não' }]);
  assert.deepEqual(r.matriz.raias, [{ id: 'geral', nome: 'Geral' }]);
  assert.throws(() => importarMermaid('sequenceDiagram\nA->>B: oi'), /flowchart/);
});

test('detectar o formato pelo conteúdo', () => {
  assert.equal(detectarFormato('  <?xml version="1.0"?><bpmn:definitions/>'), 'bpmn');
  assert.equal(detectarFormato('%% comentário\nflowchart LR\nA-->B'), 'mermaid');
  assert.equal(detectarFormato('1. o cliente pede'), null);
});

test('comparar matrizes descreve o que mudou', () => {
  const a = exemplo();
  const b = structuredClone(a);
  b.etapas.find((e) => e.chave === 'E02')!.nome = 'Digitar pedido';
  b.etapas.find((e) => e.chave === 'E07')!.raia = 'financeiro';
  b.etapas = b.etapas.filter((e) => e.chave !== 'E10');
  b.etapas.push({ chave: 'E16', tipo: 'tarefa_manual', nome: 'Conferir', raia: 'logistica', proximos: [] });
  b.raias.push({ id: 'gerencia', nome: 'Gerência' });
  assert.deepEqual(compararMatrizes(a, b), [
    'Raia nova: "Gerência".',
    'E02 renomeada: "Registrar pedido no ERP" → "Digitar pedido".',
    '"Separar e embalar mercadoria" (E07) mudou de raia: "Logística" → "Financeiro".',
    'Etapa nova: "Conferir" (E16), tarefa manual em "Logística".',
    'Etapa removida: "Avisar cliente sobre o prazo" (E10).',
  ]);
});

test('estilo: regras por tipo, raia e revisão; a de baixo vence; vira correção e cor no Mermaid', () => {
  const m = exemplo();
  const estilo: EstiloVisual = {
    versao: 1,
    regras: [
      { descricao: 'Tarefas manuais em laranja', quando: { tipos: ['tarefa_manual'] }, corFundo: '#fff3e0', corBorda: '#ef6c00' },
      { descricao: 'Financeiro em azul', quando: { raias: ['financeiro'], familias: ['tarefa'] }, corFundo: '#e3f2fd' },
      { descricao: 'Revisão humana com borda vermelha', quando: { revisarHumano: true }, corBorda: '#c62828' },
    ],
  };
  const cores = coresDoEstilo(m, estilo);
  assert.deepEqual(cores['E07'], { corFundo: '#fff3e0', corBorda: '#c62828' });
  assert.deepEqual(cores['E04'], { corFundo: '#e3f2fd' });
  assert.equal(cores['E05'], undefined, 'gateway do financeiro não é tarefa');
  const correcoes = aplicarEstilo(m, estilo, { versao: 1, nos: { E04: { x: 1, y: 2, corFundo: '#000000' } }, arestas: {}, raias: {} });
  assert.deepEqual(correcoes.nos['E04'], { x: 1, y: 2, corFundo: '#e3f2fd' });
  assert.match(renderizarMermaid(m, { cores }), /style E07 fill:#fff3e0,stroke:#c62828/);
});

test('reconciliar: conteúdo do desenho, marcas e ordem da matriz original', async () => {
  const m = exemplo();
  const lida = (await importarBpmn(renderizarBpmn(m))).matriz;
  lida.etapas.find((e) => e.chave === 'E02')!.nome = 'Digitar pedido';
  const r = reconciliarComOriginal(m, lida);
  assert.deepEqual(r.etapas.map((e) => e.chave), m.etapas.map((e) => e.chave));
  assert.equal(r.etapas.find((e) => e.chave === 'E07')!.revisarHumano, true);
  assert.equal(r.etapas.find((e) => e.chave === 'E07')!.confianca, 0.7);
  assert.equal(r.etapas.find((e) => e.chave === 'E02')!.nome, 'Digitar pedido');
  assert.deepEqual(r.processo, m.processo);
});

test('Mermaid: etapa criada numa linha de seta vai para a raia da vizinha, sem raia duplicada', () => {
  const m = exemplo();
  const codigo = renderizarMermaid(m).replace('  E12 --> E13', '  E12 --> R1["Registrar rastreio"] --> E13');
  const r = importarMermaid(codigo);
  assert.equal(r.matriz.raias.length, 4);
  assert.equal(r.matriz.etapas.find((e) => e.chave === 'R1')!.raia, 'logistica');
  assert.ok(r.avisos.some((a) => /Registrar rastreio.*Logística/.test(a)));
  assert.equal(validarMatriz(r.matriz).ok, true);
});
