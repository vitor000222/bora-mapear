import { z } from 'zod';
import {
  aplicarOperacoes,
  descreverOperacoes,
  ErroOperacao,
  formatarValidacao,
  ListaOperacoesSchema,
  MatrizSchema,
  validarMatriz,
  type Matriz,
  type Operacao,
  type Problema,
  type ResultadoValidacao,
} from '@bora-mapear/core';
import { gerarJson, ErroAgente } from './json.ts';
import { somarUso, USO_ZERO, type ClienteModelo, type Mensagem, type Uso } from './provedor.ts';
import { citacaoNaFonte, dividirTexto, EvidenciaBrutaSchema, formatarEvidencias, type Evidencia, type EvidenciaBruta } from './evidencias.ts';

export type AoProgredir = (mensagem: string) => void;
const nada: AoProgredir = () => {};

const REGRAS_DE_MODELAGEM = `Regras de modelagem:
1. Raia é FUNÇÃO, não pessoa: "Vendedor", "Financeiro", "Cliente". Um sistema só vira raia quando age sozinho. Id de raia em minúsculas, sem acento, com hífen ("pos-venda").
2. Nome de tarefa: verbo no infinitivo + objeto, no vocabulário de quem faz ("Emitir nota fiscal").
3. Tipos: tarefa_usuario = pessoa usando sistema; tarefa_manual = pessoa sem sistema; tarefa_servico = sistema sozinho; tarefa_envio = manda e não espera; tarefa_recebimento = fica parado esperando receber; evento_timer = espera de prazo; evento_mensagem = espera de terceiro.
4. Cada origem de demanda é um "inicio" próprio. Todo caminho termina num "fim". Nenhuma seta aponta para um "inicio".
5. Decisão: gateway_exclusivo com o nome em forma de pergunta ("Crédito aprovado?") e TODA saída com "rotulo" ("Sim", "Não"). Caminhos simultâneos: um gateway_paralelo para abrir e outro para juntar.
6. "proximos" desenha o fluxo. Toda linha que não é "fim" tem ao menos uma saída.
7. Chaves E01, E02… na ordem de leitura, sem repetir.`;

// ---------------------------------------------------------------- Leitor

const SISTEMA_LEITOR = `Você é o Leitor do Bora Mapear, uma ferramenta de mapeamento de processos.
Você recebe um trecho de documento, POP ou transcrição de entrevista e devolve EVIDÊNCIAS: trechos copiados literalmente que dizem como o processo funciona.

Regras:
1. A citação é cópia LITERAL do texto, de uma a três frases. Não resuma, não corrija português, não junte frases distantes. Se precisar pular um pedaço, use "…".
2. Uma evidência por fato: quem faz o quê, com qual sistema, em que ordem, o que decide e com qual critério, o que espera, o que dá errado, quanto tempo leva, que documento entra ou sai.
3. Ignore cumprimentos, conversa fiada e repetições.
4. Em transcrição, preencha "local" com o minuto ou o nome de quem falou, se o texto mostrar.
5. Não interprete nem proponha melhoria. Só registre o que está escrito.
6. Se o trecho não falar de processo nenhum, devolva a lista vazia.`;

const RespostaLeitorSchema = z.object({ evidencias: z.array(EvidenciaBrutaSchema) });

export interface ResultadoLeitor {
  evidencias: Array<EvidenciaBruta & { verificada: boolean }>;
  uso: Uso;
}

/** Lê uma fonte e devolve as evidências, cada uma conferida contra o texto original. */
export async function lerFonte(cliente: ClienteModelo, fonte: { nome: string; texto: string }, aoProgredir: AoProgredir = nada): Promise<ResultadoLeitor> {
  const pedacos = dividirTexto(fonte.texto);
  let uso = USO_ZERO;
  const evidencias: ResultadoLeitor['evidencias'] = [];
  const vistas = new Set<string>();
  for (const [i, pedaco] of pedacos.entries()) {
    aoProgredir(`Lendo "${fonte.nome}"${pedacos.length > 1 ? ` (parte ${i + 1} de ${pedacos.length})` : ''}…`);
    const r = await gerarJson(cliente, {
      sistema: SISTEMA_LEITOR,
      usuario: `Fonte: ${fonte.nome}${pedacos.length > 1 ? ` (parte ${i + 1} de ${pedacos.length})` : ''}\n\n<<<\n${pedaco}\n>>>`,
      schema: RespostaLeitorSchema,
      nomeSchema: 'evidencias',
    });
    uso = somarUso(uso, r.uso);
    for (const e of r.dado.evidencias) {
      const chave = e.citacao.trim().toLowerCase();
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      evidencias.push({ ...e, citacao: e.citacao.trim(), verificada: citacaoNaFonte(e.citacao, pedaco) });
    }
  }
  const falsas = evidencias.filter((e) => !e.verificada).length;
  aoProgredir(`"${fonte.nome}": ${evidencias.length} evidências${falsas ? `, ${falsas} não achadas literalmente no texto (marcadas)` : ''}.`);
  return { evidencias, uso };
}

// ---------------------------------------------------------------- Mapeador

const SISTEMA_MAPEADOR = `Você é o Mapeador do Bora Mapear, uma ferramenta de mapeamento de processos.
Você recebe EVIDÊNCIAS numeradas (EV-001…), tiradas de documentos e entrevistas, e escreve a MATRIZ do processo: uma linha por elemento (evento, tarefa, decisão).
Você não desenha. O diagrama sai da matriz por um programa. Nunca escreva XML, Mermaid nem coordenadas.

Só o que as evidências sustentam:
- Toda linha cita em "evidencias" as chaves que a sustentam.
- Se precisar de uma linha sem evidência direta para o fluxo fechar (um fim, uma decisão implícita), marque "revisarHumano": true, "confianca" abaixo de 0.5 e diga a dúvida em "descricao".
- O que as evidências não dizem não vira etapa inventada. Registre a dúvida com "revisarHumano": true na linha mais próxima.
- Preencha "sistema", "regra", "entrada", "saida" e "descricao" quando as evidências disserem.

${REGRAS_DE_MODELAGEM}`;

export interface EntradaMapeador {
  nomeProcesso: string;
  idProcesso: string;
  evidencias: Evidencia[];
  instrucoes?: string;
}

export interface ResultadoMapeador {
  matriz: Matriz;
  validacao: ResultadoValidacao;
  rodadas: number;
  avisos: string[];
  uso: Uso;
}

/** Evidências citadas que não existem viram aviso; linha sem evidência vai para revisão humana. */
function conferirEvidencias(m: Matriz, evidencias: Evidencia[]): { matriz: Matriz; avisos: string[] } {
  const existentes = new Set(evidencias.map((e) => e.chave));
  const avisos: string[] = [];
  const etapas = m.etapas.map((e) => {
    const citadas = e.evidencias ?? [];
    const falsas = citadas.filter((c) => !existentes.has(c));
    if (falsas.length) avisos.push(`${e.chave} cita evidências que não existem: ${falsas.join(', ')}.`);
    const validas = citadas.filter((c) => existentes.has(c));
    if (!validas.length && e.tipo !== 'fim' && !e.tipo.startsWith('gateway_')) {
      return { ...e, evidencias: validas, revisarHumano: true };
    }
    return { ...e, evidencias: validas };
  });
  const semEvidencia = etapas.filter((e) => !e.evidencias?.length && e.tipo !== 'fim' && !e.tipo.startsWith('gateway_')).length;
  if (semEvidencia) avisos.push(`${semEvidencia} ${semEvidencia === 1 ? 'linha ficou' : 'linhas ficaram'} sem evidência e foram marcadas para revisão humana.`);
  return { matriz: { ...m, etapas }, avisos };
}

/**
 * Escreve a matriz a partir das evidências e passa pelo portão. Reprovou, devolve os erros
 * ao modelo e pede a matriz corrigida, até três rodadas.
 */
export async function mapear(cliente: ClienteModelo, entrada: EntradaMapeador, aoProgredir: AoProgredir = nada): Promise<ResultadoMapeador> {
  if (!entrada.evidencias.length) throw new ErroAgente('Não há evidências para mapear. Envie fontes e rode o Leitor antes.');
  const pedido =
    `Processo: ${entrada.nomeProcesso} (id "${entrada.idProcesso}")\n` +
    (entrada.instrucoes?.trim() ? `Instruções de quem pediu: ${entrada.instrucoes.trim()}\n` : '') +
    `\nEvidências:\n${formatarEvidencias(entrada.evidencias)}\n\nEscreva a matriz completa do processo.`;

  let uso = USO_ZERO;
  let historico: Mensagem[] = [];
  let usuario = pedido;
  const rodadasMax = 3;
  for (let rodada = 1; ; rodada++) {
    aoProgredir(rodada === 1 ? `Mapeando a partir de ${entrada.evidencias.length} evidências…` : `Rodada ${rodada}: corrigindo o que o portão apontou…`);
    const r = await gerarJson(cliente, { sistema: SISTEMA_MAPEADOR, usuario, historico, schema: MatrizSchema, nomeSchema: 'matriz', maxTokens: 32000 });
    uso = somarUso(uso, r.uso);
    const matrizBruta: Matriz = { ...r.dado, processo: { ...r.dado.processo, id: entrada.idProcesso, nome: entrada.nomeProcesso } };
    const { matriz, avisos } = conferirEvidencias(matrizBruta, entrada.evidencias);
    const validacao = validarMatriz(matriz);
    const erros = validacao.problemas.filter((p) => p.severidade === 'erro').length;
    aoProgredir(validacao.ok ? `Portão: aprovada (${matriz.etapas.length} etapas, ${matriz.raias.length} raias).` : `Portão: ${erros} ${erros === 1 ? 'erro' : 'erros'}.`);
    if (validacao.ok || rodada >= rodadasMax) {
      if (!validacao.ok) avisos.push(`O portão ainda acusa ${erros} ${erros === 1 ? 'erro' : 'erros'} depois de ${rodadasMax} rodadas. Corrija na aba Matriz.`);
      return { matriz, validacao, rodadas: rodada, avisos, uso };
    }
    historico = r.mensagens;
    usuario = `O portão reprovou a matriz:\n${formatarValidacao(validacao)}\n\nCorrija esses pontos e devolva a matriz COMPLETA de novo.`;
  }
}

// ---------------------------------------------------------------- Revisor

const SISTEMA_REVISOR = `Você é o Revisor do Bora Mapear, uma ferramenta de mapeamento de processos.
Você recebe a matriz de um processo e as evidências que a sustentam e aponta o que precisa de olho humano. Você não reescreve a matriz.

Aponte:
1. Lacunas: partes do processo que as evidências não cobrem ou que a matriz deixa em aberto (de onde vem a demanda, quem decide, o que acontece quando dá errado, como termina). Para cada uma, escreva a pergunta para fazer a quem conhece o processo.
2. Linhas para revisão: a chave e o motivo. Exemplos: a evidência citada não diz aquilo; tipo errado (pessoa sem sistema marcada como tarefa_usuario); raia com nome de pessoa; decisão sem critério; etapa que parece faltar entre duas outras.
Seja específico e curto. Não repita o mesmo ponto.`;

export const RelatorioRevisorSchema = z.object({
  resumo: z.string().describe('Duas ou três frases sobre a qualidade do mapeamento.'),
  lacunas: z.array(
    z.object({
      descricao: z.string(),
      pergunta: z.string().describe('A pergunta para fazer a quem conhece o processo.'),
      chaves: z.array(z.string()).optional().describe('Etapas relacionadas, se houver.'),
    }),
  ),
  revisar: z.array(z.object({ chave: z.string(), motivo: z.string() })),
});
export type RelatorioRevisor = z.infer<typeof RelatorioRevisorSchema>;

export interface ResultadoRevisor {
  relatorio: RelatorioRevisor;
  /** Conferências que não precisam de modelo. */
  automaticos: string[];
  uso: Uso;
}

export async function revisar(cliente: ClienteModelo, entrada: { matriz: Matriz; evidencias: Evidencia[] }, aoProgredir: AoProgredir = nada): Promise<ResultadoRevisor> {
  aoProgredir('Revisando a matriz contra as evidências…');
  const automaticos: string[] = [];
  const existentes = new Set(entrada.evidencias.map((e) => e.chave));
  for (const e of entrada.matriz.etapas) {
    if (e.tipo === 'fim' || e.tipo.startsWith('gateway_')) continue;
    if (!e.evidencias?.length) automaticos.push(`${e.chave} ("${e.nome}") não cita nenhuma evidência.`);
    const falsas = (e.evidencias ?? []).filter((c) => !existentes.has(c));
    if (falsas.length) automaticos.push(`${e.chave} cita evidências que não existem: ${falsas.join(', ')}.`);
  }
  for (const p of validarMatriz(entrada.matriz).problemas) automaticos.push(`Portão: ${p.mensagem}`);

  const r = await gerarJson(cliente, {
    sistema: SISTEMA_REVISOR,
    usuario:
      `Matriz:\n${JSON.stringify(entrada.matriz)}\n\n` +
      (entrada.evidencias.length ? `Evidências:\n${formatarEvidencias(entrada.evidencias)}` : 'Não há evidências registradas: a matriz foi escrita à mão.'),
    schema: RelatorioRevisorSchema,
    nomeSchema: 'relatorio',
  });
  const chaves = new Set(entrada.matriz.etapas.map((e) => e.chave));
  const relatorio = { ...r.dado, revisar: r.dado.revisar.filter((x) => chaves.has(x.chave)) };
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  aoProgredir(`${plural(relatorio.lacunas.length, 'lacuna', 'lacunas')} e ${plural(relatorio.revisar.length, 'linha', 'linhas')} para revisar.`);
  return { relatorio, automaticos, uso: r.uso };
}

// ---------------------------------------------------------------- Editor

const SISTEMA_EDITOR = `Você é o Editor do Bora Mapear, uma ferramenta de mapeamento de processos.
Você recebe a matriz atual de um processo e um pedido de mudança em linguagem natural. Você devolve uma lista CURTA de operações sobre a matriz, que um programa aplica na ordem. Não reescreva a matriz inteira.

Como operar:
- Chave nova continua a numeração (se a maior é E15, a próxima é E16).
- Ao inserir uma etapa no meio do fluxo, religue as setas: a etapa anterior passa a apontar para a nova (alterar_etapa com "proximos") e a nova aponta para quem vinha depois.
- Ao remover uma etapa, diga em "religarPara" para onde vão as setas que chegavam nela.
- "campos.proximos" substitui a lista inteira de saídas da etapa: repita as que continuam.
- Raia nova precisa existir antes da etapa que a usa.
- Mude só o que o pedido pede.
- A matriz resultante tem de passar no portão.

${REGRAS_DE_MODELAGEM}`;

export interface ResultadoEditor {
  matriz: Matriz;
  operacoes: Operacao[];
  resumo: string;
  frases: string[];
  validacao: ResultadoValidacao;
  rodadas: number;
  uso: Uso;
}

const chaveProblema = (p: Problema) => `${p.codigo}|${p.chave ?? ''}`;

/** Aplica um pedido em linguagem natural. Só reprova erro novo: o que já estava errado antes não é culpa do pedido. */
export async function editar(cliente: ClienteModelo, entrada: { matriz: Matriz; pedido: string }, aoProgredir: AoProgredir = nada): Promise<ResultadoEditor> {
  if (!entrada.pedido.trim()) throw new ErroAgente('Escreva o que mudar.');
  const errosAntes = new Set(validarMatriz(entrada.matriz).problemas.filter((p) => p.severidade === 'erro').map(chaveProblema));
  let uso = USO_ZERO;
  let historico: Mensagem[] = [];
  let usuario = `Matriz atual:\n${JSON.stringify(entrada.matriz)}\n\nPedido: ${entrada.pedido.trim()}`;
  const rodadasMax = 3;
  for (let rodada = 1; ; rodada++) {
    aoProgredir(rodada === 1 ? 'Interpretando o pedido…' : `Rodada ${rodada}: corrigindo as operações…`);
    const r = await gerarJson(cliente, { sistema: SISTEMA_EDITOR, usuario, historico, schema: ListaOperacoesSchema, nomeSchema: 'operacoes' });
    uso = somarUso(uso, r.uso);
    let problema: string;
    try {
      const matriz = aplicarOperacoes(entrada.matriz, r.dado.operacoes);
      const validacao = validarMatriz(matriz);
      const novos = validacao.problemas.filter((p) => p.severidade === 'erro' && !errosAntes.has(chaveProblema(p)));
      if (!novos.length || rodada >= rodadasMax) {
        aoProgredir(`${r.dado.operacoes.length} ${r.dado.operacoes.length === 1 ? 'operação' : 'operações'}${novos.length ? `; o portão ainda acusa ${novos.length} erro(s) novo(s)` : ''}.`);
        return {
          matriz,
          operacoes: r.dado.operacoes,
          resumo: r.dado.resumo,
          frases: descreverOperacoes(entrada.matriz, r.dado.operacoes),
          validacao,
          rodadas: rodada,
          uso,
        };
      }
      problema = `Depois das operações, o portão acusou erros novos:\n${novos.map((p) => `- [${p.codigo}] ${p.mensagem}`).join('\n')}`;
    } catch (erro) {
      if (!(erro instanceof ErroOperacao) || rodada >= rodadasMax) throw erro instanceof ErroOperacao ? new ErroAgente(`As operações não couberam na matriz: ${erro.message}`) : erro;
      problema = `Uma operação não coube na matriz: ${erro.message}`;
    }
    historico = r.mensagens;
    usuario = `${problema}\n\nDevolva a lista de operações COMPLETA corrigida, aplicada sobre a matriz original.`;
  }
}
