import { familiaDoTipo, type Etapa, type Familia, type Matriz, type Raia } from './matriz.ts';
import { fluxosDaMatriz } from './ids.ts';
import type { Correcoes } from './correcoes.ts';

export interface Ponto {
  x: number;
  y: number;
}

export interface Caixa {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface NoLayout extends Caixa {
  chave: string;
  corFundo?: string;
  corBorda?: string;
  /** Caixa do nome, quando ele fica fora da forma (gateway). */
  caixaRotulo?: Caixa;
}

export interface RaiaLayout extends Caixa {
  id: string;
  nome: string;
}

export interface ArestaLayout {
  id: string;
  de: string;
  para: string;
  rotulo?: string;
  pontos: Ponto[];
  /** Caixa do rótulo, encostada na saída da seta. */
  caixaRotulo?: Caixa;
}

export interface Layout {
  pool: Caixa;
  raias: RaiaLayout[];
  nos: Record<string, NoLayout>;
  arestas: ArestaLayout[];
}

/** Tamanho padrão de cada família, o mesmo que o bpmn-js usa. */
export const TAMANHOS: Record<Familia, { largura: number; altura: number }> = {
  evento: { largura: 36, altura: 36 },
  gateway: { largura: 50, altura: 50 },
  tarefa: { largura: 100, altura: 80 },
  subprocesso: { largura: 100, altura: 80 },
};

/** A grade do layout automático. Mudar aqui muda todo desenho. */
export const GRADE = {
  origemX: 160,
  origemY: 80,
  cabecalhoPool: 30,
  cabecalhoRaia: 30,
  respiro: 30,
  coluna: 160,
  linha: 120,
  folga: 20,
  desvioVolta: 15,
  rotuloLargura: 90,
  rotuloLinha: 14,
} as const;

/** Caixa estimada de um texto curto, quebrado na largura dos rótulos do bpmn-js. */
export function medirRotulo(texto: string): { largura: number; altura: number } {
  const larguraTexto = texto.length * 7 + 6;
  return {
    largura: Math.max(24, Math.min(GRADE.rotuloLargura, larguraTexto)),
    altura: Math.ceil(Math.max(1, larguraTexto) / GRADE.rotuloLargura) * GRADE.rotuloLinha,
  };
}

/** Etapas sem chave repetida (fica a primeira). O portão acusa as repetidas. */
export function etapasUnicas(m: Matriz): Etapa[] {
  const vistas = new Set<string>();
  return m.etapas.filter((e) => (vistas.has(e.chave) ? false : (vistas.add(e.chave), true)));
}

/** Raias na ordem da matriz, mais as que alguma etapa cita e não foram declaradas. */
export function raiasDoDesenho(m: Matriz): Raia[] {
  const raias: Raia[] = [];
  const vistas = new Set<string>();
  for (const r of m.raias) if (!vistas.has(r.id)) (vistas.add(r.id), raias.push(r));
  for (const e of m.etapas) if (!vistas.has(e.raia)) (vistas.add(e.raia), raias.push({ id: e.raia, nome: e.raia }));
  return raias;
}

/**
 * Nível de cada etapa = coluna no desenho. É o caminho mais longo desde um início,
 * ignorando as setas de volta (laços), que são desenhadas por baixo.
 */
export function calcularNiveis(m: Matriz): { nivel: Map<string, number>; voltas: Set<string> } {
  const etapas = etapasUnicas(m);
  const existe = new Set(etapas.map((e) => e.chave));
  const saidas = new Map<string, string[]>();
  const temEntrada = new Set<string>();
  for (const e of etapas) {
    const destinos = e.proximos.map((s) => s.para).filter((p) => existe.has(p) && p !== e.chave);
    saidas.set(e.chave, destinos);
    for (const d of destinos) temEntrada.add(d);
  }

  const ordem = [
    ...etapas.filter((e) => e.tipo === 'inicio'),
    ...etapas.filter((e) => !temEntrada.has(e.chave)),
    ...etapas,
  ].map((e) => e.chave);

  const estado = new Map<string, 1 | 2>();
  const voltas = new Set<string>();
  for (const raiz of ordem) {
    if (estado.has(raiz)) continue;
    // Busca em profundidade iterativa: a seta que chega num nó ainda aberto é uma volta.
    const pilha: Array<{ chave: string; i: number }> = [{ chave: raiz, i: 0 }];
    estado.set(raiz, 1);
    while (pilha.length > 0) {
      const topo = pilha[pilha.length - 1]!;
      const destinos = saidas.get(topo.chave) ?? [];
      if (topo.i >= destinos.length) {
        estado.set(topo.chave, 2);
        pilha.pop();
        continue;
      }
      const d = destinos[topo.i++]!;
      const s = estado.get(d);
      if (s === 1) voltas.add(`${topo.chave}>${d}`);
      else if (s === undefined) {
        estado.set(d, 1);
        pilha.push({ chave: d, i: 0 });
      }
    }
  }

  const grau = new Map<string, number>(etapas.map((e) => [e.chave, 0]));
  for (const [de, destinos] of saidas) for (const d of destinos) if (!voltas.has(`${de}>${d}`)) grau.set(d, grau.get(d)! + 1);
  const nivel = new Map<string, number>(etapas.map((e) => [e.chave, 0]));
  const fila = etapas.map((e) => e.chave).filter((c) => grau.get(c) === 0);
  while (fila.length > 0) {
    const c = fila.shift()!;
    for (const d of saidas.get(c) ?? []) {
      if (voltas.has(`${c}>${d}`)) continue;
      nivel.set(d, Math.max(nivel.get(d)!, nivel.get(c)! + 1));
      grau.set(d, grau.get(d)! - 1);
      if (grau.get(d) === 0) fila.push(d);
    }
  }
  return { nivel, voltas };
}

const r = Math.round;

/**
 * Layout determinístico em raias horizontais: coluna = nível, linha = raia.
 * As correções do usuário entram por cima do automático; o que não foi corrigido continua automático.
 */
export function calcularLayout(m: Matriz, correcoes?: Correcoes): Layout {
  const etapas = etapasUnicas(m);
  const raiasMatriz = raiasDoDesenho(m);
  const { nivel } = calcularNiveis(m);

  // Quantas etapas caem na mesma célula (raia × nível): elas se empilham dentro da raia.
  const linhaNaCelula = new Map<string, number>();
  const ocupacao = new Map<string, number>();
  const linhasDaRaia = new Map<string, number>();
  for (const e of etapas) {
    const celula = `${e.raia}|${nivel.get(e.chave)}`;
    const i = ocupacao.get(celula) ?? 0;
    ocupacao.set(celula, i + 1);
    linhaNaCelula.set(e.chave, i);
    linhasDaRaia.set(e.raia, Math.max(linhasDaRaia.get(e.raia) ?? 0, i + 1));
  }

  const nNiveis = Math.max(0, ...nivel.values()) + 1;
  const xConteudo = GRADE.origemX + GRADE.cabecalhoPool + GRADE.cabecalhoRaia + GRADE.respiro;
  const larguraAuto = GRADE.cabecalhoPool + GRADE.cabecalhoRaia + GRADE.respiro * 2 + nNiveis * GRADE.coluna;

  const nos: Record<string, NoLayout> = {};
  const raias: RaiaLayout[] = [];
  let y = GRADE.origemY;

  for (const raia of raiasMatriz) {
    const caixa: RaiaLayout = {
      id: raia.id,
      nome: raia.nome,
      x: GRADE.origemX + GRADE.cabecalhoPool,
      y,
      largura: larguraAuto - GRADE.cabecalhoPool,
      altura: Math.max(1, linhasDaRaia.get(raia.id) ?? 0) * GRADE.linha,
    };
    let fundo = caixa.y + caixa.altura;
    for (const e of etapas) {
      if (e.raia !== raia.id) continue;
      const tam = TAMANHOS[familiaDoTipo(e.tipo)];
      const c = correcoes?.nos[e.chave];
      const largura = c?.largura ?? tam.largura;
      const altura = c?.altura ?? tam.altura;
      const cx = xConteudo + nivel.get(e.chave)! * GRADE.coluna + GRADE.coluna / 2;
      const cy = y + linhaNaCelula.get(e.chave)! * GRADE.linha + GRADE.linha / 2;
      const no: NoLayout = {
        chave: e.chave,
        x: c?.x ?? r(cx - largura / 2),
        y: c?.y ?? r(cy - altura / 2),
        largura,
        altura,
      };
      if (c?.corFundo) no.corFundo = c.corFundo;
      if (c?.corBorda) no.corBorda = c.corBorda;
      if (familiaDoTipo(e.tipo) === 'gateway' && e.nome.trim()) {
        // Acima e à esquerda do losango: as setas saem pela direita, por baixo e por cima do centro.
        const t = medirRotulo(e.nome);
        no.caixaRotulo = { x: r(no.x + no.largura / 2 - 4 - t.largura), y: no.y - 2 - t.altura, ...t };
      }
      nos[e.chave] = no;
      // Etapa corrigida que passou do fundo da raia: a raia cresce e empurra as de baixo.
      if (no.y + no.altura > fundo) fundo = no.y + no.altura + GRADE.folga;
    }
    caixa.altura = fundo - caixa.y;
    raias.push(caixa);
    y = caixa.y + caixa.altura;
  }

  const direitaNos = Math.max(0, ...Object.values(nos).map((n) => n.x + n.largura + GRADE.respiro));
  const pool: Caixa = {
    x: GRADE.origemX,
    y: GRADE.origemY,
    largura: Math.max(larguraAuto, direitaNos - GRADE.origemX),
    altura: y - GRADE.origemY,
  };
  Object.assign(pool, correcoes?.pool ?? {});

  for (const raia of raias) {
    const c = correcoes?.raias[raia.id];
    if (c) Object.assign(raia, c);
    else raia.largura = pool.x + pool.largura - raia.x;
  }
  if (!correcoes?.pool) {
    pool.largura = Math.max(pool.largura, ...raias.map((ra) => ra.x + ra.largura - pool.x));
    pool.altura = Math.max(pool.altura, ...raias.map((ra) => ra.y + ra.altura - pool.y));
  }

  const ehGateway = new Map(etapas.map((e) => [e.chave, familiaDoTipo(e.tipo) === 'gateway']));
  const arestas: ArestaLayout[] = [];
  for (const f of fluxosDaMatriz(m)) {
    const de = nos[f.de];
    const para = nos[f.para];
    if (!de || !para || f.de === f.para) continue;
    const aresta: ArestaLayout = {
      id: f.id,
      de: f.de,
      para: f.para,
      pontos:
        correcoes?.arestas[f.id]?.pontos.map((p) => ({ ...p })) ??
        rotear(de, para, ehGateway.get(f.de) ?? false, Object.values(nos)),
    };
    if (f.rotulo) {
      aresta.rotulo = f.rotulo;
      aresta.caixaRotulo = caixaDoRotuloDaSeta(aresta.pontos, f.rotulo);
    }
    arestas.push(aresta);
  }

  return { pool, raias, nos, arestas };
}

/** O rótulo da seta fica colado ao primeiro trecho, do lado de fora da linha. */
export function caixaDoRotuloDaSeta(pontos: Ponto[], texto: string): Caixa {
  const t = medirRotulo(texto);
  const p0 = pontos[0] ?? { x: 0, y: 0 };
  const p1 = pontos[1] ?? p0;
  if (Math.abs(p0.y - p1.y) < 1) {
    const x = p1.x >= p0.x ? p0.x + 4 : p0.x - 4 - t.largura;
    return { x: r(x), y: r(p0.y - 2 - t.altura), ...t };
  }
  const y = p1.y >= p0.y ? p0.y + 2 : p0.y - 2 - t.altura;
  return { x: r(p0.x + 4), y: r(y), ...t };
}

/** Rota ortogonal entre duas caixas. Para trás (laço), passa por cima, longe dos rótulos dos eventos. */
export function rotear(s: Caixa, t: Caixa, saiDeGateway: boolean, obstaculos: Caixa[] = []): Ponto[] {
  const outros = obstaculos.filter((o) => o !== s && o !== t);
  const livre = (pontos: Ponto[]) => !outros.some((o) => rotaCruza(pontos, o));
  const sCx = r(s.x + s.largura / 2);
  const sCy = r(s.y + s.altura / 2);
  const tCx = r(t.x + t.largura / 2);
  const tCy = r(t.y + t.altura / 2);
  const sDir = s.x + s.largura;
  const tEsq = t.x;

  if (tEsq >= sDir) {
    if (Math.abs(sCy - tCy) < 1) return [{ x: sDir, y: sCy }, { x: tEsq, y: tCy }];
    if (saiDeGateway) {
      const yBorda = tCy < sCy ? s.y : s.y + s.altura;
      const rota = [{ x: sCx, y: yBorda }, { x: sCx, y: tCy }, { x: tEsq, y: tCy }];
      if (livre(rota)) return rota; // senão, sai pela direita e desce entre as colunas
    }
    const mx = r((sDir + tEsq) / 2);
    return [{ x: sDir, y: sCy }, { x: mx, y: sCy }, { x: mx, y: tCy }, { x: tEsq, y: tCy }];
  }

  const yTopo = Math.min(s.y, t.y) - GRADE.desvioVolta;
  return [
    { x: sCx, y: s.y },
    { x: sCx, y: yTopo },
    { x: tCx, y: yTopo },
    { x: tCx, y: t.y },
  ];
}

/** Algum trecho (horizontal ou vertical) da rota atravessa a caixa? */
export function rotaCruza(pontos: Ponto[], c: Caixa): boolean {
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1]!;
    const b = pontos[i]!;
    const [x1, x2] = a.x <= b.x ? [a.x, b.x] : [b.x, a.x];
    const [y1, y2] = a.y <= b.y ? [a.y, b.y] : [b.y, a.y];
    if (x1 < c.x + c.largura && x2 > c.x && y1 < c.y + c.altura && y2 > c.y) return true;
  }
  return false;
}
