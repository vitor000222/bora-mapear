// Exportar o desenho: SVG como está, PNG pelo canvas (fundo branco, 2x para ficar nítido)
// e PDF vetorial (jsPDF + svg2pdf), do tamanho exato do desenho.

import { textos } from './i18n/index.tsx';

export type FormatoImagem = 'svg' | 'png' | 'pdf';

/** Largura e altura do SVG, pelo viewBox ou pelos atributos. */
export function medidasDoSvg(svg: string): { largura: number; altura: number } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const raiz = doc.documentElement;
  const caixa = raiz.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  if (caixa && caixa.length === 4 && caixa[2]! > 0 && caixa[3]! > 0) return { largura: caixa[2]!, altura: caixa[3]! };
  const num = (v: string | null) => Number.parseFloat(v ?? '') || 0;
  return { largura: num(raiz.getAttribute('width')) || 800, altura: num(raiz.getAttribute('height')) || 600 };
}

/** Garante largura e altura explícitas: sem elas o navegador desenha a imagem com 0 px. */
function comMedidas(svg: string): { svg: string; largura: number; altura: number } {
  const { largura, altura } = medidasDoSvg(svg);
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const raiz = doc.documentElement;
  raiz.setAttribute('width', String(largura));
  raiz.setAttribute('height', String(altura));
  if (!raiz.getAttribute('xmlns')) raiz.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return { svg: new XMLSerializer().serializeToString(doc), largura, altura };
}

export async function svgParaPng(svg: string, escala = 2): Promise<Blob> {
  const { svg: pronto, largura, altura } = comMedidas(svg);
  // Data URL, não blob: o Chrome "suja" o canvas com SVG de foreignObject vindo de blob: e bloqueia o toBlob.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pronto)}`;
  {
    const imagem = new Image();
    imagem.decoding = 'sync';
    await new Promise<void>((ok, falha) => {
      imagem.onload = () => ok();
      imagem.onerror = () => falha(new Error(textos().comum.exportar.svgFalhou));
      imagem.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(largura * escala);
    canvas.height = Math.ceil(altura * escala);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error(textos().comum.exportar.pngFalhou))), 'image/png'));
  }
}

export async function svgParaPdf(svg: string): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { svg: pronto, largura, altura } = comMedidas(svg);
  const elemento = new DOMParser().parseFromString(pronto, 'image/svg+xml').documentElement;
  // O svg2pdf mede o texto com o DOM: o SVG precisa estar no documento enquanto converte.
  const hospedeiro = document.createElement('div');
  hospedeiro.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden';
  hospedeiro.appendChild(elemento);
  document.body.appendChild(hospedeiro);
  try {
    const pdf = new jsPDF({ orientation: largura >= altura ? 'landscape' : 'portrait', unit: 'pt', format: [largura, altura] });
    await pdf.svg(elemento, { x: 0, y: 0, width: largura, height: altura });
    return pdf.output('blob');
  } finally {
    hospedeiro.remove();
  }
}

export function baixarBlob(nomeArquivo: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exporta um SVG no formato pedido e baixa o arquivo. */
export async function exportarSvg(svg: string, formato: FormatoImagem, nomeBase: string): Promise<void> {
  if (formato === 'svg') baixarBlob(`${nomeBase}.svg`, new Blob([comMedidas(svg).svg], { type: 'image/svg+xml' }));
  else if (formato === 'png') baixarBlob(`${nomeBase}.png`, await svgParaPng(svg));
  else baixarBlob(`${nomeBase}.pdf`, await svgParaPdf(svg));
}
