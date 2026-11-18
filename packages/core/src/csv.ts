import { lerMatriz, ROTULOS_TIPO, ROTULOS_TIPO_EN, rotulosTipo, TIPOS_ETAPA, type Etapa, type Matriz, type Raia, type Saida, type TipoEtapa } from './matriz.ts';
import { ErroImportacao, paraId, TEXTOS_IMPORTACAO, type OpcoesImportacao, type ResultadoImportacao } from './importar-bpmn.ts';
import type { Idioma } from './idioma.ts';

/** As colunas da matriz em planilha, na ordem em que saem. */
export const COLUNAS_CSV = [
  'chave',
  'tipo',
  'nome',
  'raia',
  'proximos',
  'descricao',
  'ator',
  'sistema',
  'entrada',
  'saida',
  'regra',
  'evidencias',
  'confianca',
  'revisar_humano',
  'subprocesso',
] as const;

type Coluna = (typeof COLUNAS_CSV)[number];

/** O cabeçalho em inglês, coluna a coluna. */
export const COLUNAS_CSV_EN: Record<Coluna, string> = {
  chave: 'key',
  tipo: 'type',
  nome: 'name',
  raia: 'lane',
  proximos: 'next',
  descricao: 'description',
  ator: 'actor',
  sistema: 'system',
  entrada: 'input',
  saida: 'output',
  regra: 'rule',
  evidencias: 'evidence',
  confianca: 'confidence',
  revisar_humano: 'human_review',
  subprocesso: 'subprocess',
};

const ALIASES: Record<string, Coluna> = {
  saidas: 'proximos',
  proximo: 'proximos',
  revisar: 'revisar_humano',
  revisao_humana: 'revisar_humano',
  evidencia: 'evidencias',
  etapa: 'nome',
  ...Object.fromEntries(Object.entries(COLUNAS_CSV_EN).map(([pt, en]) => [en, pt as Coluna])),
  step: 'nome',
  outgoing: 'proximos',
  review: 'revisar_humano',
};

const COMENTARIO_RAIAS: Record<Idioma, string> = { pt: '# raias sem etapa:', en: '# lanes without steps:' };

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function campo(valor: string, separador: string): string {
  return /["\r\n]/.test(valor) || valor.includes(separador) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export interface OpcoesCsv {
  /** Padrão: ";" em português (o do Excel brasileiro), "," em inglês. */
  separador?: ';' | ',';
  /** Idioma do cabeçalho, dos tipos e do "sim"/"yes". Padrão: português. */
  idioma?: Idioma;
}

/**
 * Matriz → CSV para abrir no Excel ou no Google Sheets. BOM para os acentos, tipos pelo nome no idioma
 * pedido. Com ";" a confiança sai com vírgula decimal, como o Excel em português espera.
 */
export function matrizParaCsv(m: Matriz, opcoes: OpcoesCsv = {}): string {
  const idioma = opcoes.idioma ?? 'pt';
  const separador = opcoes.separador ?? (idioma === 'en' ? ',' : ';');
  const rotulos = rotulosTipo(idioma);
  const raias = new Map(m.raias.map((r) => [r.id, r.nome]));
  const linhas = [COLUNAS_CSV.map((c) => (idioma === 'en' ? COLUNAS_CSV_EN[c] : c)).join(separador)];
  for (const e of m.etapas) {
    const valores: Record<Coluna, string> = {
      chave: e.chave,
      tipo: rotulos[e.tipo],
      nome: e.nome,
      raia: raias.get(e.raia) ?? e.raia,
      proximos: e.proximos.map((s) => (s.rotulo ? `${s.para}: ${s.rotulo}` : s.para)).join(', '),
      descricao: e.descricao ?? '',
      ator: e.ator ?? '',
      sistema: e.sistema ?? '',
      entrada: e.entrada ?? '',
      saida: e.saida ?? '',
      regra: e.regra ?? '',
      evidencias: (e.evidencias ?? []).join(', '),
      confianca: e.confianca === undefined ? '' : String(e.confianca).replace('.', separador === ';' ? ',' : '.'),
      revisar_humano: e.revisarHumano ? (idioma === 'en' ? 'yes' : 'sim') : '',
      subprocesso: e.subprocesso ?? '',
    };
    linhas.push(COLUNAS_CSV.map((c) => campo(valores[c], separador)).join(separador));
  }
  // Raia sem etapa não aparece nas linhas: vai num comentário no fim, para não se perder na volta.
  const usadas = new Set(m.etapas.map((e) => e.raia));
  const vazias = m.raias.filter((r) => !usadas.has(r.id));
  if (vazias.length) linhas.push(`${COMENTARIO_RAIAS[idioma]} ${vazias.map((r) => r.nome).join(', ')}`);
  return `﻿${linhas.join('\r\n')}\r\n`;
}

/** Lê CSV com aspas, aspas dobradas e quebra de linha dentro de campo. */
export function lerCsv(texto: string, separador: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let valor = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        valor += '"';
        i++;
      } else if (c === '"') aspas = false;
      else valor += c;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === separador) {
      linha.push(valor);
      valor = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(valor);
      linhas.push(linha);
      linha = [];
      valor = '';
    } else valor += c;
  }
  if (valor || linha.length) {
    linha.push(valor);
    linhas.push(linha);
  }
  return linhas;
}

function detectarSeparador(cabecalho: string): string {
  const contagem = [';', ',', '\t'].map((s) => [s, cabecalho.split(s).length] as const);
  return contagem.sort((a, b) => b[1] - a[1])[0]![0];
}

// O tipo entra pelo código ou pelo rótulo, em qualquer dos dois idiomas.
const TIPO_POR_NOME = new Map<string, TipoEtapa>([
  ...TIPOS_ETAPA.map((t) => [normal(t), t] as const),
  ...TIPOS_ETAPA.map((t) => [normal(ROTULOS_TIPO[t]), t] as const),
  ...TIPOS_ETAPA.map((t) => [normal(ROTULOS_TIPO_EN[t]), t] as const),
  ...TIPOS_ETAPA.map((t) => [normal(t.replace(/_/g, ' ')), t] as const),
]);

function lerSaidas(texto: string): Saida[] {
  return texto
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(':');
      if (i < 0) return { para: p };
      const rotulo = p.slice(i + 1).trim();
      return rotulo ? { para: p.slice(0, i).trim(), rotulo } : { para: p.slice(0, i).trim() };
    });
}

/**
 * CSV → matriz. Aceita o que o Bora Mapear exporta, em português ou em inglês, e a planilha feita à mão:
 * separador ";", "," ou tab, tipo pelo código ("tarefa_manual") ou pelo nome ("Tarefa manual",
 * "Manual task"), raia pelo nome. `opcoes.idioma` vale para os avisos, os erros e os nomes padrão.
 */
export function csvParaMatriz(csv: string, nome?: string, opcoes: OpcoesImportacao = {}): ResultadoImportacao {
  const t = TEXTOS_IMPORTACAO[opcoes.idioma ?? 'pt'];
  const nomeProcesso = nome ?? t.processoImportado;
  const texto = csv.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const separador = detectarSeparador(primeira);
  const tabela = lerCsv(texto, separador).filter((l) => l.some((v) => v.trim()) && !l[0]?.trim().startsWith('#'));
  if (tabela.length < 2) throw new ErroImportacao(t.planilhaVazia);
  const cabecalho = tabela[0]!.map((c) => {
    const n = normal(c).replace(/\s+/g, '_');
    return ALIASES[n] ?? n;
  });
  const indice = (c: string) => cabecalho.indexOf(c);
  const faltando = (['chave', 'tipo', 'nome', 'raia'] as const).filter((c) => indice(c) < 0);
  if (faltando.length) throw new ErroImportacao(t.faltamColunas(faltando.map((c) => (opcoes.idioma === 'en' ? COLUNAS_CSV_EN[c] : c)).join(', ')));

  const avisos: string[] = [];
  const raias: Raia[] = [];
  const idDaRaia = new Map<string, string>();
  const raiaDe = (nomeRaia: string) => {
    const chave = normal(nomeRaia);
    let id = idDaRaia.get(chave);
    if (!id) {
      id = paraId(nomeRaia, 'raia');
      for (let k = 2; raias.some((r) => r.id === id); k++) id = `${paraId(nomeRaia, 'raia')}-${k}`;
      idDaRaia.set(chave, id);
      raias.push({ id, nome: nomeRaia.trim() });
    }
    return id;
  };

  const etapas: Etapa[] = [];
  tabela.slice(1).forEach((linha, i) => {
    const v = (c: string) => (indice(c) >= 0 ? (linha[indice(c)] ?? '').trim() : '');
    const numero = i + 2;
    let tipo = TIPO_POR_NOME.get(normal(v('tipo')));
    if (!tipo) {
      avisos.push(t.tipoDesconhecido(numero, v('tipo')));
      tipo = 'tarefa';
    }
    const etapa: Etapa = { chave: v('chave'), tipo, nome: v('nome'), raia: raiaDe(v('raia') || t.geral), proximos: lerSaidas(v('proximos')) };
    for (const c of ['descricao', 'ator', 'sistema', 'entrada', 'saida', 'regra'] as const) if (v(c)) etapa[c] = v(c);
    if (v('evidencias')) etapa.evidencias = v('evidencias').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (v('confianca')) {
      const n = Number(v('confianca').replace(',', '.'));
      if (Number.isFinite(n) && n >= 0 && n <= 1) etapa.confianca = n;
      else avisos.push(t.confiancaIgnorada(numero, v('confianca')));
    }
    if (/^(sim|s|x|true|1|yes|y)$/i.test(v('revisar_humano'))) etapa.revisarHumano = true;
    if (v('subprocesso')) etapa.subprocesso = v('subprocesso');
    etapas.push(etapa);
  });

  const comentario = texto.split(/\r?\n/).find((l) => /^#\s*(raias sem etapa|lanes without steps):/i.test(l.trim()));
  if (comentario) for (const nomeRaia of comentario.split(':').slice(1).join(':').split(',').map((s) => s.trim()).filter(Boolean)) raiaDe(nomeRaia);

  try {
    return { matriz: lerMatriz({ versaoSchema: 1, processo: { id: paraId(nomeProcesso, 'processo'), nome: nomeProcesso }, raias, etapas }), avisos };
  } catch (erro) {
    throw new ErroImportacao(erro instanceof Error ? erro.message.replace(/etapas\.(\d+)/g, (_, n: string) => t.linha(Number(n) + 2)) : String(erro));
  }
}
