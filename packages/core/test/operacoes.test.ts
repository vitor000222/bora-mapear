import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOperacoes, descreverOperacoes, ErroOperacao, ListaOperacoesSchema, validarMatriz } from '../src/index.ts';
import { exemplo } from './apoio.ts';

test('adicionar etapa no meio e religar o fluxo mantém a matriz aprovada', () => {
  const m = exemplo();
  const nova = aplicarOperacoes(m, [
    {
      op: 'adicionar_etapa',
      depoisDe: 'E12',
      etapa: { chave: 'E16', tipo: 'tarefa_usuario', nome: 'Registrar rastreio', raia: 'logistica', proximos: [{ para: 'E13' }] },
    },
    { op: 'alterar_etapa', chave: 'E12', campos: { proximos: [{ para: 'E16' }] } },
  ]);
  assert.equal(nova.etapas.findIndex((e) => e.chave === 'E16'), nova.etapas.findIndex((e) => e.chave === 'E12') + 1);
  assert.equal(validarMatriz(nova).ok, true);
  assert.equal(m.etapas.length, 15, 'a original não muda');
});

test('remover etapa religa quem chegava nela, levando o rótulo da decisão', () => {
  const m = exemplo();
  const nova = aplicarOperacoes(m, [{ op: 'remover_etapa', chave: 'E10', religarPara: [{ para: 'E14' }] }]);
  assert.deepEqual(nova.etapas.find((e) => e.chave === 'E03')!.proximos, [
    { para: 'E04', rotulo: 'Sim' },
    { para: 'E14', rotulo: 'Não' },
  ]);
  assert.equal(validarMatriz(nova).ok, true);
});

test('raias: adicionar, renomear e não remover raia em uso', () => {
  const m = exemplo();
  const nova = aplicarOperacoes(m, [
    { op: 'adicionar_raia', raia: { id: 'gerencia', nome: 'Gerência' }, depoisDe: 'vendas' },
    { op: 'renomear_raia', id: 'logistica', nome: 'Expedição' },
  ]);
  assert.deepEqual(nova.raias.map((r) => r.id), ['cliente', 'vendas', 'gerencia', 'financeiro', 'logistica']);
  assert.equal(nova.raias.find((r) => r.id === 'logistica')!.nome, 'Expedição');
  assert.throws(() => aplicarOperacoes(m, [{ op: 'remover_raia', id: 'vendas' }]), /ainda tem etapas/);
});

test('erro aponta a operação e a causa', () => {
  const m = exemplo();
  assert.throws(
    () => aplicarOperacoes(m, [{ op: 'alterar_etapa', chave: 'E02', campos: { nome: 'x' } }, { op: 'alterar_etapa', chave: 'E99', campos: { nome: 'y' } }]),
    (e: unknown) => e instanceof ErroOperacao && e.indice === 1 && /E99/.test(e.message),
  );
});

test('o schema aceita a resposta do agente e as frases descrevem cada operação', () => {
  const lista = ListaOperacoesSchema.parse({
    resumo: 'Inclui aprovação da gerência',
    operacoes: [
      { op: 'adicionar_raia', raia: { id: 'gerencia', nome: 'Gerência' } },
      { op: 'remover_etapa', chave: 'E10' },
    ],
  });
  assert.deepEqual(descreverOperacoes(exemplo(), lista.operacoes), [
    'Adiciona a raia "Gerência".',
    'Remove "Avisar cliente sobre o prazo" (E10).',
  ]);
});

test('alterar só o nome não mexe nas saídas da etapa', () => {
  const lista = ListaOperacoesSchema.parse({ resumo: 'x', operacoes: [{ op: 'alterar_etapa', chave: 'E02', campos: { nome: 'Registrar pedido' } }] });
  const op = lista.operacoes[0]!;
  assert.ok(op.op === 'alterar_etapa' && !('proximos' in op.campos));
  const nova = aplicarOperacoes(exemplo(), lista.operacoes);
  assert.deepEqual(nova.etapas.find((e) => e.chave === 'E02')!.proximos, [{ para: 'E03' }]);
});
