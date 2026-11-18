import { z } from 'zod';
import {
  aplicarOperacoes,
  descreverOperacoes,
  ErroOperacao,
  formatarValidacao,
  ListaOperacoesSchema,
  MatrizSchema,
  RegraVisualSchema,
  regraVale,
  validarMatriz,
  type Etapa,
  type EstiloVisual,
  type Idioma,
  type Matriz,
  type TipoEtapa,
  type Operacao,
  type Problema,
  type ResultadoValidacao,
} from '@bora-mapear/core';
import { gerarJson, ErroAgente } from './json.ts';
import { somarUso, USO_ZERO, type ClienteModelo, type Mensagem, type Uso } from './provedor.ts';
import { citacaoNaFonte, dividirTexto, EvidenciaBrutaSchema, formatarEvidencias, type Evidencia, type EvidenciaBruta } from './evidencias.ts';

export type AoProgredir = (mensagem: string) => void;
const nada: AoProgredir = () => {};

const idiomaDe = (cliente: ClienteModelo): Idioma => cliente.idioma ?? 'pt';

// O que os agentes escrevem para a pessoa ler: progresso, avisos, conferências e erros.
// O que vai para o modelo (prompts, pedidos de correção) continua em português.
const MENSAGENS = {
  pt: {
    lendo: (nome: string, parte: number, partes: number) => `Lendo "${nome}"${partes > 1 ? ` (parte ${parte} de ${partes})` : ''}…`,
    leitorFim: (nome: string, n: number, falsas: number) =>
      `"${nome}": ${n} evidências${falsas ? `, ${falsas} não achadas literalmente no texto (marcadas)` : ''}.`,
    citaInexistentes: (chave: string, lista: string) => `${chave} cita evidências que não existem: ${lista}.`,
    semEvidencia: (n: number) => `${n} ${n === 1 ? 'linha ficou' : 'linhas ficaram'} sem evidência e foram marcadas para revisão humana.`,
    corrigindoPortao: (rodada: number) => `Rodada ${rodada}: corrigindo o que o portão apontou…`,
    portaoAprovada: (etapas: number, raias: number) => `Portão: aprovada (${etapas} etapas, ${raias} raias).`,
    portaoErros: (n: number) => `Portão: ${n} ${n === 1 ? 'erro' : 'erros'}.`,
    portaoAindaErros: (n: number, rodadas: number) => `O portão ainda acusa ${n} ${n === 1 ? 'erro' : 'erros'} depois de ${rodadas} rodadas. Corrija na aba Matriz.`,
    semEvidencias: 'Não há evidências para mapear. Envie fontes e rode o Leitor antes.',
    mapeando: (n: number) => `Mapeando a partir de ${n} evidências…`,
    semConteudo: 'Não há conteúdo para converter.',
    convertendo: 'Convertendo para a matriz…',
    poucasCores: 'Ainda não há cores suficientes nas suas correções para aprender um estilo. Pinte algumas etapas no desenho e salve as correções.',
    analisando: (etapas: number, correcoes: number) => `Analisando ${etapas} etapas pintadas e ${correcoes} correções…`,
    regrasDeEstilo: (n: number) => `${n} ${n === 1 ? 'regra' : 'regras'} de estilo.`,
    revisando: 'Revisando a matriz contra as evidências…',
    naoCita: (chave: string, nome: string) => `${chave} ("${nome}") não cita nenhuma evidência.`,
    portao: (mensagem: string) => `Portão: ${mensagem}`,
    revisorFim: (lacunas: number, linhas: number) =>
      `${lacunas} ${lacunas === 1 ? 'lacuna' : 'lacunas'} e ${linhas} ${linhas === 1 ? 'linha' : 'linhas'} para revisar.`,
    semPedido: 'Escreva o que mudar.',
    interpretando: 'Interpretando o pedido…',
    corrigindoOperacoes: (rodada: number) => `Rodada ${rodada}: corrigindo as operações…`,
    editorFim: (n: number, novos: number) => `${n} ${n === 1 ? 'operação' : 'operações'}${novos ? `; o portão ainda acusa ${novos} erro(s) novo(s)` : ''}.`,
    naoCouberam: (detalhe: string) => `As operações não couberam na matriz: ${detalhe}`,
  },
  en: {
    lendo: (nome: string, parte: number, partes: number) => `Reading "${nome}"${partes > 1 ? ` (part ${parte} of ${partes})` : ''}…`,
    leitorFim: (nome: string, n: number, falsas: number) =>
      `"${nome}": ${n} ${n === 1 ? 'piece' : 'pieces'} of evidence${falsas ? `, ${falsas} not found word for word in the text (flagged)` : ''}.`,
    citaInexistentes: (chave: string, lista: string) => `${chave} cites evidence that does not exist: ${lista}.`,
    semEvidencia: (n: number) => `${n} ${n === 1 ? 'row was' : 'rows were'} left without evidence and flagged for human review.`,
    corrigindoPortao: (rodada: number) => `Round ${rodada}: fixing what the gate flagged…`,
    portaoAprovada: (etapas: number, raias: number) => `Gate: passed (${etapas} steps, ${raias} lanes).`,
    portaoErros: (n: number) => `Gate: ${n} ${n === 1 ? 'error' : 'errors'}.`,
    portaoAindaErros: (n: number, rodadas: number) =>
      `The gate still reports ${n} ${n === 1 ? 'error' : 'errors'} after ${rodadas} rounds. Fix ${n === 1 ? 'it' : 'them'} in the Matrix tab.`,
    semEvidencias: 'There is no evidence to map. Add sources and run the Reader first.',
    mapeando: (n: number) => `Mapping from ${n} ${n === 1 ? 'piece' : 'pieces'} of evidence…`,
    semConteudo: 'There is no content to convert.',
    convertendo: 'Converting to the matrix…',
    poucasCores: 'Your corrections do not have enough colors yet to learn a style. Color a few steps in the diagram and save the corrections.',
    analisando: (etapas: number, correcoes: number) =>
      `Analyzing ${etapas} colored ${etapas === 1 ? 'step' : 'steps'} and ${correcoes} ${correcoes === 1 ? 'correction' : 'corrections'}…`,
    regrasDeEstilo: (n: number) => `${n} style ${n === 1 ? 'rule' : 'rules'}.`,
    revisando: 'Reviewing the matrix against the evidence…',
    naoCita: (chave: string, nome: string) => `${chave} ("${nome}") cites no evidence.`,
    portao: (mensagem: string) => `Gate: ${mensagem}`,
    revisorFim: (lacunas: number, linhas: number) => `${lacunas} ${lacunas === 1 ? 'gap' : 'gaps'} and ${linhas} ${linhas === 1 ? 'row' : 'rows'} to review.`,
    semPedido: 'Write what to change.',
    interpretando: 'Interpreting the request…',
    corrigindoOperacoes: (rodada: number) => `Round ${rodada}: fixing the operations…`,
    editorFim: (n: number, novos: number) =>
      `${n} ${n === 1 ? 'operation' : 'operations'}${novos ? `; the gate still reports ${novos} new ${novos === 1 ? 'error' : 'errors'}` : ''}.`,
    naoCouberam: (detalhe: string) => `The operations do not fit the matrix: ${detalhe}`,
  },
} satisfies Record<Idioma, unknown>;

/**
 * Vai no fim do prompt de sistema quando a pessoa usa o Bora Mapear em inglês. Os prompts continuam
 * em português (os modelos entendem); este bloco diz em que língua escrever e vence os exemplos de cima.
 */
const SAIDA_EM_INGLES = `OUTPUT LANGUAGE: ENGLISH. This overrides any language cue above.
The instructions above are in Portuguese, but write everything a person will read in English: step and lane names, descriptions, flow labels ("Yes"/"No", never "Sim"/"Não"), questions, notes, summaries and rule descriptions. Read the Portuguese examples above as patterns for English text: lane "Sales", task "Issue invoice" (verb + object), decision "Credit approved?".
Keep as they are: evidence quotes (word for word, in the language of the source); JSON keys and enum values ("inicio", "fim", "tarefa_usuario"…); keys such as E01 and EV-001; and names you take from the matrix or the content you received, unless the request asks to change them.`;

function sistemaNoIdioma(sistema: string, idioma: Idioma): string {
  return idioma === 'en' ? `${sistema}\n\n${SAIDA_EM_INGLES}` : sistema;
}

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
  const idioma = idiomaDe(cliente);
  const t = MENSAGENS[idioma];
  const pedacos = dividirTexto(fonte.texto);
  let uso = USO_ZERO;
  const evidencias: ResultadoLeitor['evidencias'] = [];
  const vistas = new Set<string>();
  for (const [i, pedaco] of pedacos.entries()) {
    aoProgredir(t.lendo(fonte.nome, i + 1, pedacos.length));
    const r = await gerarJson(cliente, {
      sistema: sistemaNoIdioma(SISTEMA_LEITOR, idioma),
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
  aoProgredir(t.leitorFim(fonte.nome, evidencias.length, falsas));
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
function conferirEvidencias(m: Matriz, evidencias: Evidencia[], idioma: Idioma): { matriz: Matriz; avisos: string[] } {
  const t = MENSAGENS[idioma];
  const existentes = new Set(evidencias.map((e) => e.chave));
  const avisos: string[] = [];
  const etapas = m.etapas.map((e) => {
    const citadas = e.evidencias ?? [];
    const falsas = citadas.filter((c) => !existentes.has(c));
    if (falsas.length) avisos.push(t.citaInexistentes(e.chave, falsas.join(', ')));
    const validas = citadas.filter((c) => existentes.has(c));
    if (!validas.length && e.tipo !== 'fim' && !e.tipo.startsWith('gateway_')) {
      return { ...e, evidencias: validas, revisarHumano: true };
    }
    return { ...e, evidencias: validas };
  });
  const semEvidencia = etapas.filter((e) => !e.evidencias?.length && e.tipo !== 'fim' && !e.tipo.startsWith('gateway_')).length;
  if (semEvidencia) avisos.push(t.semEvidencia(semEvidencia));
  return { matriz: { ...m, etapas }, avisos };
}

interface PedidoMatriz {
  sistema: string;
  usuario: string;
  idProcesso: string;
  nomeProcesso: string;
  /** Mensagem da primeira rodada, para o progresso. */
  rotulo: string;
  /** Conferências próprias do agente, depois de cada rodada. */
  ajustar?: (m: Matriz) => { matriz: Matriz; avisos: string[] };
}

/**
 * Pede a matriz ao modelo e passa pelo portão. Reprovou, devolve os erros e pede a matriz
 * corrigida, até três rodadas. Usado pelo Mapeador e pelo Conversor.
 */
async function escreverMatriz(cliente: ClienteModelo, p: PedidoMatriz, aoProgredir: AoProgredir): Promise<ResultadoMapeador> {
  const idioma = idiomaDe(cliente);
  const t = MENSAGENS[idioma];
  const sistema = sistemaNoIdioma(p.sistema, idioma);
  let uso = USO_ZERO;
  let historico: Mensagem[] = [];
  let usuario = p.usuario;
  const rodadasMax = 3;
  for (let rodada = 1; ; rodada++) {
    aoProgredir(rodada === 1 ? p.rotulo : t.corrigindoPortao(rodada));
    const r = await gerarJson(cliente, { sistema, usuario, historico, schema: MatrizSchema, nomeSchema: 'matriz', maxTokens: 32000 });
    uso = somarUso(uso, r.uso);
    const matrizBruta: Matriz = { ...r.dado, processo: { ...r.dado.processo, id: p.idProcesso, nome: p.nomeProcesso } };
    const { matriz, avisos } = p.ajustar ? p.ajustar(matrizBruta) : { matriz: matrizBruta, avisos: [] as string[] };
    const validacao = validarMatriz(matriz, { idioma });
    const erros = validacao.problemas.filter((p) => p.severidade === 'erro').length;
    aoProgredir(validacao.ok ? t.portaoAprovada(matriz.etapas.length, matriz.raias.length) : t.portaoErros(erros));
    if (validacao.ok || rodada >= rodadasMax) {
      if (!validacao.ok) avisos.push(t.portaoAindaErros(erros, rodadasMax));
      return { matriz, validacao, rodadas: rodada, avisos, uso };
    }
    historico = r.mensagens;
    usuario = `O portão reprovou a matriz:\n${formatarValidacao(validacao, idioma)}\n\nCorrija esses pontos e devolva a matriz COMPLETA de novo.`;
  }
}

/** Escreve a matriz a partir das evidências; toda linha aponta a evidência que a sustenta. */
export async function mapear(cliente: ClienteModelo, entrada: EntradaMapeador, aoProgredir: AoProgredir = nada): Promise<ResultadoMapeador> {
  const idioma = idiomaDe(cliente);
  const t = MENSAGENS[idioma];
  if (!entrada.evidencias.length) throw new ErroAgente(t.semEvidencias);
  return escreverMatriz(
    cliente,
    {
      sistema: SISTEMA_MAPEADOR,
      usuario:
        `Processo: ${entrada.nomeProcesso} (id "${entrada.idProcesso}")\n` +
        (entrada.instrucoes?.trim() ? `Instruções de quem pediu: ${entrada.instrucoes.trim()}\n` : '') +
        `\nEvidências:\n${formatarEvidencias(entrada.evidencias)}\n\nEscreva a matriz completa do processo.`,
      idProcesso: entrada.idProcesso,
      nomeProcesso: entrada.nomeProcesso,
      rotulo: t.mapeando(entrada.evidencias.length),
      ajustar: (m) => conferirEvidencias(m, entrada.evidencias, idioma),
    },
    aoProgredir,
  );
}

// ---------------------------------------------------------------- Conversor

const SISTEMA_CONVERSOR = `Você é o Conversor do Bora Mapear, uma ferramenta de mapeamento de processos.
Você recebe um processo descrito em outra forma (código Mermaid, PlantUML, BPMN, uma lista de passos, uma tabela, texto corrido) e devolve a MATRIZ do processo: uma linha por elemento.

Como converter:
- Preserve os nomes, a ordem e as decisões do original. Raia, swimlane, pool, subgraph ou "quem faz" vira raia.
- Rótulo de seta vira "rotulo". Se o original tem ids, use-os como chave quando forem válidos (começam com letra).
- Não invente etapa. Se faltar início ou fim para o fluxo fechar, crie com "revisarHumano": true.
- Ignore estilo, cor e posição: o desenho sai da matriz.

${REGRAS_DE_MODELAGEM}`;

export interface EntradaConversor {
  conteudo: string;
  nomeProcesso: string;
  idProcesso: string;
}

/** Converte código ou texto de outra ferramenta em matriz, passando pelo portão. */
export async function converter(cliente: ClienteModelo, entrada: EntradaConversor, aoProgredir: AoProgredir = nada): Promise<ResultadoMapeador> {
  const t = MENSAGENS[idiomaDe(cliente)];
  if (!entrada.conteudo.trim()) throw new ErroAgente(t.semConteudo);
  return escreverMatriz(
    cliente,
    {
      sistema: SISTEMA_CONVERSOR,
      usuario: `Processo: ${entrada.nomeProcesso} (id "${entrada.idProcesso}")\n\nConteúdo a converter:\n<<<\n${entrada.conteudo}\n>>>\n\nEscreva a matriz completa.`,
      idProcesso: entrada.idProcesso,
      nomeProcesso: entrada.nomeProcesso,
      rotulo: t.convertendo,
    },
    aoProgredir,
  );
}

// ---------------------------------------------------------------- Visual

const SISTEMA_VISUAL = `Você é o agente Visual do Bora Mapear, uma ferramenta de mapeamento de processos.
Você recebe exemplos de cores que a pessoa aplicou à mão em etapas dos mapeamentos dela (com o tipo, a raia e o nome de cada etapa) e frases do registro das correções que ela fez no desenho.
Escreva o ESTILO dela como uma lista curta de regras, do tipo "tarefas manuais em laranja". O programa aplica as regras; você não escreve coordenada nem posição.

Como escrever:
1. Só regra que vários exemplos sustentam (pelo menos dois), e que explica um padrão, não um caso isolado.
2. Condições simples: tipo ou família primeiro; raia só quando a cor depende da área; "nomeContem" só quando uma palavra explica a cor.
3. Use exatamente as cores dos exemplos (#rrggbb).
4. Ordem: das regras gerais para as específicas. Quando duas valem para a mesma etapa, a de baixo vence.
5. Em "observacoes", anote padrões que não são de cor (ex.: "você costuma descer as decisões"), para a pessoa saber. Eles não viram regra.
Se não houver padrão, devolva a lista de regras vazia e diga por quê nas observações.`;

export interface ExemploCor {
  tipo: TipoEtapa;
  raia: string;
  nome: string;
  revisarHumano?: boolean;
  semEvidencia?: boolean;
  corFundo?: string;
  corBorda?: string;
}

const RespostaVisualSchema = z.object({
  regras: z.array(RegraVisualSchema),
  observacoes: z.array(z.string()),
});

export interface ResultadoVisual {
  estilo: EstiloVisual;
  observacoes: string[];
  /** Para cada regra: em quantos exemplos ela vale e em quantos acerta a cor. */
  cobertura: Array<{ vale: number; acerta: number }>;
  uso: Uso;
}

function etapaDoExemplo(ex: ExemploCor): { etapa: Etapa; matriz: Matriz } {
  const etapa: Etapa = { chave: 'X', tipo: ex.tipo, nome: ex.nome, raia: 'r', proximos: [], ...(ex.revisarHumano ? { revisarHumano: true } : {}), ...(ex.semEvidencia ? {} : { evidencias: ['EV'] }) };
  return { etapa, matriz: { versaoSchema: 1, processo: { id: 'p', nome: 'p' }, raias: [{ id: 'r', nome: ex.raia }], etapas: [etapa] } };
}

/** Aprende o estilo visual da pessoa a partir das cores que ela já aplicou. */
export async function aprenderEstilo(
  cliente: ClienteModelo,
  entrada: { exemplos: ExemploCor[]; frases: string[]; estiloAtual?: EstiloVisual },
  aoProgredir: AoProgredir = nada,
): Promise<ResultadoVisual> {
  const idioma = idiomaDe(cliente);
  const t = MENSAGENS[idioma];
  if (entrada.exemplos.length < 2) {
    throw new ErroAgente(t.poucasCores);
  }
  aoProgredir(t.analisando(entrada.exemplos.length, entrada.frases.length));
  const r = await gerarJson(cliente, {
    sistema: sistemaNoIdioma(SISTEMA_VISUAL, idioma),
    usuario:
      `Exemplos (uma etapa por linha):\n${entrada.exemplos.map((e) => JSON.stringify(e)).join('\n')}\n\n` +
      `Registro de correções (mais recentes primeiro):\n${entrada.frases.map((f) => `- ${f}`).join('\n') || '(vazio)'}\n\n` +
      (entrada.estiloAtual?.regras.length ? `Estilo atual, para melhorar:\n${JSON.stringify(entrada.estiloAtual.regras)}\n\n` : '') +
      'Escreva as regras do estilo.',
    schema: RespostaVisualSchema,
    nomeSchema: 'estilo',
  });
  const estilo: EstiloVisual = { versao: 1, regras: r.dado.regras };
  const cobertura = estilo.regras.map((regra) => {
    let vale = 0;
    let acerta = 0;
    for (const ex of entrada.exemplos) {
      const { etapa, matriz } = etapaDoExemplo(ex);
      if (!regraVale(regra, etapa, matriz)) continue;
      vale++;
      if ((!regra.corFundo || regra.corFundo.toLowerCase() === ex.corFundo?.toLowerCase()) && (!regra.corBorda || regra.corBorda.toLowerCase() === ex.corBorda?.toLowerCase())) acerta++;
    }
    return { vale, acerta };
  });
  aoProgredir(t.regrasDeEstilo(estilo.regras.length));
  return { estilo, observacoes: r.dado.observacoes, cobertura, uso: r.uso };
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
  const idioma = idiomaDe(cliente);
  const t = MENSAGENS[idioma];
  aoProgredir(t.revisando);
  const automaticos: string[] = [];
  const existentes = new Set(entrada.evidencias.map((e) => e.chave));
  for (const e of entrada.matriz.etapas) {
    if (e.tipo === 'fim' || e.tipo.startsWith('gateway_')) continue;
    if (!e.evidencias?.length) automaticos.push(t.naoCita(e.chave, e.nome));
    const falsas = (e.evidencias ?? []).filter((c) => !existentes.has(c));
    if (falsas.length) automaticos.push(t.citaInexistentes(e.chave, falsas.join(', ')));
  }
  for (const p of validarMatriz(entrada.matriz, { idioma }).problemas) automaticos.push(t.portao(p.mensagem));

  const r = await gerarJson(cliente, {
    sistema: sistemaNoIdioma(SISTEMA_REVISOR, idioma),
    usuario:
      `Matriz:\n${JSON.stringify(entrada.matriz)}\n\n` +
      (entrada.evidencias.length ? `Evidências:\n${formatarEvidencias(entrada.evidencias)}` : 'Não há evidências registradas: a matriz foi escrita à mão.'),
    schema: RelatorioRevisorSchema,
    nomeSchema: 'relatorio',
  });
  const chaves = new Set(entrada.matriz.etapas.map((e) => e.chave));
  const relatorio = { ...r.dado, revisar: r.dado.revisar.filter((x) => chaves.has(x.chave)) };
  aoProgredir(t.revisorFim(relatorio.lacunas.length, relatorio.revisar.length));
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
  const idioma = idiomaDe(cliente);
  const t = MENSAGENS[idioma];
  if (!entrada.pedido.trim()) throw new ErroAgente(t.semPedido);
  const errosAntes = new Set(validarMatriz(entrada.matriz, { idioma }).problemas.filter((p) => p.severidade === 'erro').map(chaveProblema));
  const sistema = sistemaNoIdioma(SISTEMA_EDITOR, idioma);
  let uso = USO_ZERO;
  let historico: Mensagem[] = [];
  let usuario = `Matriz atual:\n${JSON.stringify(entrada.matriz)}\n\nPedido: ${entrada.pedido.trim()}`;
  const rodadasMax = 3;
  for (let rodada = 1; ; rodada++) {
    aoProgredir(rodada === 1 ? t.interpretando : t.corrigindoOperacoes(rodada));
    const r = await gerarJson(cliente, { sistema, usuario, historico, schema: ListaOperacoesSchema, nomeSchema: 'operacoes' });
    uso = somarUso(uso, r.uso);
    let problema: string;
    try {
      const matriz = aplicarOperacoes(entrada.matriz, r.dado.operacoes, idioma);
      const validacao = validarMatriz(matriz, { idioma });
      const novos = validacao.problemas.filter((p) => p.severidade === 'erro' && !errosAntes.has(chaveProblema(p)));
      if (!novos.length || rodada >= rodadasMax) {
        aoProgredir(t.editorFim(r.dado.operacoes.length, novos.length));
        return {
          matriz,
          operacoes: r.dado.operacoes,
          resumo: r.dado.resumo,
          frases: descreverOperacoes(entrada.matriz, r.dado.operacoes, idioma),
          validacao,
          rodadas: rodada,
          uso,
        };
      }
      problema = `Depois das operações, o portão acusou erros novos:\n${novos.map((p) => `- [${p.codigo}] ${p.mensagem}`).join('\n')}`;
    } catch (erro) {
      if (!(erro instanceof ErroOperacao) || rodada >= rodadasMax) throw erro instanceof ErroOperacao ? new ErroAgente(t.naoCouberam(erro.message)) : erro;
      problema = `Uma operação não coube na matriz: ${erro.message}`;
    }
    historico = r.mensagens;
    usuario = `${problema}\n\nDevolva a lista de operações COMPLETA corrigida, aplicada sobre a matriz original.`;
  }
}
