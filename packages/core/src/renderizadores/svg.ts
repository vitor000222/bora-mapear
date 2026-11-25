import { familiaDoTipo, type Matriz, type TipoEtapa } from '../matriz.ts';
import { calcularLayout, etapasUnicas, type Caixa, type NoLayout } from '../layout.ts';
import type { Correcoes } from '../correcoes.ts';
import { escaparXml } from './bpmn.ts';

// As cores da marca: tinta nas etapas e setas, linha forte nas raias.
const TINTA = '#1c1c1a';
const LINHA = '#c3c3ba';
const TEXTO = TINTA;
const FONTE = "'IBM Plex Sans', Arial, Helvetica, sans-serif";

/** Quebra o texto em linhas de até `max` caracteres, sem cortar palavra. */
export function quebrarTexto(texto: string, max: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    if (atual && (atual + ' ' + palavra).length > max) {
      linhas.push(atual);
      atual = palavra;
    } else atual = atual ? `${atual} ${palavra}` : palavra;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function texto(linhas: string[], cx: number, topo: number, tamanho = 12, ancora: 'middle' | 'end' = 'middle'): string {
  return linhas
    .map(
      (l, i) =>
        `<text x="${cx}" y="${Math.round(topo + tamanho + i * (tamanho + 2))}" font-family="${FONTE}" font-size="${tamanho}" fill="${TEXTO}" text-anchor="${ancora}">${escaparXml(l)}</text>`,
    )
    .join('');
}

function textoCentrado(conteudo: string, c: Caixa, max: number): string {
  const linhas = quebrarTexto(conteudo, max).slice(0, 5);
  const altura = linhas.length * 14;
  return texto(linhas, Math.round(c.x + c.largura / 2), c.y + (c.altura - altura) / 2 - 2);
}

const MARCA_GATEWAY: Partial<Record<TipoEtapa, string>> = {
  gateway_exclusivo: 'M -9 -9 L 9 9 M 9 -9 L -9 9',
  gateway_paralelo: 'M 0 -12 L 0 12 M -12 0 L 12 0',
};

function no(n: NoLayout, nome: string, tipo: TipoEtapa): string {
  const fundo = n.corFundo ?? '#ffffff';
  const borda = n.corBorda ?? TINTA;
  const cx = Math.round(n.x + n.largura / 2);
  const cy = Math.round(n.y + n.altura / 2);
  const familia = familiaDoTipo(tipo);
  if (familia === 'evento') {
    const r = Math.round(n.largura / 2);
    const largura = tipo === 'fim' ? 4 : 1.5;
    const duplo = tipo.startsWith('evento_') ? `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="${borda}" stroke-width="1.5"/>` : '';
    const rotulo = nome ? texto(quebrarTexto(nome, 18).slice(0, 3), cx, n.y + n.altura + 2, 11) : '';
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fundo}" stroke="${borda}" stroke-width="${largura}"/>${duplo}${rotulo}`;
  }
  if (familia === 'gateway') {
    const p = `${cx},${n.y} ${n.x + n.largura},${cy} ${cx},${n.y + n.altura} ${n.x},${cy}`;
    const marca = MARCA_GATEWAY[tipo];
    const simbolo = marca
      ? `<path d="${marca}" transform="translate(${cx} ${cy})" stroke="${borda}" stroke-width="3" fill="none"/>`
      : `<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="${borda}" stroke-width="2.5"/>`;
    const rotulo = n.caixaRotulo ? texto(quebrarTexto(nome, 16).slice(0, 3), n.caixaRotulo.x + n.caixaRotulo.largura, n.caixaRotulo.y - 2, 11, 'end') : '';
    return `<polygon points="${p}" fill="${fundo}" stroke="${borda}" stroke-width="1.5"/>${simbolo}${rotulo}`;
  }
  const sub =
    familia === 'subprocesso'
      ? `<rect x="${cx - 7}" y="${n.y + n.altura - 16}" width="14" height="14" fill="none" stroke="${borda}" stroke-width="1.5"/><path d="M ${cx - 4} ${n.y + n.altura - 9} H ${cx + 4} M ${cx} ${n.y + n.altura - 13} V ${n.y + n.altura - 5}" stroke="${borda}" stroke-width="1.5"/>`
      : '';
  return `<rect x="${n.x}" y="${n.y}" width="${n.largura}" height="${n.altura}" rx="8" fill="${fundo}" stroke="${borda}" stroke-width="1.5"/>${textoCentrado(nome, n, 16)}${sub}`;
}

export interface OpcoesSvg {
  correcoes?: Correcoes;
}

/**
 * Matriz → SVG puro (sem HTML dentro), no mesmo layout do BPMN e do React Flow.
 * É o que vira PNG e PDF quando a visão não tem um SVG próprio limpo.
 */
export function renderizarSvg(m: Matriz, opcoes: OpcoesSvg = {}): string {
  const layout = calcularLayout(m, opcoes.correcoes);
  const margem = 20;
  const x0 = layout.pool.x - margem;
  const y0 = layout.pool.y - margem;
  let largura = layout.pool.largura + margem * 2;
  let altura = layout.pool.altura + margem * 2;
  for (const n of Object.values(layout.nos)) {
    largura = Math.max(largura, n.x + n.largura + margem + 60 - x0);
    altura = Math.max(altura, n.y + n.altura + margem + 40 - y0);
  }
  const p = layout.pool;
  const partes: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${largura} ${altura}" width="${largura}" height="${altura}">`,
    `<defs><marker id="seta" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${TINTA}"/></marker></defs>`,
    `<rect x="${x0}" y="${y0}" width="${largura}" height="${altura}" fill="#ffffff"/>`,
    `<rect x="${p.x}" y="${p.y}" width="${p.largura}" height="${p.altura}" fill="#ffffff" stroke="${LINHA}" stroke-width="1"/>`,
    `<line x1="${p.x + 30}" y1="${p.y}" x2="${p.x + 30}" y2="${p.y + p.altura}" stroke="${LINHA}" stroke-width="1"/>`,
    `<text transform="translate(${p.x + 19} ${p.y + p.altura / 2}) rotate(-90)" font-family="${FONTE}" font-size="12" font-weight="bold" fill="${TEXTO}" text-anchor="middle">${escaparXml(m.processo.nome)}</text>`,
  ];
  for (const r of layout.raias) {
    partes.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.largura}" height="${r.altura}" fill="none" stroke="${LINHA}" stroke-width="1"/>`,
      `<line x1="${r.x + 30}" y1="${r.y}" x2="${r.x + 30}" y2="${r.y + r.altura}" stroke="${LINHA}" stroke-width="1"/>`,
      `<text transform="translate(${r.x + 19} ${r.y + r.altura / 2}) rotate(-90)" font-family="${FONTE}" font-size="12" fill="${TEXTO}" text-anchor="middle">${escaparXml(r.nome)}</text>`,
    );
  }
  for (const a of layout.arestas) {
    partes.push(`<polyline points="${a.pontos.map((pt) => `${pt.x},${pt.y}`).join(' ')}" fill="none" stroke="${TINTA}" stroke-width="1.3" marker-end="url(#seta)"/>`);
    if (a.rotulo && a.caixaRotulo) partes.push(texto([a.rotulo], a.caixaRotulo.x, a.caixaRotulo.y - 2, 11, 'middle').replace(`x="${a.caixaRotulo.x}"`, `x="${Math.round(a.caixaRotulo.x + a.caixaRotulo.largura / 2)}"`));
  }
  for (const e of etapasUnicas(m)) {
    const n = layout.nos[e.chave];
    if (n) partes.push(no(n, e.nome, e.tipo));
  }
  partes.push('</svg>');
  return partes.join('\n');
}
