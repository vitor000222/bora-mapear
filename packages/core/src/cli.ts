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
  type Idioma,
  type Matriz,
} from './index.ts';

// Cada comando tem o nome em português e em inglês. O nome em inglês também escolhe o idioma das mensagens,
// a menos que --lang (ou --idioma) diga outro.
type Comando = 'validar' | 'renderizar' | 'extrair' | 'schema';
const COMANDOS: Record<string, { comando: Comando; idioma?: Idioma }> = {
  validar: { comando: 'validar', idioma: 'pt' },
  validate: { comando: 'validar', idioma: 'en' },
  renderizar: { comando: 'renderizar', idioma: 'pt' },
  render: { comando: 'renderizar', idioma: 'en' },
  extrair: { comando: 'extrair', idioma: 'pt' },
  extract: { comando: 'extrair', idioma: 'en' },
  schema: { comando: 'schema' },
};

const TEXTOS = {
  pt: {
    ajuda: `Bora Mapear · núcleo

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

Idioma: --idioma pt|en (ou --lang). Sem ele, vale o do comando: validate, render e
extract são os mesmos comandos em inglês e respondem em inglês. Em schema, vale o do sistema.
`,
    faltouMatriz: 'Faltou o caminho da matriz.',
    faltouBpmn: 'Faltou o caminho do BPMN editado.',
    nadaGerado: 'Nada foi gerado. Corrija a matriz ou use --forcar.',
    saidaPadrao: 'saida',
    correcoesPadrao: 'correcoes.json',
    geradoEm: (pasta: string) => `Gerado em ${pasta}:`,
    corrigiu: 'O que o usuário corrigiu:',
    nenhumaCorrecao: 'Nenhuma correção: o desenho é o layout automático.',
    desconhecidos: (chaves: string) => `No desenho e fora da matriz (edição de conteúdo): ${chaves}`,
    ausentes: (chaves: string) => `Na matriz e fora do desenho: ${chaves}`,
    gravadas: (caminho: string) => `Correções gravadas em ${caminho}`,
    comandoDesconhecido: (comando: string) => `Comando desconhecido: ${comando}`,
    opcaoInvalida: (motivo: string) => `Opção inválida: ${motivo}`,
  },
  en: {
    ajuda: `Bora Mapear · core

Usage:
  bora validate <matrix.json>
  bora render <matrix.json> [--corrections corrections.json] [--output folder] [--force]
  bora extract <diagram.bpmn> --matrix <matrix.json> [--output corrections.json]
  bora schema

validate    runs the gate and lists errors and warnings
render      writes .bpmn, .mmd, .reactflow.json and an .html preview
extract     compares the edited BPMN (bpmn-js, Camunda Modeler) with the automatic layout
            and saves only what the user corrected
schema      prints the JSON Schema of the matrix (for the agents)

Language: --lang en|pt (or --idioma). Without it, the command decides: validar, renderizar
and extrair are the same commands in Portuguese and answer in Portuguese. For schema, the
system language is used.
`,
    faltouMatriz: 'Missing the path to the matrix.',
    faltouBpmn: 'Missing the path to the edited BPMN.',
    nadaGerado: 'Nothing was written. Fix the matrix or use --force.',
    saidaPadrao: 'output',
    correcoesPadrao: 'corrections.json',
    geradoEm: (pasta: string) => `Written to ${pasta}:`,
    corrigiu: 'What the user corrected:',
    nenhumaCorrecao: 'No corrections: the diagram is the automatic layout.',
    desconhecidos: (chaves: string) => `In the diagram but not in the matrix (content edit): ${chaves}`,
    ausentes: (chaves: string) => `In the matrix but not in the diagram: ${chaves}`,
    gravadas: (caminho: string) => `Corrections saved to ${caminho}`,
    comandoDesconhecido: (comando: string) => `Unknown command: ${comando}`,
    opcaoInvalida: (motivo: string) => `Invalid option: ${motivo}`,
  },
} satisfies Record<Idioma, unknown>;

/** Idioma do sistema: português se o locale começa com "pt", inglês nos demais (como a interface faz). */
function idiomaDoSistema(): Idioma {
  const locale = process.env['LC_ALL'] || process.env['LC_MESSAGES'] || process.env['LANG'] || Intl.DateTimeFormat().resolvedOptions().locale;
  return /^pt/i.test(locale) ? 'pt' : 'en';
}

function lerIdiomaPedido(valor: string): Idioma | undefined {
  return /^en/i.test(valor) ? 'en' : /^pt/i.test(valor) ? 'pt' : undefined;
}

/**
 * Decide o idioma antes de ler as opções, para que até o erro de opção saia no idioma certo.
 * Ordem: --lang/--idioma, depois o nome do comando, depois o sistema.
 */
function idiomaDe(argv: string[]): Idioma {
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i]!.match(/^--(?:lang|idioma)(?:=(.*))?$/);
    if (!m) continue;
    const pedido = lerIdiomaPedido(m[1] ?? argv[i + 1] ?? '');
    if (pedido) return pedido;
  }
  const primeiro = argv.find((a) => !a.startsWith('-'));
  return (primeiro && COMANDOS[primeiro]?.idioma) || idiomaDoSistema();
}

async function lerJson<T>(caminho: string): Promise<T> {
  return JSON.parse(await readFile(caminho, 'utf8')) as T;
}

async function principal(argv: string[], idioma: Idioma): Promise<number> {
  const t = TEXTOS[idioma];
  let lido;
  try {
    lido = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        saida: { type: 'string' },
        output: { type: 'string' },
        correcoes: { type: 'string' },
        corrections: { type: 'string' },
        matriz: { type: 'string' },
        matrix: { type: 'string' },
        forcar: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        ajuda: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        idioma: { type: 'string' },
        lang: { type: 'string' },
      },
    });
  } catch (erro) {
    console.error(t.opcaoInvalida(erro instanceof Error ? erro.message : String(erro)) + '\n');
    console.log(t.ajuda);
    return 1;
  }
  const { positionals, values: v } = lido;
  const saida = v.output ?? v.saida;
  const caminhoCorrecoes = v.corrections ?? v.correcoes;
  const caminhoMatriz = v.matrix ?? v.matriz;
  const forcar = v.force || v.forcar;
  const [nome, alvo] = positionals;

  // Ajuda pedida é sucesso; ajuda por falta de comando é erro.
  if (v.help || v.ajuda) {
    console.log(t.ajuda);
    return 0;
  }
  if (!nome) {
    console.log(t.ajuda);
    return 1;
  }

  const comando = COMANDOS[nome]?.comando;
  const carregarMatriz = async (caminho: string | undefined): Promise<Matriz> => {
    if (!caminho) throw new Error(t.faltouMatriz);
    return lerMatriz(await lerJson(caminho), idioma);
  };

  if (comando === 'schema') {
    console.log(JSON.stringify(matrizJsonSchema(), null, 2));
    return 0;
  }

  if (comando === 'validar') {
    const resultado = validarMatriz(await carregarMatriz(alvo), { idioma });
    console.log(formatarValidacao(resultado, idioma));
    return resultado.ok ? 0 : 1;
  }

  if (comando === 'renderizar') {
    const matriz = await carregarMatriz(alvo);
    const validacao = validarMatriz(matriz, { idioma });
    console.log(formatarValidacao(validacao, idioma));
    if (!validacao.ok && !forcar) {
      console.error(`\n${t.nadaGerado}`);
      return 1;
    }
    const correcoes = caminhoCorrecoes ? await lerJson<Correcoes>(caminhoCorrecoes) : undefined;
    const comCorrecoes = correcoes ? { correcoes } : {};
    const pasta = resolve(saida ?? t.saidaPadrao);
    await mkdir(pasta, { recursive: true });
    const base = join(pasta, matriz.processo.id);
    const bpmn = renderizarBpmn(matriz, { ...comCorrecoes, idioma });
    const mermaid = renderizarMermaid(matriz, { idioma });
    const arquivos: Array<[string, string]> = [
      [`${base}.bpmn`, bpmn],
      [`${base}.mmd`, mermaid],
      [`${base}.reactflow.json`, JSON.stringify(renderizarReactFlow(matriz, comCorrecoes), null, 2) + '\n'],
      [`${base}.html`, gerarPrevia({ matriz, validacao, bpmn, mermaid, idioma })],
    ];
    for (const [caminho, conteudo] of arquivos) await writeFile(caminho, conteudo, 'utf8');
    console.log(`\n${t.geradoEm(pasta)}`);
    for (const [caminho] of arquivos) console.log(`  ${caminho}`);
    return 0;
  }

  if (comando === 'extrair') {
    if (!alvo) throw new Error(t.faltouBpmn);
    const matriz = await carregarMatriz(caminhoMatriz);
    const { correcoes, desconhecidos, ausentes } = extrairCorrecoesDoBpmn(await readFile(alvo, 'utf8'), matriz);
    const frases = descreverCorrecoes(matriz, correcoes, idioma);
    console.log(frases.length ? `${t.corrigiu}\n${frases.map((f) => `  - ${f}`).join('\n')}` : t.nenhumaCorrecao);
    if (desconhecidos.length) console.log(`\n${t.desconhecidos(desconhecidos.join(', '))}`);
    if (ausentes.length) console.log(t.ausentes(ausentes.join(', ')));
    const destino = saida ?? t.correcoesPadrao;
    await writeFile(destino, JSON.stringify(correcoes, null, 2) + '\n', 'utf8');
    console.log(`\n${t.gravadas(resolve(destino))}`);
    return 0;
  }

  console.error(`${t.comandoDesconhecido(nome)}\n`);
  console.log(t.ajuda);
  return 1;
}

const argv = process.argv.slice(2);
principal(argv, idiomaDe(argv)).then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  },
);
