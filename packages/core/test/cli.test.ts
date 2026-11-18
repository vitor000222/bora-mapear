import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const EXEMPLO_EN = fileURLToPath(new URL('../../../exemplos/sales-order.json', import.meta.url));
const EXEMPLO_PT = fileURLToPath(new URL('../../../exemplos/pedido-de-venda.json', import.meta.url));
const pasta = mkdtempSync(join(tmpdir(), 'bora-cli-'));
after(() => rmSync(pasta, { recursive: true, force: true }));

/** Roda a CLI com o locale do sistema fixo, para o teste não depender da máquina. */
function bora(args: string[], locale = 'C') {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: locale } });
  return { codigo: r.status, saida: r.stdout, erro: r.stderr };
}

test('CLI: o nome do comando escolhe o idioma, e --lang/--idioma manda mais', () => {
  const en = bora(['validate', EXEMPLO_EN], 'pt_BR.UTF-8');
  assert.equal(en.codigo, 0);
  assert.match(en.saida, /Matrix passed the gate, no warnings\./);

  const pt = bora(['validar', EXEMPLO_PT], 'C');
  assert.equal(pt.codigo, 0);
  assert.match(pt.saida, /Matriz aprovada no portão, sem avisos\./);

  assert.match(bora(['validate', EXEMPLO_EN, '--lang', 'pt']).saida, /Matriz aprovada/);
  assert.match(bora(['validar', EXEMPLO_PT, '--idioma=en']).saida, /Matrix passed/);
});

test('CLI: render grava os quatro arquivos no idioma pedido; renderizar, em português', () => {
  const saidaEn = join(pasta, 'en');
  const r = bora(['render', EXEMPLO_EN, '--output', saidaEn]);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Written to /);
  for (const ext of ['bpmn', 'mmd', 'reactflow.json', 'html']) assert.ok(existsSync(join(saidaEn, `sales-order.${ext}`)), ext);
  const html = readFileSync(join(saidaEn, 'sales-order.html'), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /15 steps · 4 lanes · gate: <strong>passed<\/strong>/);
  assert.match(html, /<th>Next<\/th>/);
  assert.match(html, /<td>Decision \(one path\)<\/td>/);
  assert.match(readFileSync(join(saidaEn, 'sales-order.mmd'), 'utf8'), /^%% Generated from the matrix/m);

  const saidaPt = join(pasta, 'pt');
  const p = bora(['renderizar', EXEMPLO_PT, '--saida', saidaPt]);
  assert.equal(p.codigo, 0, p.erro);
  assert.match(p.saida, /Gerado em /);
  const htmlPt = readFileSync(join(saidaPt, 'pedido-de-venda.html'), 'utf8');
  assert.match(htmlPt, /<html lang="pt-BR">/);
  assert.match(htmlPt, /<th>Próximos<\/th>/);
  assert.match(readFileSync(join(saidaPt, 'pedido-de-venda.mmd'), 'utf8'), /^%% Gerado a partir da matriz/m);
});

test('CLI: render não grava nada com o portão reprovado, a menos que venha --force', () => {
  const matriz = JSON.parse(readFileSync(EXEMPLO_EN, 'utf8'));
  matriz.etapas[0].proximos = [{ para: 'E99' }];
  const ruim = join(pasta, 'ruim.json');
  writeFileSync(ruim, JSON.stringify(matriz));

  const destino = join(pasta, 'reprovada');
  const r = bora(['render', ruim, '--output', destino]);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Nothing was written\. Fix the matrix or use --force\./);
  assert.equal(existsSync(destino), false);

  assert.equal(bora(['render', ruim, '--output', destino, '--force']).codigo, 0);
  assert.ok(existsSync(join(destino, 'sales-order.bpmn')));
  assert.match(bora(['renderizar', ruim, '--saida', join(pasta, 'reprovada-pt')]).erro, /Corrija a matriz ou use --forcar/);
});

test('CLI: extract devolve só o que mudou no BPMN, em frases no idioma pedido', () => {
  const saida = join(pasta, 'extrair');
  assert.equal(bora(['render', EXEMPLO_EN, '--output', saida]).codigo, 0);
  const bpmn = join(saida, 'sales-order.bpmn');

  const intacto = bora(['extract', bpmn, '--matrix', EXEMPLO_EN, '--output', join(pasta, 'nada.json')]);
  assert.equal(intacto.codigo, 0, intacto.erro);
  assert.match(intacto.saida, /No corrections: the diagram is the automatic layout\./);

  // Move E02 60 px para a direita no desenho, como se a pessoa tivesse arrastado no bpmn.io.
  const xml = readFileSync(bpmn, 'utf8');
  const movido = xml.replace(/(bpmnElement="E02"[^>]*>\s*<dc:Bounds x=")([\d.]+)/, (_, a: string, x: string) => `${a}${Number(x) + 60}`);
  assert.notEqual(movido, xml);
  const editado = join(pasta, 'editado.bpmn');
  writeFileSync(editado, movido);

  const destino = join(pasta, 'corrections.json');
  const en = bora(['extract', editado, '--matrix', EXEMPLO_EN, '--output', destino]);
  assert.equal(en.codigo, 0, en.erro);
  assert.match(en.saida, /What the user corrected:/);
  assert.match(en.saida, /Moved .*60 px to the right/);
  assert.match(en.saida, /Corrections saved to /);
  assert.ok(JSON.parse(readFileSync(destino, 'utf8')).nos.E02);

  const pt = bora(['extrair', editado, '--matriz', EXEMPLO_EN, '--saida', join(pasta, 'correcoes.json')]);
  assert.match(pt.saida, /O que o usuário corrigiu:/);
  assert.match(pt.saida, /Moveu .*60 px para a direita/);
});

test('CLI: ajuda, comando desconhecido, opção inválida e matriz fora do formato', () => {
  const ajuda = bora(['--help', '--lang', 'en']);
  assert.equal(ajuda.codigo, 0);
  assert.match(ajuda.saida, /^Usage:/m);
  assert.match(ajuda.saida, /bora render <matrix\.json>/);

  // Sem comando, vale o idioma do sistema.
  assert.match(bora([], 'C').saida, /^Usage:/m);
  const semComando = bora([], 'pt_BR.UTF-8');
  assert.equal(semComando.codigo, 1);
  assert.match(semComando.saida, /^Uso:/m);

  const desconhecido = bora(['renderize', 'x'], 'C');
  assert.equal(desconhecido.codigo, 1);
  assert.match(desconhecido.erro, /Unknown command: renderize/);

  const opcao = bora(['validate', 'x', '--bogus']);
  assert.equal(opcao.codigo, 1);
  assert.match(opcao.erro, /Invalid option: /);

  const ruim = join(pasta, 'fora-do-formato.json');
  writeFileSync(ruim, '{"processo":{}}');
  assert.match(bora(['validate', ruim]).erro, /The matrix is not in the expected format:/);
  assert.match(bora(['validar', ruim]).erro, /Matriz fora do formato:/);
  assert.match(bora(['extract', ruim]).erro, /Missing the path to the matrix\./);
});
