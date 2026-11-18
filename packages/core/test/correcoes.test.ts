import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularLayout,
  correcoesVazias,
  descreverCorrecoes,
  descreverMudanca,
  extrairCorrecoesDoBpmn,
  extrairCorrecoesDoReactFlow,
  lerMatriz,
  mesclarCorrecoes,
  renderizarBpmn,
  renderizarReactFlow,
  type Correcoes,
} from '../src/index.ts';
import { exemplo } from './apoio.ts';

test('desenho sem edição não gera correção', () => {
  const m = exemplo();
  const r = extrairCorrecoesDoBpmn(renderizarBpmn(m), m);
  assert.deepEqual(r.correcoes, correcoesVazias());
  assert.deepEqual(r.desconhecidos, []);
  assert.deepEqual(r.ausentes, []);
});

test('ida e volta: correções aplicadas no BPMN voltam iguais na extração', () => {
  const m = exemplo();
  const auto = calcularLayout(m);
  const correcoes: Correcoes = {
    versao: 1,
    nos: {
      E04: { x: auto.nos['E04']!.x + 40, y: auto.nos['E04']!.y + 10 },
      E07: { largura: 140, altura: 90, x: auto.nos['E07']!.x, y: auto.nos['E07']!.y },
      E05: { corFundo: '#fff3e0', corBorda: '#ef6c00' },
    },
    arestas: { Fluxo_E03_E10: { pontos: [{ x: 500, y: 300 }, { x: 500, y: 330 }, { x: 600, y: 330 }] } },
    raias: { cliente: { x: 190, y: 80, largura: 1660, altura: 160 } },
  };
  const xml = renderizarBpmn(m, { correcoes });
  const volta = extrairCorrecoesDoBpmn(xml, m).correcoes;
  assert.deepEqual(volta.nos, correcoes.nos);
  assert.deepEqual(volta.arestas, correcoes.arestas);
  assert.deepEqual(volta.raias, correcoes.raias);
  // e a extração reproduz o desenho
  assert.equal(renderizarBpmn(m, { correcoes: volta }), xml);
});

test('lê o XML como o bpmn-js exporta: prefixos, atributos fora de ordem, rótulo e cores bioc', () => {
  const m = exemplo();
  const auto = calcularLayout(m);
  const original = renderizarBpmn(m);
  const e02 = auto.nos['E02']!;
  // Simula o bpmn-js: moveu E02, pintou pelo bioc, acrescentou BPMNLabel e uma tarefa nova.
  const editado = original
    .replace(
      /<bpmndi:BPMNShape id="E02_di" bpmnElement="E02">\s*<dc:Bounds[^>]*\/>/,
      `<bpmndi:BPMNShape bioc:fill="#e3f2fd" id="E02_di" bpmnElement="E02" bioc:stroke="#1565c0">\n` +
        `        <dc:Bounds height="80" width="100" y="${e02.y + 10}" x="${e02.x}" />\n` +
        `        <bpmndi:BPMNLabel><dc:Bounds x="1" y="2" width="3" height="4" /></bpmndi:BPMNLabel>`,
    )
    .replace(
      '</bpmndi:BPMNPlane>',
      '  <bpmndi:BPMNShape id="Activity_1x_di" bpmnElement="Activity_1x"><dc:Bounds x="900" y="500" width="100" height="80" /></bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>',
    );
  const r = extrairCorrecoesDoBpmn(editado, m);
  assert.deepEqual(r.correcoes.nos, { E02: { x: e02.x, y: e02.y + 10, corFundo: '#e3f2fd', corBorda: '#1565c0' } });
  assert.deepEqual(r.correcoes.raias, {}, 'mexer dentro da raia não mexe nas raias');
  assert.deepEqual(r.desconhecidos, ['Activity_1x']);
});

test('aponta etapa da matriz que sumiu do desenho', () => {
  const m = exemplo();
  const semE10 = renderizarBpmn(m).replace(/<bpmndi:BPMNShape id="E10_di"[\s\S]*?<\/bpmndi:BPMNShape>/, '');
  assert.deepEqual(extrairCorrecoesDoBpmn(semE10, m).ausentes, ['E10']);
});

test('correções sobrevivem a uma mudança na matriz', () => {
  const m = exemplo();
  const auto = calcularLayout(m);
  const correcoes: Correcoes = { versao: 1, nos: { E12: { x: auto.nos['E12']!.x, y: auto.nos['E12']!.y + 60, corFundo: '#e8f5e9' } }, arestas: {}, raias: {} };
  // Nova versão da matriz: uma etapa nova entre E12 e E13.
  const nova = lerMatriz(JSON.parse(JSON.stringify(m)));
  nova.etapas.find((e) => e.chave === 'E12')!.proximos = [{ para: 'E16' }];
  nova.etapas.push({ chave: 'E16', tipo: 'tarefa_usuario', nome: 'Registrar rastreio', raia: 'logistica', proximos: [{ para: 'E13' }] });
  const layout = calcularLayout(nova, correcoes);
  assert.equal(layout.nos['E12']!.y, auto.nos['E12']!.y + 60);
  assert.equal(layout.nos['E12']!.corFundo, '#e8f5e9');
  assert.ok(layout.nos['E16']);
  assert.ok(layout.nos['E13']!.x > auto.nos['E13']!.x, 'o fim andou uma coluna para a direita');
});

test('React Flow: arrastar vira correção, e as raias são ignoradas', () => {
  const m = exemplo();
  const { nodes } = renderizarReactFlow(m);
  const movidos = nodes.map((n) => (n.id === 'E08' ? { ...n, position: { x: n.position.x + 25, y: n.position.y - 15 } } : n));
  const r = extrairCorrecoesDoReactFlow(movidos, m);
  const e08 = calcularLayout(m).nos['E08']!;
  assert.deepEqual(r.correcoes.nos, { E08: { x: e08.x + 25, y: e08.y - 15 } });
  assert.deepEqual(r.correcoes.raias, {});
});

test('o registro descreve as correções em frases', () => {
  const m = exemplo();
  const auto = calcularLayout(m);
  const frases = descreverCorrecoes(m, {
    versao: 1,
    nos: { E04: { x: auto.nos['E04']!.x + 40, y: auto.nos['E04']!.y - 10, corFundo: '#fff3e0' } },
    arestas: { Fluxo_E05_E11: { pontos: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } },
    raias: { vendas: { altura: 300 } },
  });
  assert.deepEqual(frases, [
    'Moveu "Analisar crédito do cliente" (E04) 40 px para a direita e 10 px para cima.',
    'Pintou "Analisar crédito do cliente" (E04): fundo #fff3e0.',
    'Redesenhou a seta E05 → E11 ("Não") com 2 pontos.',
    'Mudou a altura da raia "Vendas" de 120 para 300 px.',
  ]);
});

test('mesclar: a correção nova vence campo a campo', () => {
  const a: Correcoes = { versao: 1, nos: { E01: { x: 1, y: 2, corFundo: '#000' } }, arestas: {}, raias: {} };
  const b: Correcoes = { versao: 1, nos: { E01: { x: 5, y: 6 } }, arestas: {}, raias: {} };
  assert.deepEqual(mesclarCorrecoes(a, b).nos['E01'], { x: 5, y: 6, corFundo: '#000' });
});

test('a mudança entre duas gravações lista só o que mudou e o que voltou ao automático', () => {
  const m = exemplo();
  const auto = calcularLayout(m);
  const antes: Correcoes = {
    versao: 1,
    nos: { E04: { x: auto.nos['E04']!.x + 40, y: auto.nos['E04']!.y }, E05: { corFundo: '#fff3e0' } },
    arestas: {},
    raias: {},
  };
  const depois: Correcoes = {
    versao: 1,
    nos: { E04: { x: auto.nos['E04']!.x + 40, y: auto.nos['E04']!.y }, E08: { corBorda: '#1565c0' } },
    arestas: {},
    raias: {},
  };
  assert.deepEqual(descreverMudanca(m, antes, depois), [
    'Pintou "Emitir nota fiscal" (E08): borda #1565c0.',
    'Voltou "Crédito aprovado?" (E05) ao automático.',
  ]);
  assert.deepEqual(descreverMudanca(m, depois, depois), []);
});

test('pintar uma etapa já movida registra só a cor', () => {
  const m = exemplo();
  const auto = calcularLayout(m);
  const movida = { x: auto.nos['E04']!.x + 60, y: auto.nos['E04']!.y };
  const antes: Correcoes = { versao: 1, nos: { E04: movida }, arestas: {}, raias: {} };
  const depois: Correcoes = { versao: 1, nos: { E04: { ...movida, corFundo: '#e3f2fd' } }, arestas: {}, raias: {} };
  assert.deepEqual(descreverMudanca(m, antes, depois), ['Pintou "Analisar crédito do cliente" (E04): fundo #e3f2fd.']);
});
