import { familiaDoTipo, type Etapa, type Matriz, type TipoEtapa } from '../matriz.ts';
import { calcularLayout, etapasUnicas, type Caixa } from '../layout.ts';
import { idDaRaia } from '../ids.ts';
import type { Correcoes } from '../correcoes.ts';
import type { Idioma } from '../idioma.ts';

const TAG: Record<TipoEtapa, string> = {
  inicio: 'startEvent',
  fim: 'endEvent',
  evento_intermediario: 'intermediateThrowEvent',
  evento_timer: 'intermediateCatchEvent',
  evento_mensagem: 'intermediateCatchEvent',
  tarefa: 'task',
  tarefa_usuario: 'userTask',
  tarefa_manual: 'manualTask',
  tarefa_servico: 'serviceTask',
  tarefa_envio: 'sendTask',
  tarefa_recebimento: 'receiveTask',
  tarefa_regra: 'businessRuleTask',
  subprocesso: 'subProcess',
  gateway_exclusivo: 'exclusiveGateway',
  gateway_paralelo: 'parallelGateway',
  gateway_inclusivo: 'inclusiveGateway',
  gateway_evento: 'eventBasedGateway',
};

const DEFINICAO_EVENTO: Partial<Record<TipoEtapa, string>> = {
  evento_timer: 'timerEventDefinition',
  evento_mensagem: 'messageEventDefinition',
};

export function escaparXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rótulos da documentação de cada elemento. O importador lê os dois idiomas.
const ROTULOS_DOC: Record<Idioma, { ator: string; sistema: string; entrada: string; saida: string; regra: string; evidencias: string }> = {
  pt: { ator: 'Ator', sistema: 'Sistema', entrada: 'Entrada', saida: 'Saída', regra: 'Regra', evidencias: 'Evidências' },
  en: { ator: 'Actor', sistema: 'System', entrada: 'Input', saida: 'Output', regra: 'Rule', evidencias: 'Evidence' },
};

function documentacao(e: Etapa, idioma: Idioma): string {
  const r = ROTULOS_DOC[idioma];
  const linhas = [
    e.descricao,
    e.ator && `${r.ator}: ${e.ator}`,
    e.sistema && `${r.sistema}: ${e.sistema}`,
    e.entrada && `${r.entrada}: ${e.entrada}`,
    e.saida && `${r.saida}: ${e.saida}`,
    e.regra && `${r.regra}: ${e.regra}`,
    e.evidencias?.length && `${r.evidencias}: ${e.evidencias.join(', ')}`,
  ].filter(Boolean);
  return linhas.join('\n');
}

const bounds = (c: Caixa) =>
  `<dc:Bounds x="${Math.round(c.x)}" y="${Math.round(c.y)}" width="${Math.round(c.largura)}" height="${Math.round(c.altura)}" />`;

export interface OpcoesBpmn {
  correcoes?: Correcoes;
  /** Idioma dos rótulos da documentação ("Sistema:" ou "System:"). Padrão: português. */
  idioma?: Idioma;
}

/**
 * Matriz → BPMN 2.0 com diagrama (BPMN DI). Abre no bpmn-js, no Camunda Modeler e em
 * qualquer ferramenta que leia BPMN 2.0. O id de cada elemento é a chave da linha.
 */
export function renderizarBpmn(m: Matriz, opcoes: OpcoesBpmn = {}): string {
  const layout = calcularLayout(m, opcoes.correcoes);
  const etapas = etapasUnicas(m);
  const pid = m.processo.id;
  const id = {
    definicoes: `Definicoes_${pid}`,
    colaboracao: `Colaboracao_${pid}`,
    participante: `Participante_${pid}`,
    processo: `Processo_${pid}`,
    raias: `Raias_${pid}`,
    diagrama: `Diagrama_${pid}`,
    plano: `Plano_${pid}`,
  };

  const entradas = new Map<string, string[]>();
  const saidas = new Map<string, string[]>();
  for (const a of layout.arestas) {
    saidas.set(a.de, [...(saidas.get(a.de) ?? []), a.id]);
    entradas.set(a.para, [...(entradas.get(a.para) ?? []), a.id]);
  }

  const x: string[] = [];
  x.push('<?xml version="1.0" encoding="UTF-8"?>');
  x.push(
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ` +
      `xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ` +
      `xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ` +
      `xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ` +
      `xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" ` +
      `xmlns:color="http://www.omg.org/spec/BPMN/non-normative/color/1.0" ` +
      `id="${id.definicoes}" targetNamespace="https://boramapear.ai/bpmn" exporter="Bora Mapear" exporterVersion="0.1.0">`,
  );
  x.push(`  <bpmn:collaboration id="${id.colaboracao}">`);
  x.push(`    <bpmn:participant id="${id.participante}" name="${escaparXml(m.processo.nome)}" processRef="${id.processo}" />`);
  x.push('  </bpmn:collaboration>');
  x.push(`  <bpmn:process id="${id.processo}" name="${escaparXml(m.processo.nome)}" isExecutable="false">`);
  if (m.processo.descricao) x.push(`    <bpmn:documentation>${escaparXml(m.processo.descricao)}</bpmn:documentation>`);

  x.push(`    <bpmn:laneSet id="${id.raias}">`);
  for (const raia of layout.raias) {
    x.push(`      <bpmn:lane id="${idDaRaia(raia.id)}" name="${escaparXml(raia.nome)}">`);
    for (const e of etapas) if (e.raia === raia.id) x.push(`        <bpmn:flowNodeRef>${e.chave}</bpmn:flowNodeRef>`);
    x.push('      </bpmn:lane>');
  }
  x.push('    </bpmn:laneSet>');

  for (const e of etapas) {
    const tag = TAG[e.tipo];
    const doc = documentacao(e, opcoes.idioma ?? 'pt');
    x.push(`    <bpmn:${tag} id="${e.chave}" name="${escaparXml(e.nome)}">`);
    if (doc) x.push(`      <bpmn:documentation>${escaparXml(doc)}</bpmn:documentation>`);
    for (const f of entradas.get(e.chave) ?? []) x.push(`      <bpmn:incoming>${f}</bpmn:incoming>`);
    for (const f of saidas.get(e.chave) ?? []) x.push(`      <bpmn:outgoing>${f}</bpmn:outgoing>`);
    const definicao = DEFINICAO_EVENTO[e.tipo];
    if (definicao) x.push(`      <bpmn:${definicao} id="${e.chave}_definicao" />`);
    x.push(`    </bpmn:${tag}>`);
  }

  for (const a of layout.arestas) {
    const nome = a.rotulo ? ` name="${escaparXml(a.rotulo)}"` : '';
    x.push(`    <bpmn:sequenceFlow id="${a.id}"${nome} sourceRef="${a.de}" targetRef="${a.para}" />`);
  }
  x.push('  </bpmn:process>');

  x.push(`  <bpmndi:BPMNDiagram id="${id.diagrama}">`);
  x.push(`    <bpmndi:BPMNPlane id="${id.plano}" bpmnElement="${id.colaboracao}">`);
  x.push(`      <bpmndi:BPMNShape id="${id.participante}_di" bpmnElement="${id.participante}" isHorizontal="true">`);
  x.push(`        ${bounds(layout.pool)}`);
  x.push('      </bpmndi:BPMNShape>');
  for (const raia of layout.raias) {
    const rid = idDaRaia(raia.id);
    x.push(`      <bpmndi:BPMNShape id="${rid}_di" bpmnElement="${rid}" isHorizontal="true">`);
    x.push(`        ${bounds(raia)}`);
    x.push('      </bpmndi:BPMNShape>');
  }
  for (const e of etapas) {
    const no = layout.nos[e.chave]!;
    const extras: string[] = [];
    if (e.tipo === 'gateway_exclusivo') extras.push('isMarkerVisible="true"');
    if (familiaDoTipo(e.tipo) === 'subprocesso') extras.push('isExpanded="false"');
    if (no.corFundo) extras.push(`bioc:fill="${escaparXml(no.corFundo)}" color:background-color="${escaparXml(no.corFundo)}"`);
    if (no.corBorda) extras.push(`bioc:stroke="${escaparXml(no.corBorda)}" color:border-color="${escaparXml(no.corBorda)}"`);
    x.push(`      <bpmndi:BPMNShape id="${e.chave}_di" bpmnElement="${e.chave}"${extras.length ? ' ' + extras.join(' ') : ''}>`);
    x.push(`        ${bounds(no)}`);
    if (no.caixaRotulo) x.push(`        <bpmndi:BPMNLabel>${bounds(no.caixaRotulo)}</bpmndi:BPMNLabel>`);
    x.push('      </bpmndi:BPMNShape>');
  }
  for (const a of layout.arestas) {
    x.push(`      <bpmndi:BPMNEdge id="${a.id}_di" bpmnElement="${a.id}">`);
    for (const p of a.pontos) x.push(`        <di:waypoint x="${Math.round(p.x)}" y="${Math.round(p.y)}" />`);
    if (a.caixaRotulo) x.push(`        <bpmndi:BPMNLabel>${bounds(a.caixaRotulo)}</bpmndi:BPMNLabel>`);
    x.push('      </bpmndi:BPMNEdge>');
  }
  x.push('    </bpmndi:BPMNPlane>');
  x.push('  </bpmndi:BPMNDiagram>');
  x.push('</bpmn:definitions>');
  return x.join('\n') + '\n';
}
