/// <reference path="./bpmn-moddle.d.ts" />
import { BpmnModdle } from 'bpmn-moddle';
import { lerMatriz, type Etapa, type Matriz, type Raia, type TipoEtapa } from './matriz.ts';
import { extrairCorrecoes, lerDesenhoBpmn, type Correcoes } from './correcoes.ts';
import type { Idioma } from './idioma.ts';

export class ErroImportacao extends Error {}

export interface OpcoesImportacao {
  /** Idioma dos avisos, dos erros e dos nomes padrão ("Processo importado", "Geral"). Padrão: português. */
  idioma?: Idioma;
}

/** Mensagens dos importadores (BPMN, Mermaid e CSV). */
export const TEXTOS_IMPORTACAO = {
  pt: {
    processoImportado: 'Processo importado',
    geral: 'Geral',
    bpmnInvalido: (detalhe: string) => `O arquivo não é um BPMN 2.0 válido: ${detalhe}`,
    semProcesso: 'O arquivo não tem nenhum processo com elementos.',
    variosProcessos: (n: number) => `O arquivo tem ${n} processos (pools); só o primeiro foi importado.`,
    subprocessoAchatado: (nome: string, n: number) => `O subprocesso "${nome}" virou uma etapa só; os ${n} elementos de dentro ficaram de fora.`,
    semRaia: (nome: string, raia: string) => `"${nome}" não estava em raia nenhuma; foi para "${raia}".`,
    ignorados: (n: number, tipo: string) => `${n} ${tipo} ignorado(s): a matriz não tem esse tipo de elemento.`,
    layoutRefeito: 'O desenho foi refeito pelo layout do Bora Mapear; as posições do arquivo original não foram mantidas.',
    formaAberta: (linha: string) => `Forma sem fechamento em: ${linha}`,
    naoEFluxograma: 'O código não começa com "flowchart" ou "graph": só o fluxograma do Mermaid é lido.',
    trechoNaoEntendido: (n: number, trecho: string) => `Linha ${n}: trecho não entendido "${trecho}".`,
    setaSemDestino: (n: number) => `Linha ${n}: seta sem destino.`,
    codigoVazio: 'O código está vazio.',
    semNos: 'Não achei nenhum nó no código.',
    foraDeSubgraph: (nome: string, raia: string) => `"${nome}" estava fora de qualquer subgraph e foi para a raia "${raia}", de uma etapa vizinha.`,
    paraGeral: (raia: string) => `Nós sem subgraph e sem vizinho com raia foram para a raia "${raia}".`,
    planilhaVazia: 'A planilha está vazia: precisa do cabeçalho e de pelo menos uma linha.',
    faltamColunas: (colunas: string) => `Faltam colunas na planilha: ${colunas}. O cabeçalho precisa de chave, tipo, nome e raia.`,
    tipoDesconhecido: (n: number, tipo: string) => `Linha ${n}: tipo "${tipo}" desconhecido; virou "Tarefa".`,
    confiancaIgnorada: (n: number, valor: string) => `Linha ${n}: confiança "${valor}" ignorada (use de 0 a 1).`,
    linha: (n: number) => `linha ${n}`,
  },
  en: {
    processoImportado: 'Imported process',
    geral: 'General',
    bpmnInvalido: (detalhe: string) => `The file is not valid BPMN 2.0: ${detalhe}`,
    semProcesso: 'The file has no process with elements.',
    variosProcessos: (n: number) => `The file has ${n} processes (pools); only the first one was imported.`,
    subprocessoAchatado: (nome: string, n: number) => `Subprocess "${nome}" became a single step; the ${n} elements inside it were left out.`,
    semRaia: (nome: string, raia: string) => `"${nome}" was not in any lane; it went to "${raia}".`,
    ignorados: (n: number, tipo: string) => `${n} ${tipo} ignored: the matrix has no such element type.`,
    layoutRefeito: "The drawing was redone by Bora Mapear's layout; the original file's positions were not kept.",
    formaAberta: (linha: string) => `Unclosed shape in: ${linha}`,
    naoEFluxograma: 'The code does not start with "flowchart" or "graph": only Mermaid flowcharts are read.',
    trechoNaoEntendido: (n: number, trecho: string) => `Line ${n}: could not understand "${trecho}".`,
    setaSemDestino: (n: number) => `Line ${n}: arrow without a target.`,
    codigoVazio: 'The code is empty.',
    semNos: 'No nodes found in the code.',
    foraDeSubgraph: (nome: string, raia: string) => `"${nome}" was outside any subgraph and went to lane "${raia}", from a neighboring step.`,
    paraGeral: (raia: string) => `Nodes with no subgraph and no neighbor in a lane went to lane "${raia}".`,
    planilhaVazia: 'The spreadsheet is empty: it needs the header and at least one row.',
    faltamColunas: (colunas: string) => `Missing columns: ${colunas}. The header needs key, type, name and lane.`,
    tipoDesconhecido: (n: number, tipo: string) => `Row ${n}: unknown type "${tipo}"; it became "Task".`,
    confiancaIgnorada: (n: number, valor: string) => `Row ${n}: confidence "${valor}" ignored (use 0 to 1).`,
    linha: (n: number) => `row ${n}`,
  },
} satisfies Record<Idioma, unknown>;

export interface ResultadoImportacao {
  matriz: Matriz;
  /** O que ficou de fora ou foi adaptado na importação. */
  avisos: string[];
  /** Posições do desenho original, quando o arquivo veio do próprio Bora Mapear. */
  correcoes?: Correcoes;
}

// Tipagem mínima do que o bpmn-moddle devolve: ele não publica tipos na raiz do pacote.
interface ElementoBpmn {
  $type: string;
  id: string;
  name?: string;
  documentation?: Array<{ text?: string }>;
  eventDefinitions?: Array<{ $type: string }>;
  sourceRef?: ElementoBpmn;
  targetRef?: ElementoBpmn;
  flowElements?: ElementoBpmn[];
  laneSets?: Array<{ lanes?: Lane[] }>;
  processRef?: ElementoBpmn;
  participants?: ElementoBpmn[];
  rootElements?: ElementoBpmn[];
  exporter?: string;
}
interface Lane {
  id: string;
  name?: string;
  flowNodeRef?: Array<{ id: string }>;
  childLaneSet?: { lanes?: Lane[] };
}

const TIPOS: Record<string, TipoEtapa> = {
  'bpmn:StartEvent': 'inicio',
  'bpmn:EndEvent': 'fim',
  'bpmn:IntermediateThrowEvent': 'evento_intermediario',
  'bpmn:Task': 'tarefa',
  'bpmn:UserTask': 'tarefa_usuario',
  'bpmn:ManualTask': 'tarefa_manual',
  'bpmn:ServiceTask': 'tarefa_servico',
  'bpmn:ScriptTask': 'tarefa_servico',
  'bpmn:SendTask': 'tarefa_envio',
  'bpmn:ReceiveTask': 'tarefa_recebimento',
  'bpmn:BusinessRuleTask': 'tarefa_regra',
  'bpmn:SubProcess': 'subprocesso',
  'bpmn:CallActivity': 'subprocesso',
  'bpmn:Transaction': 'subprocesso',
  'bpmn:AdHocSubProcess': 'subprocesso',
  'bpmn:ExclusiveGateway': 'gateway_exclusivo',
  'bpmn:ParallelGateway': 'gateway_paralelo',
  'bpmn:InclusiveGateway': 'gateway_inclusivo',
  'bpmn:EventBasedGateway': 'gateway_evento',
  'bpmn:ComplexGateway': 'gateway_inclusivo',
};

function tipoDe(el: ElementoBpmn): TipoEtapa | undefined {
  if (el.$type === 'bpmn:IntermediateCatchEvent') {
    const defs = (el.eventDefinitions ?? []).map((d) => d.$type);
    if (defs.includes('bpmn:TimerEventDefinition')) return 'evento_timer';
    if (defs.includes('bpmn:MessageEventDefinition')) return 'evento_mensagem';
    return 'evento_intermediario';
  }
  return TIPOS[el.$type];
}

export function paraId(texto: string, prefixo: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return /^[a-z]/.test(base) ? base : `${prefixo}${base ? `-${base}` : ''}`;
}

const CHAVE_VALIDA = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Desfaz a documentação que o renderizador escreve, em português ou em inglês:
 * "Sistema: X" / "System: X", "Regra: Y" / "Rule: Y", "Evidências: EV-001" / "Evidence: EV-001".
 */
function lerDocumentacao(texto: string): Partial<Etapa> {
  const campos: Partial<Etapa> = {};
  const resto: string[] = [];
  const mapa: Record<string, 'ator' | 'sistema' | 'entrada' | 'saida' | 'regra' | 'evidencias'> = {
    Ator: 'ator',
    Sistema: 'sistema',
    Entrada: 'entrada',
    Saída: 'saida',
    Regra: 'regra',
    Evidências: 'evidencias',
    Actor: 'ator',
    System: 'sistema',
    Input: 'entrada',
    Output: 'saida',
    Rule: 'regra',
    Evidence: 'evidencias',
  };
  for (const linha of texto.split('\n')) {
    const m = /^([^:]{3,12}):\s*(.+)$/.exec(linha.trim());
    const campo = m ? mapa[m[1]!] : undefined;
    if (!m || !campo) {
      if (linha.trim()) resto.push(linha.trim());
      continue;
    }
    if (campo === 'evidencias') campos.evidencias = m[2]!.split(',').map((s) => s.trim()).filter(Boolean);
    else campos[campo] = m[2]!.trim();
  }
  if (resto.length) campos.descricao = resto.join(' ');
  return campos;
}

/**
 * BPMN 2.0 (de qualquer ferramenta: Camunda, bpmn.io, Bizagi, o próprio Bora Mapear) → matriz.
 * Determinístico. O id de cada elemento vira a chave da linha, quando é uma chave válida.
 */
export async function importarBpmn(xml: string, opcoes: OpcoesImportacao = {}): Promise<ResultadoImportacao> {
  const t = TEXTOS_IMPORTACAO[opcoes.idioma ?? 'pt'];
  let definicoes: ElementoBpmn;
  try {
    const r = await new BpmnModdle().fromXML(xml);
    definicoes = r.rootElement as ElementoBpmn;
  } catch (erro) {
    throw new ErroImportacao(t.bpmnInvalido(erro instanceof Error ? erro.message : String(erro)));
  }
  const avisos: string[] = [];
  const raizes = definicoes.rootElements ?? [];
  const processos = raizes.filter((e) => e.$type === 'bpmn:Process' && (e.flowElements?.length ?? 0) > 0);
  if (!processos.length) throw new ErroImportacao(t.semProcesso);
  const processo = processos[0]!;
  if (processos.length > 1) avisos.push(t.variosProcessos(processos.length));
  const participante = raizes
    .filter((e) => e.$type === 'bpmn:Collaboration')
    .flatMap((c) => c.participants ?? [])
    .find((p) => p.processRef?.id === processo.id);
  const nomeProcesso = participante?.name || processo.name || t.processoImportado;

  // Chaves: o id do elemento, ou um id válido derivado dele.
  const chaves = new Map<string, string>();
  const usadas = new Set<string>();
  const chaveDe = (id: string) => {
    let chave = chaves.get(id);
    if (chave) return chave;
    chave = CHAVE_VALIDA.test(id) ? id : `E_${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    for (let i = 2; usadas.has(chave); i++) chave = `${chave}_${i}`;
    usadas.add(chave);
    chaves.set(id, chave);
    return chave;
  };

  // Raias: as folhas do conjunto de raias; "Raia_x" (do próprio Bora Mapear) volta a ser "x".
  const folhas: Lane[] = [];
  const percorrer = (lanes: Lane[] = []) => {
    for (const l of lanes) {
      if (l.childLaneSet?.lanes?.length) percorrer(l.childLaneSet.lanes);
      else folhas.push(l);
    }
  };
  for (const ls of processo.laneSets ?? []) percorrer(ls.lanes);
  const raias: Raia[] = [];
  const raiaDoNo = new Map<string, string>();
  const idsRaia = new Set<string>();
  for (const l of folhas) {
    let id = /^Raia_([A-Za-z][A-Za-z0-9_-]*)$/.exec(l.id)?.[1] ?? paraId(l.name || l.id, 'raia');
    for (let i = 2; idsRaia.has(id); i++) id = `${id.replace(/-\d+$/, '')}-${i}`;
    idsRaia.add(id);
    raias.push({ id, nome: l.name?.trim() || id });
    for (const n of l.flowNodeRef ?? []) raiaDoNo.set(n.id, id);
  }
  const raiaPadrao = { id: paraId(nomeProcesso, 'processo'), nome: nomeProcesso };

  const elementos = processo.flowElements ?? [];
  const fluxos = elementos.filter((e) => e.$type === 'bpmn:SequenceFlow');
  const ignorados = new Map<string, number>();
  const etapas: Etapa[] = [];
  for (const el of elementos) {
    if (el.$type === 'bpmn:SequenceFlow') continue;
    const tipo = tipoDe(el);
    if (!tipo) {
      ignorados.set(el.$type, (ignorados.get(el.$type) ?? 0) + 1);
      continue;
    }
    if (tipo === 'subprocesso' && (el.flowElements?.length ?? 0) > 0) {
      avisos.push(t.subprocessoAchatado(el.name ?? el.id, el.flowElements!.length));
    }
    const etapa: Etapa = {
      chave: chaveDe(el.id),
      tipo,
      nome: (el.name ?? '').replace(/\s+/g, ' ').trim(),
      raia: raiaDoNo.get(el.id) ?? (raias.length ? '' : raiaPadrao.id),
      proximos: [],
      ...lerDocumentacao((el.documentation ?? []).map((d) => d.text ?? '').join('\n')),
    };
    if (!etapa.raia) {
      etapa.raia = raias[0]!.id;
      avisos.push(t.semRaia(etapa.nome || el.id, raias[0]!.nome));
    }
    etapas.push(etapa);
  }
  if (!raias.length) raias.push(raiaPadrao);
  for (const [tipo, n] of ignorados) avisos.push(t.ignorados(n, tipo.replace('bpmn:', '')));

  const porChave = new Map(etapas.map((e) => [e.chave, e]));
  for (const f of fluxos) {
    const de = f.sourceRef ? porChave.get(chaveDe(f.sourceRef.id)) : undefined;
    const para = f.targetRef ? chaveDe(f.targetRef.id) : undefined;
    if (!de || !para || !porChave.has(para)) continue;
    de.proximos.push(f.name?.trim() ? { para, rotulo: f.name.trim() } : { para });
  }

  // Ordem de leitura: a partir dos inícios, em largura; o que sobrar vem no fim, na ordem do arquivo.
  const ordem: Etapa[] = [];
  const vistas = new Set<string>();
  const fila = etapas.filter((e) => e.tipo === 'inicio');
  while (fila.length) {
    const e = fila.shift()!;
    if (vistas.has(e.chave)) continue;
    vistas.add(e.chave);
    ordem.push(e);
    for (const s of e.proximos) {
      const p = porChave.get(s.para);
      if (p && !vistas.has(p.chave)) fila.push(p);
    }
  }
  for (const e of etapas) if (!vistas.has(e.chave)) ordem.push(e);

  let matriz: Matriz;
  try {
    matriz = lerMatriz({ versaoSchema: 1, processo: { id: paraId(nomeProcesso, 'processo'), nome: nomeProcesso }, raias, etapas: ordem });
  } catch (erro) {
    throw new ErroImportacao(erro instanceof Error ? erro.message : String(erro));
  }

  // Arquivo do próprio Bora Mapear: as posições do desenho voltam como correções.
  const resultado: ResultadoImportacao = { matriz, avisos };
  if (definicoes.exporter === 'Bora Mapear') {
    resultado.correcoes = extrairCorrecoes(matriz, lerDesenhoBpmn(xml, matriz)).correcoes;
  } else {
    avisos.push(t.layoutRefeito);
  }
  return resultado;
}

/**
 * Junta a matriz lida de um desenho com a matriz de onde o desenho saiu: o conteúdo vem do desenho,
 * mas o que o BPMN não guarda (confiança, pedido de revisão humana) e a ordem das linhas vêm da original.
 */
export function reconciliarComOriginal(original: Matriz, lida: Matriz): Matriz {
  const antes = new Map(original.etapas.map((e, i) => [e.chave, { e, i }]));
  const etapas = lida.etapas
    .map((e, i) => {
      const a = antes.get(e.chave);
      const extra: Partial<Etapa> = {};
      if (a?.e.confianca !== undefined) extra.confianca = a.e.confianca;
      if (a?.e.revisarHumano) extra.revisarHumano = true;
      return { etapa: { ...e, ...extra }, ordem: a ? a.i : original.etapas.length + i };
    })
    .sort((x, y) => x.ordem - y.ordem)
    .map((x) => x.etapa);
  const ordemRaia = new Map(original.raias.map((r, i) => [r.id, i]));
  const raias = [...lida.raias].sort((a, b) => (ordemRaia.get(a.id) ?? 1e6) - (ordemRaia.get(b.id) ?? 1e6));
  return { ...lida, processo: original.processo, raias, etapas };
}
