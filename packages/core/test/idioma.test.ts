import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarOperacoes,
  compararMatrizes,
  correcoesVazias,
  csvParaMatriz,
  descreverMudanca,
  descreverOperacoes,
  ErroImportacao,
  formatarValidacao,
  gruposTipo,
  importarBpmn,
  importarMermaid,
  renderizarBpmn,
  renderizarMermaid,
  lerIdioma,
  matrizParaCsv,
  rotulosTipo,
  TIPOS_ETAPA,
  validarMatriz,
} from '../src/index.ts';
import { exemplo } from './apoio.ts';

test('lerIdioma: inglês só quando pedido, português no resto', () => {
  assert.equal(lerIdioma('en'), 'en');
  assert.equal(lerIdioma('en-US,en;q=0.9,pt;q=0.8'), 'en');
  assert.equal(lerIdioma('pt-BR'), 'pt');
  assert.equal(lerIdioma(undefined), 'pt');
  assert.equal(lerIdioma('fr'), 'pt');
});

test('todo tipo tem rótulo nos dois idiomas, e todo tipo está num grupo', () => {
  for (const idioma of ['pt', 'en'] as const) {
    const rotulos = rotulosTipo(idioma);
    for (const t of TIPOS_ETAPA) assert.ok(rotulos[t], `${idioma}: ${t}`);
    assert.deepEqual(gruposTipo(idioma).flatMap((g) => g.tipos).sort(), [...TIPOS_ETAPA].sort());
  }
  assert.equal(rotulosTipo('en').gateway_exclusivo, 'Decision (one path)');
  assert.equal(gruposTipo('en')[0]!.grupo, 'Events');
});

test('o portão fala inglês quando pedido, com os mesmos códigos', () => {
  const m = exemplo();
  m.etapas.find((e) => e.chave === 'E02')!.proximos = [];
  const pt = validarMatriz(m);
  const en = validarMatriz(m, { idioma: 'en' });
  assert.deepEqual(
    en.problemas.map((p) => p.codigo),
    pt.problemas.map((p) => p.codigo),
  );
  assert.match(en.problemas.find((p) => p.codigo === 'BECO_SEM_SAIDA')!.mensagem, /has no outgoing flow/);
  assert.match(formatarValidacao(en, 'en'), /^Matrix failed the gate:/);
  assert.match(formatarValidacao(pt), /^Matriz reprovada no portão:/);
});

test('comparação e registro de correções em inglês', () => {
  const m = exemplo();
  const nova = structuredClone(m);
  nova.etapas.find((e) => e.chave === 'E02')!.nome = 'Enter order';
  nova.etapas.find((e) => e.chave === 'E02')!.descricao = 'outra';
  const frases = compararMatrizes(m, nova, { idioma: 'en' });
  assert.ok(frases.some((f) => /^E02 renamed: /.test(f)), frases.join(' | '));
  assert.ok(frases.some((f) => /^Details of /.test(f)));
  assert.ok(!compararMatrizes(m, nova, { idioma: 'en', detalhes: false }).some((f) => /^Details of /.test(f)));

  const depois = correcoesVazias();
  depois.nos['E02'] = { x: 500, y: 300, corFundo: '#ffcc00' };
  const registro = descreverMudanca(m, correcoesVazias(), depois, 'en');
  assert.ok(registro.some((f) => /^Moved .* to the (right|left)/.test(f)), registro.join(' | '));
  assert.ok(registro.some((f) => /^Colored .*fill #ffcc00/.test(f)));
});

test('CSV em inglês vai e volta, e a volta aceita os dois idiomas', () => {
  const m = exemplo();
  const csv = matrizParaCsv(m, { idioma: 'en' });
  assert.ok(csv.startsWith('﻿key,type,name,lane,next'));
  assert.match(csv, /Decision \(one path\)/);
  const volta = csvParaMatriz(csv, m.processo.nome, { idioma: 'en' });
  assert.deepEqual(
    volta.matriz.etapas.map((e) => [e.chave, e.tipo, e.proximos]),
    m.etapas.map((e) => [e.chave, e.tipo, e.proximos]),
  );
  // Exportado em inglês, lido com mensagens em português: continua valendo.
  assert.equal(csvParaMatriz(csv).matriz.etapas.length, m.etapas.length);
  assert.throws(() => csvParaMatriz('key,name\nE1,x', undefined, { idioma: 'en' }), (e: unknown) => e instanceof ErroImportacao && /Missing columns: type, lane/.test(e.message));
});

test('BPMN e Mermaid gerados em inglês, e o BPMN volta com os detalhes', async () => {
  const m = exemplo();
  const xml = renderizarBpmn(m, { idioma: 'en' });
  assert.match(xml, /System: ERP/);
  assert.doesNotMatch(xml, /Sistema: /);
  const volta = await importarBpmn(xml, { idioma: 'en' });
  assert.equal(volta.matriz.etapas.find((e) => e.chave === 'E02')!.sistema, 'ERP');
  assert.deepEqual(volta.matriz.etapas.find((e) => e.chave === 'E04')!.evidencias, ['EV-004', 'EV-005']);
  assert.match(renderizarMermaid(m, { idioma: 'en' }), /%% Generated from the matrix/);
});

test('importador Mermaid e operações em inglês', () => {
  assert.throws(() => importarMermaid('sequenceDiagram', undefined, { idioma: 'en' }), /only Mermaid flowcharts/);
  const r = importarMermaid('flowchart LR\n  A([Start]) --> B[Do it] --> C([End])', undefined, { idioma: 'en' });
  assert.equal(r.matriz.processo.nome, 'Imported process');
  assert.equal(r.matriz.raias[0]!.nome, 'General');

  const m = exemplo();
  assert.throws(() => aplicarOperacoes(m, [{ op: 'remover_raia', id: 'nao-existe' }], 'en'), /^Error: Operation 1: lane "nao-existe" does not exist\.$|Operation 1: lane "nao-existe" does not exist\./);
  assert.deepEqual(descreverOperacoes(m, [{ op: 'remover_raia', id: 'vendas' }], 'en'), ['Removes lane vendas.']);
});
