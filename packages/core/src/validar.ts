import { familiaDoTipo, type Etapa, type Matriz } from './matriz.ts';

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

/**
 * O portão. Determinístico: a mesma matriz dá sempre o mesmo resultado.
 * Reprovou, as mensagens voltam ao Mapeador.
 */
export function validarMatriz(m: Matriz): ResultadoValidacao {
  const problemas: Problema[] = [];
  const erro = (codigo: CodigoProblema, mensagem: string, chave?: string) =>
    problemas.push(chave ? { codigo, severidade: 'erro', mensagem, chave } : { codigo, severidade: 'erro', mensagem });
  const aviso = (codigo: CodigoProblema, mensagem: string, chave?: string) =>
    problemas.push(chave ? { codigo, severidade: 'aviso', mensagem, chave } : { codigo, severidade: 'aviso', mensagem });

  const raias = new Set<string>();
  for (const raia of m.raias) {
    if (raias.has(raia.id)) erro('RAIA_REPETIDA', `A raia "${raia.id}" aparece duas vezes. Dê um id único a cada raia.`);
    raias.add(raia.id);
  }

  const porChave = new Map<string, Etapa>();
  for (const etapa of m.etapas) {
    if (porChave.has(etapa.chave)) {
      erro('CHAVE_REPETIDA', `A chave "${etapa.chave}" aparece em mais de uma linha. Toda linha precisa de chave própria.`, etapa.chave);
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

    if (!raias.has(etapa.raia)) {
      erro('RAIA_INEXISTENTE', `${rotulo(etapa)} está na raia "${etapa.raia}", que não existe. Use uma destas: ${[...raias].join(', ')}.`, etapa.chave);
    }

    const exigeNome = familia === 'tarefa' || familia === 'subprocesso' || etapa.tipo === 'gateway_exclusivo' || etapa.tipo === 'gateway_inclusivo';
    if (exigeNome && !etapa.nome.trim()) {
      erro('NOME_VAZIO', `A linha ${etapa.chave} (${etapa.tipo}) está sem nome. ${familia === 'gateway' ? 'Escreva a pergunta da decisão.' : 'Escreva verbo no infinitivo + objeto.'}`, etapa.chave);
    }

    const destinos = new Set<string>();
    for (const saida of etapa.proximos) {
      if (saida.para === etapa.chave) {
        erro('AUTO_LIGACAO', `${rotulo(etapa)} aponta para ela mesma. Para repetir, passe por um gateway ou por uma etapa de espera.`, etapa.chave);
      } else if (!porChave.has(saida.para)) {
        erro('DESTINO_INEXISTENTE', `${rotulo(etapa)} aponta para "${saida.para}", que não existe na matriz.`, etapa.chave);
      }
      if (destinos.has(saida.para)) {
        aviso('SAIDA_REPETIDA', `${rotulo(etapa)} tem duas saídas para "${saida.para}".`, etapa.chave);
      }
      destinos.add(saida.para);
    }

    if (etapa.tipo === 'inicio' && nEntradas > 0) {
      erro('INICIO_COM_ENTRADA', `${rotulo(etapa)} é um início, mas recebe seta. Aponte essas setas para a etapa seguinte ao início.`, etapa.chave);
    }
    if (etapa.tipo === 'fim' && nSaidas > 0) {
      erro('FIM_COM_SAIDA', `${rotulo(etapa)} é um fim, mas tem saída. Tire as saídas ou mude o tipo.`, etapa.chave);
    }
    if (etapa.tipo !== 'fim' && nSaidas === 0) {
      erro('BECO_SEM_SAIDA', `${rotulo(etapa)} não tem saída. Ligue a uma etapa seguinte ou a um fim.`, etapa.chave);
    }

    if ((etapa.tipo === 'gateway_exclusivo' || etapa.tipo === 'gateway_inclusivo') && nSaidas > 1) {
      const semRotulo = etapa.proximos.filter((s) => !s.rotulo?.trim()).map((s) => s.para);
      if (semRotulo.length > 0) {
        erro('SAIDA_SEM_ROTULO', `A decisão ${rotulo(etapa)} tem saída sem rótulo para: ${semRotulo.join(', ')}. Cada saída leva a resposta (ex.: "Sim", "Não").`, etapa.chave);
      }
    }

    if (familia === 'gateway' && nEntradas <= 1 && nSaidas === 1) {
      aviso('GATEWAY_INUTIL', `O gateway ${rotulo(etapa)} tem uma entrada e uma saída: não decide nem junta nada.`, etapa.chave);
    }
    if (etapa.subprocesso && etapa.tipo !== 'subprocesso') {
      aviso('SUBPROCESSO_EM_ETAPA_COMUM', `${rotulo(etapa)} aponta para um mapeamento filho, mas não é do tipo subprocesso. Mude o tipo ou tire o vínculo.`, etapa.chave);
    }
    if ((familia === 'tarefa' || familia === 'subprocesso') && nSaidas > 1) {
      aviso('SAIDA_MULTIPLA_SEM_GATEWAY', `${rotulo(etapa)} tem ${nSaidas} saídas sem gateway. Se for decisão, use um gateway exclusivo; se for em paralelo, um gateway paralelo.`, etapa.chave);
    }
  }

  const inicios = m.etapas.filter((e) => e.tipo === 'inicio');
  if (inicios.length === 0) erro('SEM_INICIO', 'A matriz não tem nenhuma linha do tipo "inicio".');
  if (!m.etapas.some((e) => e.tipo === 'fim')) erro('SEM_FIM', 'A matriz não tem nenhuma linha do tipo "fim".');

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
      if (!alcancadas.has(etapa.chave)) {
        erro('INALCANCAVEL', `Nenhum caminho sai de um início e chega em ${rotulo(etapa)}. Ligue-a ao fluxo ou crie um início para ela.`, etapa.chave);
      }
    }
  }

  const raiasUsadas = new Set(m.etapas.map((e) => e.raia));
  for (const raia of m.raias) {
    if (!raiasUsadas.has(raia.id)) aviso('RAIA_VAZIA', `A raia "${raia.nome}" (${raia.id}) não tem nenhuma etapa.`);
  }

  return { ok: !problemas.some((p) => p.severidade === 'erro'), problemas };
}

/** Texto curto do resultado, para terminal e para devolver ao agente. */
export function formatarValidacao(r: ResultadoValidacao): string {
  if (r.problemas.length === 0) return 'Matriz aprovada no portão, sem avisos.';
  const linhas = r.problemas.map((p) => `${p.severidade === 'erro' ? '✗' : '!'} [${p.codigo}] ${p.mensagem}`);
  const cabecalho = r.ok ? 'Matriz aprovada no portão, com avisos:' : 'Matriz reprovada no portão:';
  return [cabecalho, ...linhas].join('\n');
}
