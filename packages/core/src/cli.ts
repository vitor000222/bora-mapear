#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  descreverCorrecoes,
  extrairCorrecoesDoBpmn,
  formatarValidacao,
  gerarPrevia,
  lerMatriz,
  matrizJsonSchema,
  renderizarBpmn,
  renderizarMermaid,
  renderizarReactFlow,
  validarMatriz,
  type Correcoes,
  type Matriz,
} from './index.ts';

const AJUDA = `Bora Mapear · núcleo

Uso:
  bora validar <matriz.json>
  bora renderizar <matriz.json> [--correcoes correcoes.json] [--saida pasta] [--forcar]
  bora extrair <desenho.bpmn> --matriz <matriz.json> [--saida correcoes.json]
  bora schema

validar     roda o portão e lista erros e avisos
renderizar  gera .bpmn, .mmd, .reactflow.json e uma prévia .html
extrair     compara o BPMN editado (bpmn-js, Camunda Modeler) com o layout automático
            e grava só o que o usuário corrigiu
schema      imprime o JSON Schema da matriz (para os agentes)
`;

async function lerJson<T>(caminho: string): Promise<T> {
  return JSON.parse(await readFile(caminho, 'utf8')) as T;
}

async function carregarMatriz(caminho: string | undefined): Promise<Matriz> {
  if (!caminho) throw new Error('Faltou o caminho da matriz.');
  return lerMatriz(await lerJson(caminho));
}

async function principal(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      saida: { type: 'string' },
      correcoes: { type: 'string' },
      matriz: { type: 'string' },
      forcar: { type: 'boolean', default: false },
      ajuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [comando, alvo] = positionals;

  if (!comando || values.ajuda) {
    console.log(AJUDA);
    return comando ? 0 : 1;
  }

  if (comando === 'schema') {
    console.log(JSON.stringify(matrizJsonSchema(), null, 2));
    return 0;
  }

  if (comando === 'validar') {
    const resultado = validarMatriz(await carregarMatriz(alvo));
    console.log(formatarValidacao(resultado));
    return resultado.ok ? 0 : 1;
  }

  if (comando === 'renderizar') {
    const matriz = await carregarMatriz(alvo);
    const validacao = validarMatriz(matriz);
    console.log(formatarValidacao(validacao));
    if (!validacao.ok && !values.forcar) {
      console.error('\nNada foi gerado. Corrija a matriz ou use --forcar.');
      return 1;
    }
    const correcoes = values.correcoes ? await lerJson<Correcoes>(values.correcoes) : undefined;
    const opcoes = correcoes ? { correcoes } : {};
    const pasta = resolve(values.saida ?? 'saida');
    await mkdir(pasta, { recursive: true });
    const base = join(pasta, matriz.processo.id);
    const bpmn = renderizarBpmn(matriz, opcoes);
    const mermaid = renderizarMermaid(matriz);
    const arquivos: Array<[string, string]> = [
      [`${base}.bpmn`, bpmn],
      [`${base}.mmd`, mermaid],
      [`${base}.reactflow.json`, JSON.stringify(renderizarReactFlow(matriz, opcoes), null, 2) + '\n'],
      [`${base}.html`, gerarPrevia({ matriz, validacao, bpmn, mermaid })],
    ];
    for (const [caminho, conteudo] of arquivos) await writeFile(caminho, conteudo, 'utf8');
    console.log(`\nGerado em ${pasta}:`);
    for (const [caminho] of arquivos) console.log(`  ${caminho}`);
    return 0;
  }

  if (comando === 'extrair') {
    if (!alvo) throw new Error('Faltou o caminho do BPMN editado.');
    const matriz = await carregarMatriz(values.matriz);
    const { correcoes, desconhecidos, ausentes } = extrairCorrecoesDoBpmn(await readFile(alvo, 'utf8'), matriz);
    const frases = descreverCorrecoes(matriz, correcoes);
    console.log(frases.length ? `O que o usuário corrigiu:\n${frases.map((f) => `  - ${f}`).join('\n')}` : 'Nenhuma correção: o desenho é o layout automático.');
    if (desconhecidos.length) console.log(`\nNo desenho e fora da matriz (edição de conteúdo): ${desconhecidos.join(', ')}`);
    if (ausentes.length) console.log(`Na matriz e fora do desenho: ${ausentes.join(', ')}`);
    const destino = values.saida ?? 'correcoes.json';
    await writeFile(destino, JSON.stringify(correcoes, null, 2) + '\n', 'utf8');
    console.log(`\nCorreções gravadas em ${resolve(destino)}`);
    return 0;
  }

  console.error(`Comando desconhecido: ${comando}\n`);
  console.log(AJUDA);
  return 1;
}

principal(process.argv.slice(2)).then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  },
);
