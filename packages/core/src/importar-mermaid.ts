import { lerMatriz, type Etapa, type Raia, type TipoEtapa } from './matriz.ts';
import { ErroImportacao, paraId, TEXTOS_IMPORTACAO, type OpcoesImportacao, type ResultadoImportacao } from './importar-bpmn.ts';

// Mensagens da importação em curso. importarMermaid é síncrona: troca no começo, e os auxiliares leem daqui.
let t: (typeof TEXTOS_IMPORTACAO)[keyof typeof TEXTOS_IMPORTACAO] = TEXTOS_IMPORTACAO.pt;

type Forma = 'circulo' | 'circulo-duplo' | 'losango' | 'subrotina' | 'estadio' | 'retangulo' | 'hexagono' | 'outra';

interface No {
  id: string;
  texto?: string;
  forma?: Forma;
  raia?: string;
  classe?: string;
}

// A ordem importa: formas de três caracteres antes das de dois e de um.
const FORMAS: Array<[string, string, Forma]> = [
  ['(((', ')))', 'circulo-duplo'],
  ['((', '))', 'circulo'],
  ['([', '])', 'estadio'],
  ['[[', ']]', 'subrotina'],
  ['[(', ')]', 'outra'],
  ['{{', '}}', 'hexagono'],
  ['[/', '/]', 'outra'],
  ['[\\', '\\]', 'outra'],
  ['{', '}', 'losango'],
  ['(', ')', 'retangulo'],
  ['[', ']', 'retangulo'],
  ['>', ']', 'outra'],
];

const LIGACAO = /^\s*(?:<)?(?:--\s*([^-|>][^>]*?)\s*-->|==\s*([^=|>][^>]*?)\s*==>|-\.\s*([^.|>][^>]*?)\s*\.->|-->|---|-\.->|-\.-|==>|===|--[ox]|~~~)(?:\s*\|([^|]*)\|)?\s*/;

/** Classes que o renderizador do Bora Mapear escreve: dão o tipo exato de volta. */
const CLASSES: Record<string, TipoEtapa> = {
  inicio: 'inicio',
  fim: 'fim',
  evento: 'evento_intermediario',
  tarefa: 'tarefa',
  manual: 'tarefa_manual',
  servico: 'tarefa_servico',
  espera: 'tarefa_recebimento',
  gateway: 'gateway_exclusivo',
};

function limparTexto(t: string): string {
  return t
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .replace(/^`([\s\S]*)`$/, '$1')
    .replace(/#quot;/g, '"')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lê "id", "id[texto]", "id((texto))"… no começo da linha. */
function lerNo(linha: string): { no: No; resto: string } | null {
  const m = /^\s*([A-Za-z0-9_][\w-]*)/.exec(linha);
  if (!m) return null;
  let resto = linha.slice(m[0].length);
  const no: No = { id: m[1]! };
  for (const [abre, fecha, forma] of FORMAS) {
    if (!resto.startsWith(abre)) continue;
    // Texto entre aspas pode conter o caractere de fechamento.
    const dentro = resto.slice(abre.length);
    let fim: number;
    if (dentro.trimStart().startsWith('"')) {
      const inicioAspas = dentro.indexOf('"');
      const fimAspas = dentro.indexOf('"', inicioAspas + 1);
      fim = fimAspas < 0 ? -1 : dentro.indexOf(fecha, fimAspas);
    } else {
      fim = dentro.indexOf(fecha);
    }
    if (fim < 0) throw new ErroImportacao(t.formaAberta(linha.trim()));
    no.texto = limparTexto(dentro.slice(0, fim));
    no.forma = forma;
    resto = dentro.slice(fim + fecha.length);
    break;
  }
  const classe = /^:::([\w-]+)/.exec(resto);
  if (classe) {
    no.classe = classe[1]!;
    resto = resto.slice(classe[0].length);
  }
  return { no, resto };
}

/** Lê "A & B" no começo da linha. */
function lerGrupo(linha: string): { nos: No[]; resto: string } | null {
  const primeiro = lerNo(linha);
  if (!primeiro) return null;
  const nos = [primeiro.no];
  let resto = primeiro.resto;
  for (let m = /^\s*&\s*/.exec(resto); m; m = /^\s*&\s*/.exec(resto)) {
    const outro = lerNo(resto.slice(m[0].length));
    if (!outro) break;
    nos.push(outro.no);
    resto = outro.resto;
  }
  return { nos, resto };
}

/**
 * Mermaid flowchart → matriz. Cobre o que o Bora Mapear escreve e o Mermaid escrito à mão mais comum:
 * formas, rótulos nas setas, cadeias (A --> B --> C), "&", subgraphs (que viram raias) e classes.
 * O que não couber, o Conversor (agente) resolve.
 */
export function importarMermaid(codigo: string, nome?: string, opcoes: OpcoesImportacao = {}): ResultadoImportacao {
  t = TEXTOS_IMPORTACAO[opcoes.idioma ?? 'pt'];
  const nomeProcesso = nome ?? t.processoImportado;
  const avisos: string[] = [];
  const linhas = codigo.replace(/\r/g, '').split('\n');
  const nos = new Map<string, No>();
  const ordem: string[] = [];
  const setas: Array<{ de: string; para: string; rotulo?: string }> = [];
  const raias: Raia[] = [];
  const pilha: string[] = [];
  let cabecalho = false;

  const registrar = (n: No) => {
    const atual = nos.get(n.id);
    if (!atual) {
      nos.set(n.id, { ...n, ...(pilha.length ? { raia: pilha.at(-1)! } : {}) });
      ordem.push(n.id);
      return;
    }
    if (n.texto !== undefined) atual.texto = n.texto;
    if (n.forma) atual.forma = n.forma;
    if (n.classe) atual.classe = n.classe;
    if (!atual.raia && pilha.length) atual.raia = pilha.at(-1)!;
  };

  for (const [i, bruta] of linhas.entries()) {
    const linha = bruta.replace(/%%.*$/, '').trim().replace(/;$/, '');
    if (!linha) continue;
    if (!cabecalho) {
      if (!/^(flowchart|graph)\b/i.test(linha)) throw new ErroImportacao(t.naoEFluxograma);
      cabecalho = true;
      continue;
    }
    if (/^(classDef|style|linkStyle|click|direction)\b/.test(linha)) continue;
    const classe = /^class\s+([\w,\s-]+?)\s+([\w-]+)$/.exec(linha);
    if (classe) {
      for (const id of classe[1]!.split(',').map((s) => s.trim())) {
        const n = nos.get(id);
        if (n) n.classe = classe[2]!;
      }
      continue;
    }
    const sub = /^subgraph\s+(.+)$/.exec(linha);
    if (sub) {
      const def = sub[1]!.trim();
      const comTexto = /^([\w-]+)\s*\[(.+)\]$/.exec(def);
      const nome = limparTexto(comTexto ? comTexto[2]! : def);
      let id = paraId((comTexto ? comTexto[1]! : nome).replace(/^Raia_/, ''), 'raia');
      for (let k = 2; raias.some((r) => r.id === id); k++) id = `${id}-${k}`;
      raias.push({ id, nome });
      pilha.push(id);
      continue;
    }
    if (/^end$/.test(linha)) {
      pilha.pop();
      continue;
    }
    // Cadeia: grupo (ligação grupo)*
    let resto = linha;
    const g = lerGrupo(resto);
    if (!g) {
      avisos.push(`Linha ${i + 1} ignorada: ${linha}`);
      continue;
    }
    g.nos.forEach(registrar);
    let anteriores = g.nos.map((n) => n.id);
    resto = g.resto;
    while (resto.trim()) {
      const lig = LIGACAO.exec(resto);
      if (!lig) {
        avisos.push(t.trechoNaoEntendido(i + 1, resto.trim()));
        break;
      }
      const rotulo = limparTexto(lig[4] ?? lig[1] ?? lig[2] ?? lig[3] ?? '');
      resto = resto.slice(lig[0].length);
      const proximo = lerGrupo(resto);
      if (!proximo) throw new ErroImportacao(t.setaSemDestino(i + 1));
      proximo.nos.forEach(registrar);
      for (const de of anteriores) for (const n of proximo.nos) setas.push({ de, para: n.id, ...(rotulo ? { rotulo } : {}) });
      anteriores = proximo.nos.map((n) => n.id);
      resto = proximo.resto;
    }
  }
  if (!cabecalho) throw new ErroImportacao(t.codigoVazio);
  if (!nos.size) throw new ErroImportacao(t.semNos);

  const entradas = new Map<string, number>();
  const saidas = new Map<string, number>();
  for (const s of setas) {
    entradas.set(s.para, (entradas.get(s.para) ?? 0) + 1);
    saidas.set(s.de, (saidas.get(s.de) ?? 0) + 1);
  }

  const tipoDe = (n: No): TipoEtapa => {
    if (n.classe && CLASSES[n.classe]) {
      const t = CLASSES[n.classe]!;
      if (t === 'gateway_exclusivo' && (!n.texto || n.texto === '+')) return 'gateway_paralelo';
      return t;
    }
    const semEntrada = !entradas.get(n.id);
    const semSaida = !saidas.get(n.id);
    switch (n.forma) {
      case 'circulo-duplo':
        return 'fim';
      case 'circulo':
      case 'estadio':
        return semEntrada ? 'inicio' : semSaida ? 'fim' : n.forma === 'circulo' ? 'evento_intermediario' : 'tarefa';
      case 'losango':
        return !n.texto || n.texto === '+' || /paralel/i.test(n.texto) ? 'gateway_paralelo' : 'gateway_exclusivo';
      case 'subrotina':
        return 'subprocesso';
      default:
        return 'tarefa';
    }
  };

  const usadas = new Set<string>();
  const chaveDe = new Map<string, string>();
  for (const id of ordem) {
    let chave = /^[A-Za-z]/.test(id) ? id : `E_${id}`;
    for (let k = 2; usadas.has(chave); k++) chave = `${chave}_${k}`;
    usadas.add(chave);
    chaveDe.set(id, chave);
  }

  // Nó fora de subgraph (comum quando a etapa é criada direto numa linha de seta) vai para a raia
  // de quem vem antes ou depois dele. Sem vizinho com raia, vai para "Geral".
  if (raias.length) {
    for (let mudou = true; mudou; ) {
      mudou = false;
      for (const id of ordem) {
        const n = nos.get(id)!;
        if (n.raia) continue;
        const vizinho =
          setas.filter((s) => s.para === id).map((s) => nos.get(s.de)?.raia).find(Boolean) ??
          setas.filter((s) => s.de === id).map((s) => nos.get(s.para)?.raia).find(Boolean);
        if (vizinho) {
          n.raia = vizinho;
          mudou = true;
          avisos.push(t.foraDeSubgraph(n.texto ?? id, raias.find((r) => r.id === vizinho)?.nome ?? vizinho));
        }
      }
    }
  }
  const semRaia = ordem.some((id) => !nos.get(id)!.raia);
  if (semRaia) raias.push({ id: raias.some((r) => r.id === 'geral') ? 'geral-2' : 'geral', nome: t.geral });
  const raiaGeral = raias.at(-1)!.id;
  if (semRaia && raias.length > 1) avisos.push(t.paraGeral(t.geral));

  const etapas: Etapa[] = ordem.map((id) => {
    const n = nos.get(id)!;
    const tipo = tipoDe(n);
    return {
      chave: chaveDe.get(id)!,
      tipo,
      nome: n.texto ?? (tipo.startsWith('gateway_') ? '' : id),
      raia: n.raia ?? raiaGeral,
      proximos: setas.filter((s) => s.de === id).map((s) => ({ para: chaveDe.get(s.para)!, ...(s.rotulo ? { rotulo: s.rotulo } : {}) })),
    };
  });

  try {
    return { matriz: lerMatriz({ versaoSchema: 1, processo: { id: paraId(nomeProcesso, 'processo'), nome: nomeProcesso }, raias, etapas }), avisos };
  } catch (erro) {
    throw new ErroImportacao(erro instanceof Error ? erro.message : String(erro));
  }
}

/** Decide pelo conteúdo: XML é BPMN; "flowchart"/"graph" é Mermaid; cabeçalho com chave e tipo é CSV. */
export function detectarFormato(conteudo: string): 'bpmn' | 'mermaid' | 'csv' | null {
  const t = conteudo.replace(/^﻿/, '').trimStart();
  if (t.startsWith('<')) return 'bpmn';
  if (/^(?:%%.*\n\s*)*(flowchart|graph)\b/i.test(t)) return 'mermaid';
  const colunas = (t.split(/\r?\n/)[0] ?? '')
    .toLowerCase()
    .split(/[;,\t]/)
    .map((c) => c.trim().replace(/^"|"$/g, ''));
  if ((colunas.includes('chave') && colunas.includes('tipo')) || (colunas.includes('key') && colunas.includes('type'))) return 'csv';
  return null;
}
