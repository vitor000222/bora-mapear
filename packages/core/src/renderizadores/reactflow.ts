import { familiaDoTipo, type Familia, type Matriz, type TipoEtapa } from '../matriz.ts';
import { calcularLayout, etapasUnicas, type Ponto } from '../layout.ts';
import { idDaRaia } from '../ids.ts';
import type { Correcoes } from '../correcoes.ts';

export interface DadosEtapa {
  rotulo: string;
  tipo: TipoEtapa;
  raia: string;
  descricao?: string;
  sistema?: string;
  corFundo?: string;
  corBorda?: string;
  [extra: string]: unknown;
}

/** Nó no formato do @xyflow/react (React Flow 12+). */
export interface NoReactFlow {
  id: string;
  type: Familia | 'raia';
  position: Ponto;
  width: number;
  height: number;
  data: DadosEtapa | { rotulo: string; [extra: string]: unknown };
  draggable?: boolean;
  selectable?: boolean;
  connectable?: boolean;
  deletable?: boolean;
  zIndex?: number;
}

export interface ArestaReactFlow {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep';
  label?: string;
  markerEnd: { type: 'arrowclosed' };
  /** Pontos da rota calculada ou corrigida, para uma aresta personalizada desenhar. */
  data: { pontos: Ponto[] };
}

export interface GrafoReactFlow {
  nodes: NoReactFlow[];
  edges: ArestaReactFlow[];
}

export interface OpcoesReactFlow {
  correcoes?: Correcoes;
}

/**
 * Matriz → nós e arestas do React Flow, nas mesmas coordenadas do BPMN.
 * Raias são nós de fundo, fixos. O `type` de cada etapa é a família (evento, tarefa, subprocesso, gateway):
 * a aplicação registra um componente para cada uma.
 */
export function renderizarReactFlow(m: Matriz, opcoes: OpcoesReactFlow = {}): GrafoReactFlow {
  const layout = calcularLayout(m, opcoes.correcoes);
  const nodes: NoReactFlow[] = layout.raias.map((r) => ({
    id: idDaRaia(r.id),
    type: 'raia',
    position: { x: r.x, y: r.y },
    width: r.largura,
    height: r.altura,
    data: { rotulo: r.nome },
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
    zIndex: -1,
  }));

  for (const e of etapasUnicas(m)) {
    const no = layout.nos[e.chave]!;
    const data: DadosEtapa = { rotulo: e.nome, tipo: e.tipo, raia: e.raia };
    if (e.descricao) data.descricao = e.descricao;
    if (e.sistema) data.sistema = e.sistema;
    if (no.corFundo) data.corFundo = no.corFundo;
    if (no.corBorda) data.corBorda = no.corBorda;
    nodes.push({
      id: e.chave,
      type: familiaDoTipo(e.tipo),
      position: { x: no.x, y: no.y },
      width: no.largura,
      height: no.altura,
      data,
    });
  }

  const edges: ArestaReactFlow[] = layout.arestas.map((a) => {
    const aresta: ArestaReactFlow = {
      id: a.id,
      source: a.de,
      target: a.para,
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed' },
      data: { pontos: a.pontos },
    };
    if (a.rotulo) aresta.label = a.rotulo;
    return aresta;
  });

  return { nodes, edges };
}
