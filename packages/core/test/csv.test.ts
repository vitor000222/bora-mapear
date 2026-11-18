import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvParaMatriz, detectarFormato, ErroImportacao, lerCsv, matrizParaCsv, validarMatriz } from '../src/index.ts';
import { exemplo } from './apoio.ts';

test('a matriz vai e volta pelo CSV sem perder nada', () => {
  const m = exemplo();
  m.raias.push({ id: 'gerencia', nome: 'Gerência' });
  m.etapas.find((e) => e.chave === 'E02')!.descricao = 'Texto com ; ponto e vírgula, "aspas"\ne quebra de linha';
  const csv = matrizParaCsv(m);
  assert.ok(csv.startsWith('﻿chave;tipo;nome;raia;proximos'));
  assert.match(csv, /E03;Decisão \(um caminho\);Tem estoque\?;Vendas;E04: Sim, E10: Não/);
  assert.match(csv, /0,7/, 'decimal com vírgula para o Excel em português');
  const volta = csvParaMatriz(csv, 'Pedido de venda');
  assert.deepEqual(volta.matriz.raias.map((r) => r.nome), ['Cliente', 'Vendas', 'Financeiro', 'Logística', 'Gerência']);
  assert.deepEqual(
    volta.matriz.etapas.map((e) => ({ ...e, raia: volta.matriz.raias.find((r) => r.id === e.raia)!.nome })),
    m.etapas.map((e) => ({ ...e, raia: m.raias.find((r) => r.id === e.raia)!.nome })),
  );
  assert.deepEqual(volta.avisos, []);
  assert.equal(detectarFormato(csv), 'csv');
});

test('planilha feita à mão: vírgula, tipo pelo código ou nome, cabeçalho com acento e maiúscula', () => {
  const csv = [
    'Chave,Tipo,Nome,Raia,Próximos,Revisar humano,Confiança',
    'I1,inicio,Pedido chega,Vendas,T1,,',
    'T1,Tarefa manual,Conferir pedido,Vendas,"G1",sim,0.6',
    'G1,Decisão (um caminho),Pedido completo?,Vendas,"F1: Sim, T1: Não",,',
    'F1,fim,Pedido aceito,Vendas,,,',
    'X1,qualquer coisa,Outra,Vendas,F1,,',
  ].join('\n');
  const r = csvParaMatriz(csv);
  const e = (c: string) => r.matriz.etapas.find((x) => x.chave === c)!;
  assert.equal(e('T1').tipo, 'tarefa_manual');
  assert.equal(e('T1').revisarHumano, true);
  assert.equal(e('T1').confianca, 0.6);
  assert.deepEqual(e('G1').proximos, [{ para: 'F1', rotulo: 'Sim' }, { para: 'T1', rotulo: 'Não' }]);
  assert.equal(e('X1').tipo, 'tarefa');
  assert.match(r.avisos[0]!, /Linha 6: tipo "qualquer coisa"/);
});

test('erros claros: coluna faltando e chave inválida com o número da linha', () => {
  assert.throws(() => csvParaMatriz('chave;nome\nE1;x'), (e: unknown) => e instanceof ErroImportacao && /tipo, raia/.test(e.message));
  assert.throws(() => csvParaMatriz('chave;tipo;nome;raia\n1x;tarefa;x;A'), /linha 2/);
});

test('leitor de CSV: aspas dobradas, separador e quebra de linha dentro do campo', () => {
  assert.deepEqual(lerCsv('a;"b;c";"d ""e""\nf"\r\n1;2;3', ';'), [
    ['a', 'b;c', 'd "e"\nf'],
    ['1', '2', '3'],
  ]);
});

test('vínculo de subprocesso só faz sentido no tipo subprocesso', () => {
  const m = exemplo();
  m.etapas.find((e) => e.chave === 'E07')!.subprocesso = 'outro-mapeamento';
  assert.ok(validarMatriz(m).problemas.some((p) => p.codigo === 'SUBPROCESSO_EM_ETAPA_COMUM' && p.chave === 'E07'));
  m.etapas.find((e) => e.chave === 'E07')!.tipo = 'subprocesso';
  assert.equal(validarMatriz(m).problemas.length, 0);
});
