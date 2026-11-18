import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerMatriz, matrizJsonSchema, validarMatriz, type CodigoProblema, type MatrizEntrada } from '../src/index.ts';
import { exemplo, minima } from './apoio.ts';

const codigos = (m: Parameters<typeof validarMatriz>[0]) => validarMatriz(m).problemas.map((p) => p.codigo);

function comEtapas(etapas: MatrizEntrada['etapas'], raias: MatrizEntrada['raias'] = [{ id: 'a', nome: 'A' }]) {
  return lerMatriz({ versaoSchema: 1, processo: { id: 'p', nome: 'P' }, raias, etapas });
}

test('o exemplo passa no portão sem erros nem avisos', () => {
  const r = validarMatriz(exemplo());
  assert.equal(r.ok, true);
  assert.deepEqual(r.problemas, []);
});

test('a matriz mínima passa', () => {
  assert.equal(validarMatriz(minima()).ok, true);
});

const casos: Array<[string, CodigoProblema, MatrizEntrada['etapas']]> = [
  ['destino inexistente', 'DESTINO_INEXISTENTE', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'X' }, { para: 'F' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
  ]],
  ['beco sem saída', 'BECO_SEM_SAIDA', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'T' }] },
    { chave: 'T', tipo: 'tarefa', nome: 'Parar', raia: 'a' },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
  ]],
  ['fim com saída', 'FIM_COM_SAIDA', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'F' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a', proximos: [{ para: 'I' }] },
  ]],
  ['decisão sem rótulo', 'SAIDA_SEM_ROTULO', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'G' }] },
    { chave: 'G', tipo: 'gateway_exclusivo', nome: 'Ok?', raia: 'a', proximos: [{ para: 'F', rotulo: 'Sim' }, { para: 'F2' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
    { chave: 'F2', tipo: 'fim', nome: '', raia: 'a' },
  ]],
  ['inalcançável', 'INALCANCAVEL', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'F' }] },
    { chave: 'S', tipo: 'tarefa', nome: 'Solta', raia: 'a', proximos: [{ para: 'F' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
  ]],
  ['chave repetida', 'CHAVE_REPETIDA', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'F' }] },
    { chave: 'I', tipo: 'tarefa', nome: 'Outra', raia: 'a', proximos: [{ para: 'F' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
  ]],
  ['raia inexistente', 'RAIA_INEXISTENTE', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'F' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'zz' },
  ]],
  ['tarefa sem nome', 'NOME_VAZIO', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'T' }] },
    { chave: 'T', tipo: 'tarefa_usuario', nome: '  ', raia: 'a', proximos: [{ para: 'F' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
  ]],
  ['auto-ligação', 'AUTO_LIGACAO', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'T' }] },
    { chave: 'T', tipo: 'tarefa', nome: 'Repetir', raia: 'a', proximos: [{ para: 'T' }, { para: 'F' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
  ]],
  ['início com entrada', 'INICIO_COM_ENTRADA', [
    { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'G' }] },
    { chave: 'G', tipo: 'gateway_exclusivo', nome: 'De novo?', raia: 'a', proximos: [{ para: 'I', rotulo: 'Sim' }, { para: 'F', rotulo: 'Não' }] },
    { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
  ]],
];

for (const [nome, codigo, etapas] of casos) {
  test(`o portão reprova: ${nome}`, () => {
    const r = validarMatriz(comEtapas(etapas));
    assert.equal(r.ok, false);
    assert.ok(r.problemas.some((p) => p.codigo === codigo && p.severidade === 'erro'), `esperava ${codigo}, veio ${codigos(comEtapas(etapas))}`);
  });
}

test('sem início e sem fim', () => {
  const c = codigos(comEtapas([{ chave: 'T', tipo: 'tarefa', nome: 'Só isso', raia: 'a', proximos: [] }]));
  assert.ok(c.includes('SEM_INICIO'));
  assert.ok(c.includes('SEM_FIM'));
});

test('avisos não reprovam', () => {
  const m = comEtapas(
    [
      { chave: 'I', tipo: 'inicio', nome: '', raia: 'a', proximos: [{ para: 'G' }] },
      { chave: 'G', tipo: 'gateway_paralelo', nome: '', raia: 'a', proximos: [{ para: 'F' }] },
      { chave: 'F', tipo: 'fim', nome: '', raia: 'a' },
    ],
    [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }],
  );
  const r = validarMatriz(m);
  assert.equal(r.ok, true);
  assert.deepEqual(r.problemas.map((p) => p.codigo).sort(), ['GATEWAY_INUTIL', 'RAIA_VAZIA']);
});

test('formato inválido explica o campo', () => {
  assert.throws(() => lerMatriz({ versaoSchema: 1, processo: { id: 'p', nome: 'P' }, raias: [], etapas: [] }), /raias/);
  assert.throws(
    () => lerMatriz({ versaoSchema: 1, processo: { id: 'p', nome: 'P' }, raias: [{ id: 'a', nome: 'A' }], etapas: [{ chave: '1x', tipo: 'tarefa', nome: 'x', raia: 'a' }] }),
    /chave/,
  );
});

test('o JSON Schema sai para os agentes', () => {
  const schema = matrizJsonSchema() as { type: string; required: string[] };
  assert.equal(schema.type, 'object');
  assert.deepEqual([...schema.required].sort(), ['etapas', 'processo', 'raias', 'versaoSchema']);
});
