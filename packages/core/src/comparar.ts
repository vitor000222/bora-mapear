import { rotulosTipo, type Etapa, type Matriz } from './matriz.ts';
import type { Idioma } from './idioma.ts';

const CAMPOS_DETALHE = ['descricao', 'ator', 'sistema', 'entrada', 'saida', 'regra'] as const;

const saidas = (e: Etapa) =>
  e.proximos
    .map((s) => `${s.para}${s.rotulo ? `:${s.rotulo}` : ''}`)
    .sort()
    .join(',');

const FRASES = {
  pt: {
    raiaNova: (nome: string) => `Raia nova: "${nome}".`,
    raiaRenomeada: (de: string, para: string) => `Raia "${de}" renomeada para "${para}".`,
    raiaRemovida: (nome: string) => `Raia removida: "${nome}".`,
    etapaNova: (r: string, tipo: string, raia: string) => `Etapa nova: ${r}, ${tipo.toLowerCase()} em "${raia}".`,
    renomeada: (chave: string, de: string, para: string) => `${chave} renomeada: "${de}" → "${para}".`,
    tipo: (r: string, de: string, para: string) => `${r} mudou de tipo: ${de} → ${para}.`,
    raia: (r: string, de: string, para: string) => `${r} mudou de raia: "${de}" → "${para}".`,
    saidas: (r: string, destino: string) => `Saídas de ${r} mudaram: agora ${destino}.`,
    nenhuma: 'nenhuma',
    detalhes: (r: string) => `Detalhes de ${r} mudaram.`,
    etapaRemovida: (r: string) => `Etapa removida: ${r}.`,
    processo: (nome: string) => `Processo renomeado para "${nome}".`,
  },
  en: {
    raiaNova: (nome: string) => `New lane: "${nome}".`,
    raiaRenomeada: (de: string, para: string) => `Lane "${de}" renamed to "${para}".`,
    raiaRemovida: (nome: string) => `Lane removed: "${nome}".`,
    etapaNova: (r: string, tipo: string, raia: string) => `New step: ${r}, ${tipo.toLowerCase()} in "${raia}".`,
    renomeada: (chave: string, de: string, para: string) => `${chave} renamed: "${de}" → "${para}".`,
    tipo: (r: string, de: string, para: string) => `${r} changed type: ${de} → ${para}.`,
    raia: (r: string, de: string, para: string) => `${r} moved lanes: "${de}" → "${para}".`,
    saidas: (r: string, destino: string) => `Outgoing flows of ${r} changed: now ${destino}.`,
    nenhuma: 'none',
    detalhes: (r: string) => `Details of ${r} changed.`,
    etapaRemovida: (r: string) => `Step removed: ${r}.`,
    processo: (nome: string) => `Process renamed to "${nome}".`,
  },
} satisfies Record<Idioma, unknown>;

export interface OpcoesComparacao {
  /** Idioma das frases. Padrão: português. */
  idioma?: Idioma;
  /** Falso para não citar mudança só nos detalhes (descrição, ator, sistema…). Padrão: verdadeiro. */
  detalhes?: boolean;
}

/**
 * O que mudou de uma matriz para outra, em frases. Serve para mostrar uma proposta
 * (do desenho, de um agente, de uma importação) antes de ela virar versão.
 */
export function compararMatrizes(antes: Matriz, depois: Matriz, opcoes: OpcoesComparacao = {}): string[] {
  const idioma = opcoes.idioma ?? 'pt';
  const t = FRASES[idioma];
  const rotulos = rotulosTipo(idioma);
  const frases: string[] = [];
  const raiasAntes = new Map(antes.raias.map((r) => [r.id, r]));
  const raiasDepois = new Map(depois.raias.map((r) => [r.id, r]));
  const nomeRaia = (id: string) => raiasDepois.get(id)?.nome ?? raiasAntes.get(id)?.nome ?? id;

  for (const r of depois.raias) {
    const a = raiasAntes.get(r.id);
    if (!a) frases.push(t.raiaNova(r.nome));
    else if (a.nome !== r.nome) frases.push(t.raiaRenomeada(a.nome, r.nome));
  }
  for (const r of antes.raias) if (!raiasDepois.has(r.id)) frases.push(t.raiaRemovida(r.nome));

  const etapasAntes = new Map(antes.etapas.map((e) => [e.chave, e]));
  const etapasDepois = new Map(depois.etapas.map((e) => [e.chave, e]));
  for (const e of depois.etapas) {
    const a = etapasAntes.get(e.chave);
    const rotulo = e.nome ? `"${e.nome}" (${e.chave})` : e.chave;
    if (!a) {
      frases.push(t.etapaNova(rotulo, rotulos[e.tipo], nomeRaia(e.raia)));
      continue;
    }
    if (a.nome !== e.nome) frases.push(t.renomeada(e.chave, a.nome, e.nome));
    if (a.tipo !== e.tipo) frases.push(t.tipo(rotulo, rotulos[a.tipo], rotulos[e.tipo]));
    if (a.raia !== e.raia) frases.push(t.raia(rotulo, nomeRaia(a.raia), nomeRaia(e.raia)));
    if (saidas(a) !== saidas(e)) {
      const destino = e.proximos.map((s) => (s.rotulo ? `${s.para} (${s.rotulo})` : s.para)).join(', ') || t.nenhuma;
      frases.push(t.saidas(rotulo, destino));
    }
    if (opcoes.detalhes !== false && CAMPOS_DETALHE.some((c) => (a[c] ?? '') !== (e[c] ?? ''))) frases.push(t.detalhes(rotulo));
  }
  for (const a of antes.etapas) if (!etapasDepois.has(a.chave)) frases.push(t.etapaRemovida(a.nome ? `"${a.nome}" (${a.chave})` : a.chave));

  if (antes.processo.nome !== depois.processo.nome) frases.push(t.processo(depois.processo.nome));
  return frases;
}
