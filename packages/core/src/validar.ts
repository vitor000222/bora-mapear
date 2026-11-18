import { familiaDoTipo, type Etapa, type Matriz } from './matriz.ts';
import type { Idioma } from './idioma.ts';

export type Severidade = 'erro' | 'aviso';

export type CodigoProblema =
  | 'CHAVE_REPETIDA'
  | 'RAIA_REPETIDA'
  | 'RAIA_INEXISTENTE'
  | 'DESTINO_INEXISTENTE'
  | 'AUTO_LIGACAO'
  | 'SEM_INICIO'
  | 'SEM_FIM'
  | 'INICIO_COM_ENTRADA'
  | 'FIM_COM_SAIDA'
  | 'BECO_SEM_SAIDA'
  | 'SAIDA_SEM_ROTULO'
  | 'NOME_VAZIO'
  | 'INALCANCAVEL'
  | 'SAIDA_REPETIDA'
  | 'SAIDA_MULTIPLA_SEM_GATEWAY'
  | 'GATEWAY_INUTIL'
  | 'RAIA_VAZIA'
  | 'SUBPROCESSO_EM_ETAPA_COMUM';

export interface Problema {
  codigo: CodigoProblema;
  severidade: Severidade;
  /** Escrita para o agente Mapeador corrigir sozinho. */
  mensagem: string;
  chave?: string;
}

export interface ResultadoValidacao {
  /** Falso se houver qualquer erro. Avisos não reprovam. */
  ok: boolean;
  problemas: Problema[];
}

export interface OpcoesValidacao {
  /** Idioma das mensagens. Padrão: português. */
  idioma?: Idioma;
}

// `r` é o rótulo da etapa: `"Nome" (E01)` ou só a chave.
const MENSAGENS = {
  pt: {
    raiaRepetida: (id: string) => `A raia "${id}" aparece duas vezes. Dê um id único a cada raia.`,
    chaveRepetida: (chave: string) => `A chave "${chave}" aparece em mais de uma linha. Toda linha precisa de chave própria.`,
    raiaInexistente: (r: string, raia: string, raias: string) => `${r} está na raia "${raia}", que não existe. Use uma destas: ${raias}.`,
    nomeVazio: (chave: string, tipo: string, gateway: boolean) =>
      `A linha ${chave} (${tipo}) está sem nome. ${gateway ? 'Escreva a pergunta da decisão.' : 'Escreva verbo no infinitivo + objeto.'}`,
    autoLigacao: (r: string) => `${r} aponta para ela mesma. Para repetir, passe por um gateway ou por uma etapa de espera.`,
    destinoInexistente: (r: string, para: string) => `${r} aponta para "${para}", que não existe na matriz.`,
    saidaRepetida: (r: string, para: string) => `${r} tem duas saídas para "${para}".`,
    inicioComEntrada: (r: string) => `${r} é um início, mas recebe seta. Aponte essas setas para a etapa seguinte ao início.`,
    fimComSaida: (r: string) => `${r} é um fim, mas tem saída. Tire as saídas ou mude o tipo.`,
    becoSemSaida: (r: string) => `${r} não tem saída. Ligue a uma etapa seguinte ou a um fim.`,
    saidaSemRotulo: (r: string, para: string) => `A decisão ${r} tem saída sem rótulo para: ${para}. Cada saída leva a resposta (ex.: "Sim", "Não").`,
    gatewayInutil: (r: string) => `O gateway ${r} tem uma entrada e uma saída: não decide nem junta nada.`,
    subprocessoEmEtapaComum: (r: string) => `${r} aponta para um mapeamento filho, mas não é do tipo subprocesso. Mude o tipo ou tire o vínculo.`,
    saidaMultipla: (r: string, n: number) =>
      `${r} tem ${n} saídas sem gateway. Se for decisão, use um gateway exclusivo; se for em paralelo, um gateway paralelo.`,
    semInicio: () => 'A matriz não tem nenhuma linha do tipo "inicio".',
    semFim: () => 'A matriz não tem nenhuma linha do tipo "fim".',
    inalcancavel: (r: string) => `Nenhum caminho sai de um início e chega em ${r}. Ligue-a ao fluxo ou crie um início para ela.`,
    raiaVazia: (nome: string, id: string) => `A raia "${nome}" (${id}) não tem nenhuma etapa.`,
    aprovadaSemAvisos: 'Matriz aprovada no portão, sem avisos.',
    aprovadaComAvisos: 'Matriz aprovada no portão, com avisos:',
    reprovada: 'Matriz reprovada no portão:',
  },
  en: {
    raiaRepetida: (id: string) => `Lane "${id}" appears twice. Give each lane a unique id.`,
    chaveRepetida: (chave: string) => `Key "${chave}" appears in more than one row. Every row needs its own key.`,
    raiaInexistente: (r: string, raia: string, raias: string) => `${r} is in lane "${raia}", which does not exist. Use one of these: ${raias}.`,
    nomeVazio: (chave: string, tipo: string, gateway: boolean) =>
      `Row ${chave} (${tipo}) has no name. ${gateway ? 'Write the decision as a question.' : 'Write a verb + object.'}`,
    autoLigacao: (r: string) => `${r} points to itself. To repeat, go through a gateway or a wait step.`,
    destinoInexistente: (r: string, para: string) => `${r} points to "${para}", which is not in the matrix.`,
    saidaRepetida: (r: string, para: string) => `${r} has two outgoing flows to "${para}".`,
    inicioComEntrada: (r: string) => `${r} is a start, but has incoming flows. Point those flows to the step after the start.`,
    fimComSaida: (r: string) => `${r} is an end, but has outgoing flows. Remove them or change the type.`,
    becoSemSaida: (r: string) => `${r} has no outgoing flow. Connect it to a next step or to an end.`,
    saidaSemRotulo: (r: string, para: string) => `Decision ${r} has unlabeled outgoing flows to: ${para}. Each one carries the answer (e.g. "Yes", "No").`,
    gatewayInutil: (r: string) => `Gateway ${r} has one incoming and one outgoing flow: it neither decides nor joins anything.`,
    subprocessoEmEtapaComum: (r: string) => `${r} points to a child map, but is not a subprocess. Change the type or remove the link.`,
    saidaMultipla: (r: string, n: number) =>
      `${r} has ${n} outgoing flows without a gateway. For a decision, use an exclusive gateway; for parallel work, a parallel gateway.`,
    semInicio: () => 'The matrix has no row of type "inicio" (start).',
    semFim: () => 'The matrix has no row of type "fim" (end).',
    inalcancavel: (r: string) => `No path from a start reaches ${r}. Connect it to the flow or give it its own start.`,
    raiaVazia: (nome: string, id: string) => `Lane "${nome}" (${id}) has no steps.`,
    aprovadaSemAvisos: 'Matrix passed the gate, no warnings.',
    aprovadaComAvisos: 'Matrix passed the gate, with warnings:',
    reprovada: 'Matrix failed the gate:',
  },
} satisfies Record<Idioma, unknown>;

/**
 * O portão. Determinístico: a mesma matriz dá sempre o mesmo resultado.
 * Reprovou, as mensagens voltam ao Mapeador.
 */
export function validarMatriz(m: Matriz, opcoes: OpcoesValidacao = {}): ResultadoValidacao {
  const t = MENSAGENS[opcoes.idioma ?? 'pt'];
  const problemas: Problema[] = [];
  const erro = (codigo: CodigoProblema, mensagem: string, chave?: string) =>
    problemas.push(chave ? { codigo, severidade: 'erro', mensagem, chave } : { codigo, severidade: 'erro', mensagem });
  const aviso = (codigo: CodigoProblema, mensagem: string, chave?: string) =>
    problemas.push(chave ? { codigo, severidade: 'aviso', mensagem, chave } : { codigo, severidade: 'aviso', mensagem });

  const raias = new Set<string>();
  for (const raia of m.raias) {
    if (raias.has(raia.id)) erro('RAIA_REPETIDA', t.raiaRepetida(raia.id));
    raias.add(raia.id);
  }

  const porChave = new Map<string, Etapa>();
  for (const etapa of m.etapas) {
    if (porChave.has(etapa.chave)) {
      erro('CHAVE_REPETIDA', t.chaveRepetida(etapa.chave), etapa.chave);
    } else {
      porChave.set(etapa.chave, etapa);
    }
  }

  const entradas = new Map<string, number>();
  for (const etapa of m.etapas) {
    for (const saida of etapa.proximos) {
      entradas.set(saida.para, (entradas.get(saida.para) ?? 0) + 1);
    }
  }

  const rotulo = (e: Etapa) => (e.nome ? `"${e.nome}" (${e.chave})` : e.chave);

  for (const etapa of m.etapas) {
    const familia = familiaDoTipo(etapa.tipo);
    const nEntradas = entradas.get(etapa.chave) ?? 0;
    const nSaidas = etapa.proximos.length;
    const r = rotulo(etapa);

    if (!raias.has(etapa.raia)) erro('RAIA_INEXISTENTE', t.raiaInexistente(r, etapa.raia, [...raias].join(', ')), etapa.chave);

    const exigeNome = familia === 'tarefa' || familia === 'subprocesso' || etapa.tipo === 'gateway_exclusivo' || etapa.tipo === 'gateway_inclusivo';
    if (exigeNome && !etapa.nome.trim()) erro('NOME_VAZIO', t.nomeVazio(etapa.chave, etapa.tipo, familia === 'gateway'), etapa.chave);

    const destinos = new Set<string>();
    for (const saida of etapa.proximos) {
      if (saida.para === etapa.chave) erro('AUTO_LIGACAO', t.autoLigacao(r), etapa.chave);
      else if (!porChave.has(saida.para)) erro('DESTINO_INEXISTENTE', t.destinoInexistente(r, saida.para), etapa.chave);
      if (destinos.has(saida.para)) aviso('SAIDA_REPETIDA', t.saidaRepetida(r, saida.para), etapa.chave);
      destinos.add(saida.para);
    }

    if (etapa.tipo === 'inicio' && nEntradas > 0) erro('INICIO_COM_ENTRADA', t.inicioComEntrada(r), etapa.chave);
    if (etapa.tipo === 'fim' && nSaidas > 0) erro('FIM_COM_SAIDA', t.fimComSaida(r), etapa.chave);
    if (etapa.tipo !== 'fim' && nSaidas === 0) erro('BECO_SEM_SAIDA', t.becoSemSaida(r), etapa.chave);

    if ((etapa.tipo === 'gateway_exclusivo' || etapa.tipo === 'gateway_inclusivo') && nSaidas > 1) {
      const semRotulo = etapa.proximos.filter((s) => !s.rotulo?.trim()).map((s) => s.para);
      if (semRotulo.length > 0) erro('SAIDA_SEM_ROTULO', t.saidaSemRotulo(r, semRotulo.join(', ')), etapa.chave);
    }

    if (familia === 'gateway' && nEntradas <= 1 && nSaidas === 1) aviso('GATEWAY_INUTIL', t.gatewayInutil(r), etapa.chave);
    if (etapa.subprocesso && etapa.tipo !== 'subprocesso') aviso('SUBPROCESSO_EM_ETAPA_COMUM', t.subprocessoEmEtapaComum(r), etapa.chave);
    if ((familia === 'tarefa' || familia === 'subprocesso') && nSaidas > 1) aviso('SAIDA_MULTIPLA_SEM_GATEWAY', t.saidaMultipla(r, nSaidas), etapa.chave);
  }

  const inicios = m.etapas.filter((e) => e.tipo === 'inicio');
  if (inicios.length === 0) erro('SEM_INICIO', t.semInicio());
  if (!m.etapas.some((e) => e.tipo === 'fim')) erro('SEM_FIM', t.semFim());

  if (inicios.length > 0) {
    const alcancadas = new Set<string>();
    const fila = inicios.map((e) => e.chave);
    while (fila.length > 0) {
      const chave = fila.shift()!;
      if (alcancadas.has(chave)) continue;
      alcancadas.add(chave);
      for (const saida of porChave.get(chave)?.proximos ?? []) fila.push(saida.para);
    }
    for (const etapa of porChave.values()) {
      if (!alcancadas.has(etapa.chave)) erro('INALCANCAVEL', t.inalcancavel(rotulo(etapa)), etapa.chave);
    }
  }

  const raiasUsadas = new Set(m.etapas.map((e) => e.raia));
  for (const raia of m.raias) {
    if (!raiasUsadas.has(raia.id)) aviso('RAIA_VAZIA', t.raiaVazia(raia.nome, raia.id));
  }

  return { ok: !problemas.some((p) => p.severidade === 'erro'), problemas };
}

/** Texto curto do resultado, para terminal e para devolver ao agente. */
export function formatarValidacao(r: ResultadoValidacao, idioma: Idioma = 'pt'): string {
  const t = MENSAGENS[idioma];
  if (r.problemas.length === 0) return t.aprovadaSemAvisos;
  const linhas = r.problemas.map((p) => `${p.severidade === 'erro' ? '✗' : '!'} [${p.codigo}] ${p.mensagem}`);
  return [r.ok ? t.aprovadaComAvisos : t.reprovada, ...linhas].join('\n');
}
