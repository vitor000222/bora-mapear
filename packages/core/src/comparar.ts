import { ROTULOS_TIPO, type Etapa, type Matriz } from './matriz.ts';

const CAMPOS_DETALHE = ['descricao', 'ator', 'sistema', 'entrada', 'saida', 'regra'] as const;

const saidas = (e: Etapa) =>
  e.proximos
    .map((s) => `${s.para}${s.rotulo ? `:${s.rotulo}` : ''}`)
    .sort()
    .join(',');

/**
 * O que mudou de uma matriz para outra, em frases. Serve para mostrar uma proposta
 * (do desenho, de um agente, de uma importação) antes de ela virar versão.
 */
export function compararMatrizes(antes: Matriz, depois: Matriz): string[] {
  const frases: string[] = [];
  const raiasAntes = new Map(antes.raias.map((r) => [r.id, r]));
  const raiasDepois = new Map(depois.raias.map((r) => [r.id, r]));
  const nomeRaia = (id: string) => raiasDepois.get(id)?.nome ?? raiasAntes.get(id)?.nome ?? id;

  for (const r of depois.raias) {
    const a = raiasAntes.get(r.id);
    if (!a) frases.push(`Raia nova: "${r.nome}".`);
    else if (a.nome !== r.nome) frases.push(`Raia "${a.nome}" renomeada para "${r.nome}".`);
  }
  for (const r of antes.raias) if (!raiasDepois.has(r.id)) frases.push(`Raia removida: "${r.nome}".`);

  const etapasAntes = new Map(antes.etapas.map((e) => [e.chave, e]));
  const etapasDepois = new Map(depois.etapas.map((e) => [e.chave, e]));
  for (const e of depois.etapas) {
    const a = etapasAntes.get(e.chave);
    const rotulo = e.nome ? `"${e.nome}" (${e.chave})` : e.chave;
    if (!a) {
      frases.push(`Etapa nova: ${rotulo}, ${ROTULOS_TIPO[e.tipo].toLowerCase()} em "${nomeRaia(e.raia)}".`);
      continue;
    }
    if (a.nome !== e.nome) frases.push(`${e.chave} renomeada: "${a.nome}" → "${e.nome}".`);
    if (a.tipo !== e.tipo) frases.push(`${rotulo} mudou de tipo: ${ROTULOS_TIPO[a.tipo]} → ${ROTULOS_TIPO[e.tipo]}.`);
    if (a.raia !== e.raia) frases.push(`${rotulo} mudou de raia: "${nomeRaia(a.raia)}" → "${nomeRaia(e.raia)}".`);
    if (saidas(a) !== saidas(e)) {
      const destino = e.proximos.map((s) => (s.rotulo ? `${s.para} (${s.rotulo})` : s.para)).join(', ') || 'nenhuma';
      frases.push(`Saídas de ${rotulo} mudaram: agora ${destino}.`);
    }
    if (CAMPOS_DETALHE.some((c) => (a[c] ?? '') !== (e[c] ?? ''))) frases.push(`Detalhes de ${rotulo} mudaram.`);
  }
  for (const a of antes.etapas) if (!etapasDepois.has(a.chave)) frases.push(`Etapa removida: ${a.nome ? `"${a.nome}" (${a.chave})` : a.chave}.`);

  if (antes.processo.nome !== depois.processo.nome) frases.push(`Processo renomeado para "${depois.processo.nome}".`);
  return frases;
}
