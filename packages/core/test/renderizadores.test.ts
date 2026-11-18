import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BpmnModdle } from 'bpmn-moddle';
import { renderizar, renderizarBpmn, renderizarMermaid, renderizarReactFlow, idsMermaid, textoMermaid } from '../src/index.ts';
import { exemplo, minima } from './apoio.ts';

test('BPMN: o bpmn-moddle lê o XML sem nenhum aviso', async () => {
  const m = exemplo();
  const { rootElement, warnings } = await new BpmnModdle().fromXML(renderizarBpmn(m));
  assert.deepEqual(warnings, []);
  const processo = rootElement.rootElements.find((r: { $type: string }) => r.$type === 'bpmn:Process');
  const elementos = new Map(processo.flowElements.map((f: { id: string; $type: string }) => [f.id, f.$type]));
  assert.equal(elementos.get('E01'), 'bpmn:StartEvent');
  assert.equal(elementos.get('E03'), 'bpmn:ExclusiveGateway');
  assert.equal(elementos.get('E07'), 'bpmn:ManualTask');
  assert.equal(elementos.get('E14'), 'bpmn:IntermediateCatchEvent');
  assert.equal(elementos.get('Fluxo_E03_E10'), 'bpmn:SequenceFlow');
  const raias = processo.laneSets[0].lanes;
  assert.deepEqual(raias.map((l: { name: string }) => l.name), ['Cliente', 'Vendas', 'Financeiro', 'Logística']);
  const logistica = raias.find((l: { id: string }) => l.id === 'Raia_logistica');
  assert.deepEqual(logistica.flowNodeRef.map((n: { id: string }) => n.id).sort(), ['E07', 'E09', 'E12', 'E13']);
  const plano = rootElement.diagrams[0].plane.planeElement;
  // contorno + 4 raias + 15 etapas + 16 setas
  assert.equal(plano.length, 1 + 4 + 15 + 16);
});

test('BPMN: escapa texto e leva a documentação', async () => {
  const m = minima();
  m.etapas[1]!.nome = 'Conferir "preço" & <margem>';
  m.etapas[1]!.sistema = 'ERP';
  const xml = renderizarBpmn(m);
  assert.match(xml, /name="Conferir &quot;preço&quot; &amp; &lt;margem&gt;"/);
  const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
  assert.deepEqual(warnings, []);
  const tarefa = rootElement.rootElements[1].flowElements.find((f: { id: string }) => f.id === 'T');
  assert.equal(tarefa.name, 'Conferir "preço" & <margem>');
  assert.equal(tarefa.documentation[0].text, 'Sistema: ERP');
});

test('Mermaid: raias viram subgraph, decisões levam rótulo, texto escapado', () => {
  const mmd = renderizarMermaid(exemplo());
  assert.match(mmd, /^flowchart LR$/m);
  assert.match(mmd, /subgraph Raia_financeiro\["Financeiro"\]/);
  assert.match(mmd, /E03\{"Tem estoque\?"\}/);
  assert.match(mmd, /E03 -->\|"Sim"\| E04/);
  assert.match(mmd, /E13\(\(\("Pedido despachado"\)\)\)/);
  assert.equal(textoMermaid('Diz "oi"\nde novo'), '"Diz #quot;oi#quot; de novo"');
});

test('Mermaid: ids sem colisão e sem palavra reservada', () => {
  const ids = idsMermaid(['end', 'A-1', 'A_1', 'ok']);
  assert.equal(ids.get('end'), 'n_end');
  assert.equal(ids.get('A-1'), 'A_1');
  assert.equal(ids.get('A_1'), 'A_1_2');
  assert.equal(ids.get('ok'), 'ok');
});

test('React Flow: raias de fundo fixas, etapas com família e mesmas coordenadas do BPMN', () => {
  const m = exemplo();
  const { nodes, edges } = renderizarReactFlow(m);
  const raias = nodes.filter((n) => n.type === 'raia');
  assert.equal(raias.length, 4);
  assert.ok(raias.every((r) => r.draggable === false && r.zIndex === -1));
  assert.equal(nodes.length, 4 + 15);
  assert.equal(edges.length, 16);
  const e03 = nodes.find((n) => n.id === 'E03')!;
  assert.equal(e03.type, 'gateway');
  assert.match(renderizarBpmn(m), new RegExp(`bpmnElement="E03"[^>]*>\\s*<dc:Bounds x="${e03.position.x}" y="${e03.position.y}"`));
  assert.equal(edges.find((e) => e.id === 'Fluxo_E05_E11')!.label, 'Não');
});

test('renderizar(): a mesma matriz em qualquer linguagem', () => {
  const m = minima();
  assert.match(renderizar('bpmn', m), /<bpmn:definitions/);
  assert.match(renderizar('mermaid', m), /flowchart LR/);
  assert.equal(renderizar('reactflow', m).nodes.length, 4);
});

test('SVG puro: sem HTML dentro, com raias, etapas, setas, cores e texto escapado', async () => {
  const { renderizarSvg, quebrarTexto, calcularLayout } = await import('../src/index.ts');
  const m = exemplo();
  m.etapas.find((e) => e.chave === 'E02')!.nome = 'Registrar <pedido> & "itens"';
  const auto = calcularLayout(m);
  const svg = renderizarSvg(m, { correcoes: { versao: 1, nos: { E07: { corFundo: '#fff3e0', corBorda: '#ef6c00' } }, arestas: {}, raias: {} } });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.equal(/foreignObject/.test(svg), false);
  assert.equal((svg.match(/<polyline /g) ?? []).length, 16);
  assert.match(svg, />Logística</);
  assert.match(svg, /fill="#fff3e0" stroke="#ef6c00"/);
  assert.match(svg, /&lt;pedido&gt; &amp;/);
  assert.match(svg, new RegExp(`viewBox="${auto.pool.x - 20} ${auto.pool.y - 20} `));
  assert.deepEqual(quebrarTexto('Separar e embalar mercadoria', 16), ['Separar e', 'embalar', 'mercadoria']);
});
