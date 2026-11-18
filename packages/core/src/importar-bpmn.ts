/// <reference path="./bpmn-moddle.d.ts" />
import { BpmnModdle } from 'bpmn-moddle';
import { lerMatriz, type Etapa, type Matriz, type Raia, type TipoEtapa } from './matriz.ts';
import { extrairCorrecoes, lerDesenhoBpmn, type Correcoes } from './correcoes.ts';

export class ErroImportacao extends Error {}

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

/** Desfaz a documentação que o renderizador escreve: "Sistema: X", "Regra: Y", "Evidências: EV-001". */
function lerDocumentacao(texto: string): Partial<Etapa> {
  const campos: Partial<Etapa> = {};
  const resto: string[] = [];
  const mapa: Record<string, 'ator' | 'sistema' | 'entrada' | 'saida' | 'regra'> = { Ator: 'ator', Sistema: 'sistema', Entrada: 'entrada', Saída: 'saida', Regra: 'regra' };
  for (const linha of texto.split('\n')) {
    const m = /^(Ator|Sistema|Entrada|Saída|Regra|Evidências):\s*(.+)$/.exec(linha.trim());
    if (!m) {
      if (linha.trim()) resto.push(linha.trim());
      continue;
    }
    if (m[1] === 'Evidências') campos.evidencias = m[2]!.split(',').map((s) => s.trim()).filter(Boolean);
    else campos[mapa[m[1]!]!] = m[2]!.trim();
  }
  if (resto.length) campos.descricao = resto.join(' ');
  return campos;
}

/**
 * BPMN 2.0 (de qualquer ferramenta: Camunda, bpmn.io, Bizagi, o próprio Bora Mapear) → matriz.
 * Determinístico. O id de cada elemento vira a chave da linha, quando é uma chave válida.
 */
export async function importarBpmn(xml: string): Promise<ResultadoImportacao> {
  let definicoes: ElementoBpmn;
  try {
    const r = await new BpmnModdle().fromXML(xml);
    definicoes = r.rootElement as ElementoBpmn;
  } catch (erro) {
    throw new ErroImportacao(`O arquivo não é um BPMN 2.0 válido: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  const avisos: string[] = [];
  const raizes = definicoes.rootElements ?? [];
  const processos = raizes.filter((e) => e.$type === 'bpmn:Process' && (e.flowElements?.length ?? 0) > 0);
  if (!processos.length) throw new ErroImportacao('O arquivo não tem nenhum processo com elementos.');
  const processo = processos[0]!;
  if (processos.length > 1) avisos.push(`O arquivo tem ${processos.length} processos (pools); só o primeiro foi importado.`);
  const participante = raizes
    .filter((e) => e.$type === 'bpmn:Collaboration')
    .flatMap((c) => c.participants ?? [])
    .find((p) => p.processRef?.id === processo.id);
  const nomeProcesso = participante?.name || processo.name || 'Processo importado';

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
      avisos.push(`O subprocesso "${el.name ?? el.id}" virou uma etapa só; os ${el.flowElements!.length} elementos de dentro ficaram de fora.`);
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
      avisos.push(`"${etapa.nome || el.id}" não estava em raia nenhuma; foi para "${raias[0]!.nome}".`);
    }
    etapas.push(etapa);
  }
  if (!raias.length) raias.push(raiaPadrao);
  for (const [tipo, n] of ignorados) avisos.push(`${n} ${tipo.replace('bpmn:', '')} ignorado(s): a matriz não tem esse tipo de elemento.`);

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
    avisos.push('O desenho foi refeito pelo layout do Bora Mapear; as posições do arquivo original não foram mantidas.');
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
