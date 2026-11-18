import { extname } from 'node:path';
import type { Idioma } from '@bora-mapear/core';

export const FORMATOS_ACEITOS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.vtt', '.srt'] as const;
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

export class ErroFonte extends Error {}

/** Tira o tempo e o número das legendas e junta as falas seguidas de quem fala. "[00:01:23] Fulano: texto". */
export function limparLegenda(bruto: string): string {
  const linhas = bruto.replace(/\r/g, '').split('\n');
  const falas: Array<{ tempo: string; quem: string; texto: string }> = [];
  let tempo = '';
  for (const linha of linhas) {
    const t = linha.trim();
    if (!t || t === 'WEBVTT' || /^\d+$/.test(t) || /^(NOTE|STYLE|REGION)\b/.test(t)) continue;
    const marca = /^(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->/.exec(t);
    if (marca) {
      tempo = t.split('-->')[0]!.trim().replace(/[.,]\d{3}$/, '');
      if (tempo.length === 5) tempo = `00:${tempo}`;
      continue;
    }
    const voz = /^<v(?:\.[^ >]+)?\s+([^>]+)>(.*)$/.exec(t);
    let quem = voz ? voz[1]!.trim() : '';
    let texto = (voz ? voz[2]! : t).replace(/<[^>]+>/g, '').trim();
    const prefixo = !quem ? /^([A-ZÀ-Ý][\wÀ-ÿ .'-]{1,40}):\s+(.+)$/.exec(texto) : null;
    if (prefixo) {
      quem = prefixo[1]!.trim();
      texto = prefixo[2]!.trim();
    }
    if (!texto) continue;
    const ultima = falas.at(-1);
    if (ultima && ultima.quem === quem && (quem || ultima.tempo === tempo)) ultima.texto += ` ${texto}`;
    else falas.push({ tempo, quem, texto });
  }
  return falas.map((f) => `${f.tempo ? `[${f.tempo}] ` : ''}${f.quem ? `${f.quem}: ` : ''}${f.texto}`).join('\n');
}

/** Texto de um arquivo enviado. PDF por página, DOCX sem formatação, legenda limpa. */
const TEXTOS = {
  pt: {
    grande: (nome: string) => `"${nome}" passa de 20 MB.`,
    formato: (nome: string, aceitos: string) => `Formato não suportado: "${nome}". Use ${aceitos}.`,
    semTexto: (nome: string) => `Não achei texto em "${nome}". Se for PDF escaneado (imagem), ele precisa de OCR antes.`,
    ilegivel: (nome: string, motivo: string) => `"${nome}": não deu para ler (${motivo}).`,
  },
  en: {
    grande: (nome: string) => `"${nome}" is larger than 20 MB.`,
    formato: (nome: string, aceitos: string) => `Unsupported format: "${nome}". Use ${aceitos}.`,
    semTexto: (nome: string) => `No text found in "${nome}". A scanned PDF (image) needs OCR first.`,
    ilegivel: (nome: string, motivo: string) => `"${nome}": could not be read (${motivo}).`,
  },
} satisfies Record<Idioma, unknown>;

/** Mensagens do leitor de arquivos, para quem chama montar a lista de recusados. */
export const textosFonte = (idioma: Idioma) => TEXTOS[idioma];

export async function extrairTexto(nome: string, bytes: Uint8Array, idioma: Idioma = 'pt'): Promise<{ tipo: string; texto: string }> {
  const t = TEXTOS[idioma];
  if (bytes.byteLength > TAMANHO_MAXIMO) throw new ErroFonte(t.grande(nome));
  const ext = extname(nome).toLowerCase();
  const utf8 = () => new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  let texto: string;
  switch (ext) {
    case '.txt':
    case '.md':
    case '.csv':
      texto = utf8();
      break;
    case '.vtt':
    case '.srt':
      texto = limparLegenda(utf8());
      break;
    case '.docx': {
      const mammoth = await import('mammoth');
      const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      texto = r.value;
      break;
    }
    case '.pdf': {
      const { extractText } = await import('unpdf');
      const r = await extractText(new Uint8Array(bytes), { mergePages: false });
      texto = r.text.map((pagina, i) => `[Página ${i + 1}]\n${pagina.trim()}`).join('\n\n');
      break;
    }
    default:
      throw new ErroFonte(t.formato(nome, FORMATOS_ACEITOS.join(', ')));
  }
  texto = texto.replace(/\n{3,}/g, '\n\n').trim();
  if (!texto) throw new ErroFonte(t.semTexto(nome));
  return { tipo: ext.slice(1), texto };
}
