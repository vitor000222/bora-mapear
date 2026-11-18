import type { Matriz } from './matriz.ts';
import type { Idioma } from './idioma.ts';
import { calcularLayout, etapasUnicas, raiasDoDesenho, type Caixa, type Layout, type Ponto } from './layout.ts';
import { fluxosDaMatriz, idDaRaia } from './ids.ts';

/** O que o usuário mudou na forma de um elemento. */
export interface CorrecaoNo {
  x?: number;
  y?: number;
  largura?: number;
  altura?: number;
  corFundo?: string;
  corBorda?: string;
}

/**
 * As correções de uma visão. Ficam fora da matriz, chaveadas pela chave da linha,
 * e só guardam o que difere do layout automático.
 */
export interface Correcoes {
  versao: 1;
  nos: Record<string, CorrecaoNo>;
  arestas: Record<string, { pontos: Ponto[] }>;
  raias: Record<string, Partial<Caixa>>;
  pool?: Partial<Caixa>;
}

export function correcoesVazias(): Correcoes {
  return { versao: 1, nos: {}, arestas: {}, raias: {} };
}

/** Se há alguma correção guardada: de etapa, de seta, de raia ou do pool. */
export function temCorrecoes(c: Correcoes): boolean {
  return (
    Object.keys(c.nos).length > 0 ||
    Object.keys(c.arestas).length > 0 ||
    Object.keys(c.raias).length > 0 ||
    (c.pool !== undefined && Object.keys(c.pool).length > 0)
  );
}

/** `b` por cima de `a`. */
export function mesclarCorrecoes(a: Correcoes, b: Correcoes): Correcoes {
  const nos: Record<string, CorrecaoNo> = { ...a.nos };
  for (const [k, v] of Object.entries(b.nos)) nos[k] = { ...nos[k], ...v };
  const raias: Record<string, Partial<Caixa>> = { ...a.raias };
  for (const [k, v] of Object.entries(b.raias)) raias[k] = { ...raias[k], ...v };
  const resultado: Correcoes = { versao: 1, nos, arestas: { ...a.arestas, ...b.arestas }, raias };
  if (a.pool || b.pool) resultado.pool = { ...a.pool, ...b.pool };
  return resultado;
}

/** Um desenho lido de um editor, já em coordenadas do layout. */
export interface Desenho {
  nos: Record<string, Caixa & { corFundo?: string; corBorda?: string }>;
  raias: Record<string, Caixa>;
  pool?: Caixa;
  arestas: Record<string, Ponto[]>;
  /** Ids no desenho que não existem na matriz: sinal de edição de conteúdo. */
  desconhecidos: string[];
}

export interface ResultadoExtracao {
  correcoes: Correcoes;
  /** Elementos do desenho que não existem na matriz (etapa criada no editor visual). */
  desconhecidos: string[];
  /** Linhas da matriz que não aparecem no desenho (etapa apagada no editor visual). */
  ausentes: string[];
}

const TOLERANCIA = 1;
const difere = (a: number, b: number) => Math.abs(a - b) > TOLERANCIA;
const caixaDifere = (a: Caixa, b: Caixa) =>
  difere(a.x, b.x) || difere(a.y, b.y) || difere(a.largura, b.largura) || difere(a.altura, b.altura);
const pontosDiferem = (a: Ponto[], b: Ponto[]) =>
  a.length !== b.length || a.some((p, i) => difere(p.x, b[i]!.x) || difere(p.y, b[i]!.y));

/**
 * Compara o desenho com o layout automático e guarda só o que o usuário mudou,
 * de forma que `calcularLayout(matriz, correcoes)` reproduza o desenho.
 */
export function extrairCorrecoes(m: Matriz, desenho: Desenho): ResultadoExtracao {
  const correcoes = correcoesVazias();

  // Mover uma etapa pode fazer a raia crescer e empurrar as de baixo; por isso repete até estabilizar.
  let layout: Layout = calcularLayout(m, correcoes);
  for (let rodada = 0; rodada < 50; rodada++) {
    let mudou = false;
    for (const [chave, d] of Object.entries(desenho.nos)) {
      const auto = layout.nos[chave];
      if (!auto) continue;
      const c = correcoes.nos[chave] ?? {};
      if ((difere(d.x, auto.x) || difere(d.y, auto.y)) && c.x === undefined) {
        Object.assign(c, { x: d.x, y: d.y });
        mudou = true;
      }
      if ((difere(d.largura, auto.largura) || difere(d.altura, auto.altura)) && c.largura === undefined) {
        Object.assign(c, { largura: d.largura, altura: d.altura });
        mudou = true;
      }
      if (d.corFundo && d.corFundo !== auto.corFundo) (c.corFundo = d.corFundo), (mudou = true);
      if (d.corBorda && d.corBorda !== auto.corBorda) (c.corBorda = d.corBorda), (mudou = true);
      if (Object.keys(c).length > 0) correcoes.nos[chave] = c;
    }
    for (const raia of layout.raias) {
      const d = desenho.raias[raia.id];
      if (d && !correcoes.raias[raia.id] && caixaDifere(d, raia)) {
        correcoes.raias[raia.id] = { x: d.x, y: d.y, largura: d.largura, altura: d.altura };
        mudou = true;
      }
    }
    if (desenho.pool && !correcoes.pool && caixaDifere(desenho.pool, layout.pool)) {
      correcoes.pool = { ...desenho.pool };
      mudou = true;
    }
    if (!mudou) break;
    layout = calcularLayout(m, correcoes);
  }

  for (const aresta of layout.arestas) {
    const d = desenho.arestas[aresta.id];
    if (d && pontosDiferem(d, aresta.pontos)) correcoes.arestas[aresta.id] = { pontos: d.map((p) => ({ ...p })) };
  }

  const noDesenho = new Set(Object.keys(desenho.nos));
  const ausentes = etapasUnicas(m)
    .map((e) => e.chave)
    .filter((c) => !noDesenho.has(c));
  return { correcoes, desconhecidos: [...desenho.desconhecidos], ausentes };
}

// ---------------------------------------------------------------- BPMN (XML exportado pelo bpmn-js)

function atributos(trecho: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, nome, valor] of trecho.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[nome!] = valor!;
  return attrs;
}

function atributoPorSufixo(attrs: Record<string, string>, ...sufixos: string[]): string | undefined {
  for (const s of sufixos) {
    for (const [k, v] of Object.entries(attrs)) if (k === s || k.endsWith(`:${s}`)) return v;
  }
  return undefined;
}

const num = (v: string | undefined) => Math.round(Number(v ?? 0));

/** Lê o diagrama (BPMN DI) de um XML BPMN 2.0 e devolve o desenho em coordenadas do layout. */
export function lerDesenhoBpmn(xml: string, m: Matriz): Desenho {
  const chaves = new Set(etapasUnicas(m).map((e) => e.chave));
  const raiaPorId = new Map(raiasDoDesenho(m).map((r) => [idDaRaia(r.id), r.id]));
  const fluxos = new Set(fluxosDaMatriz(m).map((f) => f.id));
  const participantes = new Set([...xml.matchAll(/<(?:[\w-]+:)?participant\b[^>]*?\bid="([^"]+)"/g)].map((x) => x[1]!));

  const desenho: Desenho = { nos: {}, raias: {}, arestas: {}, desconhecidos: [] };

  for (const [, abertura, corpo] of xml.matchAll(/<(?:[\w-]+:)?BPMNShape\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?BPMNShape>)/g)) {
    const attrs = atributos(abertura!);
    const elemento = attrs['bpmnElement'];
    const semRotulo = (corpo ?? '').replace(/<(?:[\w-]+:)?BPMNLabel\b[\s\S]*?(?:\/>|<\/(?:[\w-]+:)?BPMNLabel>)/g, '');
    const bounds = semRotulo.match(/<(?:[\w-]+:)?Bounds\b([^>]*)\/?>/);
    if (!elemento || !bounds) continue;
    const b = atributos(bounds[1]!);
    const caixa: Caixa = { x: num(b['x']), y: num(b['y']), largura: num(b['width']), altura: num(b['height']) };

    if (chaves.has(elemento)) {
      const no: Desenho['nos'][string] = { ...caixa };
      const fundo = atributoPorSufixo(attrs, 'background-color', 'fill');
      const borda = atributoPorSufixo(attrs, 'border-color', 'stroke');
      if (fundo) no.corFundo = fundo;
      if (borda) no.corBorda = borda;
      desenho.nos[elemento] = no;
    } else if (raiaPorId.has(elemento)) {
      desenho.raias[raiaPorId.get(elemento)!] = caixa;
    } else if (participantes.has(elemento)) {
      desenho.pool = caixa;
    } else {
      desenho.desconhecidos.push(elemento);
    }
  }

  for (const [, abertura, corpo] of xml.matchAll(/<(?:[\w-]+:)?BPMNEdge\b([^>]*?)>([\s\S]*?)<\/(?:[\w-]+:)?BPMNEdge>/g)) {
    const elemento = atributos(abertura!)['bpmnElement'];
    if (!elemento) continue;
    if (!fluxos.has(elemento)) {
      desenho.desconhecidos.push(elemento);
      continue;
    }
    desenho.arestas[elemento] = [...corpo!.matchAll(/<(?:[\w-]+:)?waypoint\b([^>]*)\/?>/g)].map((w) => {
      const a = atributos(w[1]!);
      return { x: num(a['x']), y: num(a['y']) };
    });
  }

  return desenho;
}

/** Correções a partir do XML que o bpmn-js exporta depois que o usuário edita o desenho. */
export function extrairCorrecoesDoBpmn(xml: string, m: Matriz): ResultadoExtracao {
  return extrairCorrecoes(m, lerDesenhoBpmn(xml, m));
}

// ---------------------------------------------------------------- React Flow

export interface NoReactFlowSalvo {
  id: string;
  type?: string;
  position: Ponto;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  data?: { corFundo?: string; corBorda?: string } & Record<string, unknown>;
}

/** Correções a partir dos nós do React Flow depois que o usuário arrasta. As raias não são editáveis lá. */
export function extrairCorrecoesDoReactFlow(nodes: NoReactFlowSalvo[], m: Matriz): ResultadoExtracao {
  const chaves = new Set(etapasUnicas(m).map((e) => e.chave));
  const raias = new Set(raiasDoDesenho(m).map((r) => idDaRaia(r.id)));
  const auto = calcularLayout(m);
  const desenho: Desenho = { nos: {}, raias: {}, arestas: {}, desconhecidos: [] };
  for (const n of nodes) {
    if (raias.has(n.id)) continue;
    if (!chaves.has(n.id)) {
      desenho.desconhecidos.push(n.id);
      continue;
    }
    const padrao = auto.nos[n.id]!;
    const no: Desenho['nos'][string] = {
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      largura: Math.round(n.width ?? n.measured?.width ?? padrao.largura),
      altura: Math.round(n.height ?? n.measured?.height ?? padrao.altura),
    };
    if (n.data?.corFundo) no.corFundo = n.data.corFundo;
    if (n.data?.corBorda) no.corBorda = n.data.corBorda;
    desenho.nos[n.id] = no;
  }
  return extrairCorrecoes(m, desenho);
}

// ---------------------------------------------------------------- Registro

function direcao(d: number, positivo: string, negativo: string): string {
  return `${Math.abs(d)} px ${d > 0 ? positivo : negativo}`;
}

const FRASES = {
  pt: {
    direita: 'para a direita',
    esquerda: 'para a esquerda',
    baixo: 'para baixo',
    cima: 'para cima',
    e: ' e ',
    moveu: (nome: string, partes: string) => `Moveu ${nome} ${partes}.`,
    redimensionou: (nome: string, l: number, a: number) => `Redimensionou ${nome} para ${l}×${a}.`,
    fundo: (cor: string) => `fundo ${cor}`,
    borda: (cor: string) => `borda ${cor}`,
    pintou: (nome: string, cores: string) => `Pintou ${nome}: ${cores}.`,
    seta: (seta: string, n: number) => `Redesenhou a seta ${seta} com ${n} pontos.`,
    alturaRaia: (nome: string, de: number, para: number) => `Mudou a altura da raia ${nome} de ${de} para ${para} px.`,
    raia: (nome: string) => `Ajustou a raia ${nome}.`,
    pool: 'Ajustou o contorno do processo.',
    voltouNo: (nome: string) => `Voltou ${nome} ao automático.`,
    voltouSeta: (id: string) => `Voltou a seta ${id} ao traçado automático.`,
    voltouRaia: (nome: string) => `Voltou a raia ${nome} ao automático.`,
    voltouPool: 'Voltou o contorno do processo ao automático.',
  },
  en: {
    direita: 'to the right',
    esquerda: 'to the left',
    baixo: 'down',
    cima: 'up',
    e: ' and ',
    moveu: (nome: string, partes: string) => `Moved ${nome} ${partes}.`,
    redimensionou: (nome: string, l: number, a: number) => `Resized ${nome} to ${l}×${a}.`,
    fundo: (cor: string) => `fill ${cor}`,
    borda: (cor: string) => `border ${cor}`,
    pintou: (nome: string, cores: string) => `Colored ${nome}: ${cores}.`,
    seta: (seta: string, n: number) => `Redrew the flow ${seta} with ${n} points.`,
    alturaRaia: (nome: string, de: number, para: number) => `Changed the height of lane ${nome} from ${de} to ${para} px.`,
    raia: (nome: string) => `Adjusted lane ${nome}.`,
    pool: 'Adjusted the process outline.',
    voltouNo: (nome: string) => `Reset ${nome} to the automatic layout.`,
    voltouSeta: (id: string) => `Reset the flow ${id} to the automatic route.`,
    voltouRaia: (nome: string) => `Reset lane ${nome} to the automatic layout.`,
    voltouPool: 'Reset the process outline to the automatic layout.',
  },
} satisfies Record<Idioma, unknown>;

/**
 * As correções em frases: o registro que o usuário lê no histórico
 * e que o Agente Visual usa como exemplo do gosto dele.
 */
export function descreverCorrecoes(m: Matriz, c: Correcoes, idioma: Idioma = 'pt'): string[] {
  const t = FRASES[idioma];
  const auto = calcularLayout(m);
  const nomes = new Map(etapasUnicas(m).map((e) => [e.chave, e.nome ? `"${e.nome}" (${e.chave})` : e.chave]));
  const nomesRaia = new Map(raiasDoDesenho(m).map((r) => [r.id, r.nome]));
  const frases: string[] = [];

  for (const [chave, n] of Object.entries(c.nos)) {
    const base = auto.nos[chave];
    const nome = nomes.get(chave) ?? chave;
    if (base && n.x !== undefined && n.y !== undefined) {
      const partes: string[] = [];
      const dx = n.x - base.x;
      const dy = n.y - base.y;
      if (dx) partes.push(direcao(dx, t.direita, t.esquerda));
      if (dy) partes.push(direcao(dy, t.baixo, t.cima));
      if (partes.length) frases.push(t.moveu(nome, partes.join(t.e)));
    }
    if (n.largura !== undefined && n.altura !== undefined) frases.push(t.redimensionou(nome, n.largura, n.altura));
    if (n.corFundo || n.corBorda) {
      const cores = [n.corFundo && t.fundo(n.corFundo), n.corBorda && t.borda(n.corBorda)].filter(Boolean).join(t.e);
      frases.push(t.pintou(nome, cores));
    }
  }
  const fluxos = new Map(fluxosDaMatriz(m).map((f) => [f.id, f]));
  for (const [id, a] of Object.entries(c.arestas)) {
    const f = fluxos.get(id);
    const seta = f ? `${f.de} → ${f.para}${f.rotulo ? ` ("${f.rotulo}")` : ''}` : id;
    frases.push(t.seta(seta, a.pontos.length));
  }
  for (const [id, caixa] of Object.entries(c.raias)) {
    const base = auto.raias.find((r) => r.id === id);
    const nome = `"${nomesRaia.get(id) ?? id}"`;
    if (base && caixa.altura !== undefined && caixa.altura !== base.altura) {
      frases.push(t.alturaRaia(nome, base.altura, caixa.altura));
    } else {
      frases.push(t.raia(nome));
    }
  }
  if (c.pool) frases.push(t.pool);
  return frases;
}

export interface DiferencaCorrecoes {
  /** O que entrou ou mudou nesta gravação. */
  mudou: Correcoes;
  /** Ids que tinham correção e voltaram ao automático. */
  desfeitas: { nos: string[]; arestas: string[]; raias: string[]; pool: boolean };
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** O que mudou de uma gravação de correções para a seguinte. */
export function diferencaCorrecoes(antes: Correcoes, depois: Correcoes): DiferencaCorrecoes {
  const mudou = correcoesVazias();
  // Por campo: pintar uma etapa já movida não é "mover de novo".
  for (const [k, v] of Object.entries(depois.nos)) {
    const a = antes.nos[k] ?? {};
    const parcial: CorrecaoNo = {};
    if ((a.x !== v.x || a.y !== v.y) && v.x !== undefined && v.y !== undefined) Object.assign(parcial, { x: v.x, y: v.y });
    if ((a.largura !== v.largura || a.altura !== v.altura) && v.largura !== undefined && v.altura !== undefined) Object.assign(parcial, { largura: v.largura, altura: v.altura });
    if (v.corFundo && a.corFundo !== v.corFundo) parcial.corFundo = v.corFundo;
    if (v.corBorda && a.corBorda !== v.corBorda) parcial.corBorda = v.corBorda;
    if (Object.keys(parcial).length) mudou.nos[k] = parcial;
  }
  for (const [k, v] of Object.entries(depois.arestas)) if (!igual(antes.arestas[k], v)) mudou.arestas[k] = v;
  for (const [k, v] of Object.entries(depois.raias)) if (!igual(antes.raias[k], v)) mudou.raias[k] = v;
  if (depois.pool && !igual(antes.pool, depois.pool)) mudou.pool = depois.pool;
  return {
    mudou,
    desfeitas: {
      nos: Object.keys(antes.nos).filter((k) => !(k in depois.nos)),
      arestas: Object.keys(antes.arestas).filter((k) => !(k in depois.arestas)),
      raias: Object.keys(antes.raias).filter((k) => !(k in depois.raias)),
      pool: Boolean(antes.pool && !depois.pool),
    },
  };
}

/** As frases do registro de uma gravação: o que o usuário fez desde a última vez. */
export function descreverMudanca(m: Matriz, antes: Correcoes, depois: Correcoes, idioma: Idioma = 'pt'): string[] {
  const t = FRASES[idioma];
  const { mudou, desfeitas } = diferencaCorrecoes(antes, depois);
  const nomes = new Map(etapasUnicas(m).map((e) => [e.chave, e.nome ? `"${e.nome}" (${e.chave})` : e.chave]));
  const nomesRaia = new Map(raiasDoDesenho(m).map((r) => [r.id, `"${r.nome}"`]));
  const frases = descreverCorrecoes(m, mudou, idioma);
  for (const k of desfeitas.nos) frases.push(t.voltouNo(nomes.get(k) ?? k));
  for (const k of desfeitas.arestas) frases.push(t.voltouSeta(k));
  for (const k of desfeitas.raias) frases.push(t.voltouRaia(nomesRaia.get(k) ?? k));
  if (desfeitas.pool) frases.push(t.voltouPool);
  return frases;
}
