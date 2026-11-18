import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularLayout, calcularNiveis, rotaCruza } from '../src/index.ts';
import { exemplo } from './apoio.ts';

test('o layout é determinístico', () => {
  assert.deepEqual(calcularLayout(exemplo()), calcularLayout(exemplo()));
});

test('o laço de espera é reconhecido como volta e não empurra colunas', () => {
  const { nivel, voltas } = calcularNiveis(exemplo());
  assert.deepEqual([...voltas], ['E14>E03']);
  assert.equal(nivel.get('E01'), 0);
  assert.equal(nivel.get('E03'), 2);
  assert.equal(nivel.get('E13'), 9);
});

test('toda etapa fica dentro da faixa da sua raia', () => {
  const m = exemplo();
  const layout = calcularLayout(m);
  for (const e of m.etapas) {
    const no = layout.nos[e.chave]!;
    const raia = layout.raias.find((r) => r.id === e.raia)!;
    assert.ok(no.y >= raia.y && no.y + no.altura <= raia.y + raia.altura, `${e.chave} fora da raia ${e.raia}`);
    assert.ok(no.x >= raia.x && no.x + no.largura <= raia.x + raia.largura, `${e.chave} fora da largura da raia`);
  }
});

test('raias empilhadas sem sobreposição, dentro do contorno do processo', () => {
  const { raias, pool } = calcularLayout(exemplo());
  for (let i = 1; i < raias.length; i++) assert.equal(raias[i]!.y, raias[i - 1]!.y + raias[i - 1]!.altura);
  assert.equal(raias[0]!.y, pool.y);
  assert.equal(raias.at(-1)!.y + raias.at(-1)!.altura, pool.y + pool.altura);
});

test('etapas na mesma célula não se sobrepõem', () => {
  const nos = Object.values(calcularLayout(exemplo()).nos);
  for (const a of nos) {
    for (const b of nos) {
      if (a === b) continue;
      const sobrepoe = a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura;
      assert.ok(!sobrepoe, `${a.chave} sobrepõe ${b.chave}`);
    }
  }
});

test('setas para frente vão da direita da origem à esquerda do destino; a volta passa por cima', () => {
  const { arestas, nos } = calcularLayout(exemplo());
  const ida = arestas.find((a) => a.id === 'Fluxo_E01_E02')!;
  assert.equal(ida.pontos[0]!.x, nos['E01']!.x + nos['E01']!.largura);
  assert.equal(ida.pontos.at(-1)!.x, nos['E02']!.x);
  const volta = arestas.find((a) => a.id === 'Fluxo_E14_E03')!;
  const yTopo = Math.min(...volta.pontos.map((p) => p.y));
  assert.ok(yTopo < nos['E14']!.y && yTopo < nos['E03']!.y);
});

test('nenhuma seta automática atravessa uma etapa que não é a origem nem o destino', () => {
  const { arestas, nos } = calcularLayout(exemplo());
  for (const a of arestas) {
    for (const no of Object.values(nos)) {
      if (no.chave === a.de || no.chave === a.para) continue;
      assert.ok(!rotaCruza(a.pontos, no), `${a.id} atravessa ${no.chave}`);
    }
  }
});

test('nome da decisão fica acima e à esquerda do centro; rótulo da seta colado à saída', () => {
  const { arestas, nos } = calcularLayout(exemplo());
  const e03 = nos['E03']!;
  const rotulo = e03.caixaRotulo!;
  assert.ok(rotulo.y + rotulo.altura <= e03.y, 'acima do losango');
  assert.ok(rotulo.x + rotulo.largura < e03.x + e03.largura / 2, 'à esquerda do centro, onde a seta de volta entra');
  const nao = arestas.find((a) => a.id === 'Fluxo_E03_E10')!;
  assert.equal(nao.caixaRotulo!.x, nao.pontos[0]!.x + 4);
  assert.ok(nao.caixaRotulo!.y + nao.caixaRotulo!.altura <= nao.pontos[0]!.y, 'acima da linha que sai para a direita');
  const sim = arestas.find((a) => a.id === 'Fluxo_E03_E04')!;
  assert.equal(sim.caixaRotulo!.y, sim.pontos[0]!.y + 2, 'abaixo do losango, ao lado da linha que desce');
});

test('etapa movida para baixo faz a raia crescer e empurra as raias de baixo', () => {
  const m = exemplo();
  const antes = calcularLayout(m);
  const e02 = antes.nos['E02']!;
  const depois = calcularLayout(m, { versao: 1, nos: { E02: { x: e02.x, y: e02.y + 200 } }, arestas: {}, raias: {} });
  const vendas = depois.raias.find((r) => r.id === 'vendas')!;
  assert.ok(vendas.y + vendas.altura >= e02.y + 200 + e02.altura);
  assert.ok(depois.nos['E04']!.y > antes.nos['E04']!.y, 'a etapa automática da raia de baixo desce junto');
});
