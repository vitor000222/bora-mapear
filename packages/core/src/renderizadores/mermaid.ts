import type { Etapa, Matriz, TipoEtapa } from '../matriz.ts';
import { etapasUnicas, raiasDoDesenho } from '../layout.ts';
import { fluxosDaMatriz, idDaRaia } from '../ids.ts';
import type { Idioma } from '../idioma.ts';

const RESERVADAS = new Set([
  'end', 'graph', 'flowchart', 'subgraph', 'style', 'class', 'classdef', 'click', 'linkstyle', 'direction', 'default',
]);

/** Ids que o Mermaid aceita, sem colisão: `-` vira `_`, palavra reservada ganha prefixo. */
export function idsMermaid(chaves: string[]): Map<string, string> {
  const mapa = new Map<string, string>();
  const usados = new Set<string>();
  for (const chave of chaves) {
    let id = chave.replace(/-/g, '_');
    if (RESERVADAS.has(id.toLowerCase())) id = `n_${id}`;
    let candidato = id;
    for (let i = 2; usados.has(candidato); i++) candidato = `${id}_${i}`;
    usados.add(candidato);
    mapa.set(chave, candidato);
  }
  return mapa;
}

/** Texto entre aspas do Mermaid: aspas viram entidade, quebra de linha vira espaço. */
export function textoMermaid(s: string): string {
  const limpo = s.replace(/\s*\n\s*/g, ' ').replace(/"/g, '#quot;').trim();
  return `"${limpo || ' '}"`;
}

function forma(e: Etapa, id: string): string {
  const t = textoMermaid(e.nome);
  switch (e.tipo) {
    case 'inicio':
    case 'evento_intermediario':
    case 'evento_timer':
    case 'evento_mensagem':
      return `${id}((${t}))`;
    case 'fim':
      return `${id}(((${t})))`;
    case 'subprocesso':
      return `${id}[[${t}]]`;
    case 'gateway_exclusivo':
    case 'gateway_paralelo':
    case 'gateway_inclusivo':
    case 'gateway_evento':
      return `${id}{${t}}`;
    default:
      return `${id}(${t})`;
  }
}

const CLASSE: Record<TipoEtapa, string> = {
  inicio: 'inicio',
  fim: 'fim',
  evento_intermediario: 'evento',
  evento_timer: 'evento',
  evento_mensagem: 'evento',
  tarefa: 'tarefa',
  tarefa_usuario: 'tarefa',
  tarefa_manual: 'manual',
  tarefa_servico: 'servico',
  tarefa_envio: 'tarefa',
  tarefa_recebimento: 'espera',
  tarefa_regra: 'tarefa',
  subprocesso: 'tarefa',
  gateway_exclusivo: 'gateway',
  gateway_paralelo: 'gateway',
  gateway_inclusivo: 'gateway',
  gateway_evento: 'gateway',
};

// Tinta sobre papel branco, como no BPMN: a forma diz o tipo (círculo, círculo duplo, losango, caixa).
// A classe fica no código para quem quiser repintar um tipo de uma vez.
const TRACO = 'fill:#ffffff,stroke:#1c1c1a,stroke-width:1.5px,color:#1c1c1a';
const ESTILOS: Record<string, string> = {
  inicio: TRACO,
  fim: 'fill:#ffffff,stroke:#1c1c1a,stroke-width:3px,color:#1c1c1a',
  evento: TRACO,
  tarefa: TRACO,
  manual: TRACO,
  servico: TRACO,
  espera: TRACO,
  gateway: TRACO,
};

export interface OpcoesMermaid {
  /** LR (padrão) ou TB. */
  direcao?: 'LR' | 'TB';
  /** Cor por chave (do estilo visual), escrita como "style". */
  cores?: Record<string, { corFundo?: string; corBorda?: string }>;
  /** Idioma do comentário do topo. Padrão: português. */
  idioma?: Idioma;
}

const AVISO_TOPO: Record<Idioma, string> = {
  pt: '%% Gerado a partir da matriz. Mudança de conteúdo vai na matriz.',
  en: '%% Generated from the matrix. Content changes go in the matrix.',
};

/**
 * Matriz → Mermaid flowchart. O Mermaid não tem raia: cada raia vira um subgraph.
 * Não tem posição: a correção aqui é o código editado, guardado na visão.
 */
export function renderizarMermaid(m: Matriz, opcoes: OpcoesMermaid = {}): string {
  const etapas = etapasUnicas(m);
  const ids = idsMermaid(etapas.map((e) => e.chave));
  const linhas: string[] = [];
  linhas.push(`%% Bora Mapear · ${m.processo.nome.replace(/\n/g, ' ')}`);
  linhas.push(AVISO_TOPO[opcoes.idioma ?? 'pt']);
  linhas.push(`flowchart ${opcoes.direcao ?? 'LR'}`);

  for (const raia of raiasDoDesenho(m)) {
    const daRaia = etapas.filter((e) => e.raia === raia.id);
    if (daRaia.length === 0) continue;
    linhas.push(`  subgraph ${idDaRaia(raia.id).replace(/-/g, '_')}[${textoMermaid(raia.nome)}]`);
    for (const e of daRaia) linhas.push(`    ${forma(e, ids.get(e.chave)!)}`);
    linhas.push('  end');
  }

  for (const f of fluxosDaMatriz(m)) {
    const de = ids.get(f.de);
    const para = ids.get(f.para);
    if (!de || !para) continue;
    linhas.push(f.rotulo ? `  ${de} -->|${textoMermaid(f.rotulo)}| ${para}` : `  ${de} --> ${para}`);
  }

  const porClasse = new Map<string, string[]>();
  for (const e of etapas) {
    const classe = CLASSE[e.tipo];
    porClasse.set(classe, [...(porClasse.get(classe) ?? []), ids.get(e.chave)!]);
  }
  for (const [classe, membros] of porClasse) {
    linhas.push(`  classDef ${classe} ${ESTILOS[classe]}`);
    linhas.push(`  class ${membros.join(',')} ${classe}`);
  }
  for (const [chave, cor] of Object.entries(opcoes.cores ?? {})) {
    const id = ids.get(chave);
    const partes = [cor.corFundo && `fill:${cor.corFundo}`, cor.corBorda && `stroke:${cor.corBorda}`].filter(Boolean);
    if (id && partes.length) linhas.push(`  style ${id} ${partes.join(',')}`);
  }
  return linhas.join('\n') + '\n';
}
