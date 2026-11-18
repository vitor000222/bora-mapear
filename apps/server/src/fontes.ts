import { extname } from 'node:path';

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
export async function extrairTexto(nome: string, bytes: Uint8Array): Promise<{ tipo: string; texto: string }> {
  if (bytes.byteLength > TAMANHO_MAXIMO) throw new ErroFonte(`"${nome}" passa de 20 MB.`);
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
      throw new ErroFonte(`Formato não suportado: "${nome}". Use ${FORMATOS_ACEITOS.join(', ')}.`);
  }
  texto = texto.replace(/\n{3,}/g, '\n\n').trim();
  if (!texto) throw new ErroFonte(`Não achei texto em "${nome}". Se for PDF escaneado (imagem), ele precisa de OCR antes.`);
  return { tipo: ext.slice(1), texto };
}
