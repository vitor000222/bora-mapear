import { z } from 'zod';

export const SOBRE = ['etapa', 'decisao', 'ator', 'sistema', 'documento', 'regra', 'espera', 'problema', 'volume', 'outro'] as const;
export type Sobre = (typeof SOBRE)[number];

export const ROTULOS_SOBRE: Record<Sobre, string> = {
  etapa: 'Etapa',
  decisao: 'Decisão',
  ator: 'Quem faz',
  sistema: 'Sistema',
  documento: 'Documento',
  regra: 'Regra',
  espera: 'Espera',
  problema: 'Problema',
  volume: 'Volume',
  outro: 'Outro',
};

/** O que o Leitor devolve por trecho. A chave (EV-001) quem dá é o código, não o modelo. */
export const EvidenciaBrutaSchema = z.object({
  citacao: z.string().min(1).describe('Trecho copiado LITERALMENTE da fonte, de uma a três frases. Não resuma nem corrija.'),
  sobre: z.enum(SOBRE).describe('Do que o trecho fala.'),
  local: z.string().optional().describe('Onde está na fonte: minuto da transcrição (00:12:40), página, seção.'),
  nota: z.string().optional().describe('Uma frase curta, só se o trecho precisar de contexto para ser entendido.'),
});
export type EvidenciaBruta = z.infer<typeof EvidenciaBrutaSchema>;

export interface Evidencia extends EvidenciaBruta {
  /** EV-001, EV-002… Nunca reaproveitada. */
  chave: string;
  /** Nome do arquivo de onde veio. */
  fonte: string;
  /** A citação foi achada, literalmente, no texto da fonte. */
  verificada: boolean;
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”«»"]/g, '"')
    .replace(/[‘’`´]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Confere que a citação está mesmo na fonte. Aceita reticências no meio
 * ("primeira parte … segunda parte"), desde que as partes apareçam em ordem.
 */
export function citacaoNaFonte(citacao: string, fonte: string): boolean {
  const alvo = normalizar(fonte);
  const partes = normalizar(citacao)
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((p) => p.replace(/^["']|["']$/g, '').trim())
    .filter((p) => p.length > 0);
  if (!partes.length) return false;
  let desde = 0;
  for (const parte of partes) {
    const i = alvo.indexOf(parte, desde);
    if (i < 0) return false;
    desde = i + parte.length;
  }
  return true;
}

export function proximaChaveEvidencia(existentes: string[]): (deslocamento: number) => string {
  const maior = Math.max(0, ...existentes.map((c) => Number(/^EV-(\d+)$/.exec(c)?.[1] ?? 0)));
  return (k) => `EV-${String(maior + 1 + k).padStart(3, '0')}`;
}

/** Como as evidências aparecem para os outros agentes. */
export function formatarEvidencias(evidencias: Evidencia[]): string {
  return evidencias
    .map(
      (e) =>
        `${e.chave} [${e.fonte}${e.local ? ` · ${e.local}` : ''}] (${e.sobre}) "${e.citacao}"${e.nota ? ` — ${e.nota}` : ''}` +
        (e.verificada ? '' : ' [citação NÃO conferida na fonte: use com cautela]'),
    )
    .join('\n');
}

/** Divide um texto longo em pedaços, cortando em parágrafo ou linha. */
export function dividirTexto(texto: string, tamanho = 20000): string[] {
  const pedacos: string[] = [];
  let resto = texto.trim();
  while (resto.length > tamanho) {
    let corte = resto.lastIndexOf('\n\n', tamanho);
    if (corte < tamanho / 2) corte = resto.lastIndexOf('\n', tamanho);
    if (corte < tamanho / 2) corte = resto.lastIndexOf('. ', tamanho) + 1;
    if (corte < tamanho / 2) corte = tamanho;
    pedacos.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) pedacos.push(resto);
  return pedacos;
}
