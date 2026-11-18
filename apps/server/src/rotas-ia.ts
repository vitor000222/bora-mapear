import type { Hono } from 'hono';
import { z } from 'zod';
import {
  AGENTES,
  aprenderEstilo,
  converter,
  criarCliente,
  descricoesAgente,
  editar,
  ErroAgente,
  ErroProvedor,
  gerarJson,
  lerFonte,
  listarModelos,
  mapear,
  revisar,
  type ClienteModelo,
  type ConfigProvedor,
  type ExemploCor,
  type NomeAgente,
} from '@bora-mapear/agentes';
import {
  csvParaMatriz,
  type Idioma,
  detectarFormato,
  ErroImportacao,
  EstiloVisualSchema,
  estiloVazio,
  importarBpmn,
  importarMermaid,
  lerMatriz,
  paraId,
  validarMatriz,
  type EstiloVisual,
  type Matriz,
  type ResultadoImportacao,
} from '@bora-mapear/core';
import { matrizInicial } from './modelos.ts';
import { corpo, ErroHttp, idiomaDe } from './http.ts';
import type { AgenteConfiguravel, Repositorio } from './repositorio.ts';
import { Cofre, finalDaChave } from './segredo.ts';
import type { ContextoExecucao, Executor } from './execucoes.ts';
import { ErroFonte, extrairTexto, TAMANHO_MAXIMO, textosFonte } from './fontes.ts';

export interface DependenciasIa {
  repo: Repositorio;
  cofre: Cofre;
  executor: Executor;
  fetch?: typeof fetch;
}

const TipoProvedor = z.enum(['openai', 'anthropic']);
const UrlBase = z
  .string()
  .trim()
  .url('Informe a URL base, com http:// ou https://.')
  .refine((u) => /^https?:\/\//i.test(u), 'Use http:// ou https://.');
const Esforco = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

const NovoProvedor = z.object({
  nome: z.string().trim().min(1).max(80),
  tipo: TipoProvedor,
  urlBase: UrlBase,
  chave: z.string().trim().max(500).optional(),
});
const EdicaoProvedor = z.object({
  nome: z.string().trim().min(1).max(80).optional(),
  urlBase: UrlBase.optional(),
  /** Texto troca a chave; null apaga. Ausente, não mexe. */
  chave: z.string().trim().max(500).nullable().optional(),
});
const ConfigAgenteEntrada = z.object({
  provedorId: z.string().nullable(),
  modelo: z.string().trim().max(200),
  maxTokens: z.number().int().min(256).max(200_000).nullable().optional(),
  esforco: Esforco.nullable().optional(),
});

const AGENTES_CONFIGURAVEIS: AgenteConfiguravel[] = ['padrao', ...AGENTES];

const MSG = {
  mapeamento: { pt: 'Mapeamento não encontrado.', en: 'Process map not found.' },
  provedor: { pt: 'Provedor não encontrado.', en: 'Provider not found.' },
  semModelo: {
    pt: 'Nenhum modelo configurado. Em Configurações, cadastre um provedor e escolha o modelo padrão.',
    en: 'No model configured. In Settings, add a provider and choose the default model.',
  },
  padrao: { pt: 'Vale para todo agente sem configuração própria.', en: 'Applies to every agent without its own settings.' },
  fonte: { pt: 'Fonte não encontrada.', en: 'Source not found.' },
  semArquivo: { pt: 'Nenhum arquivo enviado (campo "arquivos").', en: 'No file sent (field "arquivos").' },
  nenhumAceito: { pt: 'Nenhum arquivo foi aceito.', en: 'No file was accepted.' },
  tudoLido: {
    pt: 'Todas as fontes já foram lidas. Escolha qual ler de novo, ou envie fontes novas.',
    en: 'All sources have been read. Choose one to read again, or add new sources.',
  },
  semEvidencias: {
    pt: 'Não há evidências para mapear. Envie documentos, POPs ou transcrições na seção Fontes.',
    en: 'There is no evidence to map. Add documents, SOPs or transcripts in the Sources section.',
  },
  execucao: { pt: 'Execução não encontrada.', en: 'Run not found.' },
  formatoDesconhecido: {
    pt: 'Não reconheci o formato: o importador lê BPMN 2.0 (XML), fluxograma Mermaid e a matriz em CSV. Para outro formato, use a conversão com IA.',
    en: 'Unknown format: the importer reads BPMN 2.0 (XML), Mermaid flowcharts and the matrix as CSV. For anything else, use AI conversion.',
  },
  soPropostas: {
    pt: 'Só as propostas do Mapeador, do Editor e do Conversor viram versão.',
    en: 'Only proposals from the Mapper, the Editor and the Converter become versions.',
  },
  naoTerminou: { pt: 'A execução ainda não terminou, ou falhou.', en: 'The run has not finished yet, or it failed.' },
} satisfies Record<string, Record<Idioma, string>>;

const IMPORTADO_DE = {
  pt: { bpmn: 'Importado de BPMN.', mermaid: 'Importado de Mermaid.', csv: 'Importado de planilha (CSV).' },
  en: { bpmn: 'Imported from BPMN.', mermaid: 'Imported from Mermaid.', csv: 'Imported from a spreadsheet (CSV).' },
} satisfies Record<Idioma, Record<'bpmn' | 'mermaid' | 'csv', string>>;

export function registrarRotasIa(app: Hono, deps: DependenciasIa): void {
  const { repo, cofre, executor } = deps;
  const opcoesCliente = deps.fetch ? { fetch: deps.fetch } : {};

  const exigirMapeamento = async (id: string) => {
    const m = await repo.obterMapeamento(id);
    if (!m) throw new ErroHttp(404, MSG.mapeamento);
    return m;
  };

  const configDoProvedor = async (id: string): Promise<ConfigProvedor> => {
    const p = await repo.obterProvedorComChave(id);
    if (!p) throw new ErroHttp(404, MSG.provedor);
    let chave: string | undefined;
    try {
      chave = p.chaveCifrada ? cofre.decifrar(p.chaveCifrada) : undefined;
    } catch (erro) {
      throw new ErroHttp(409, erro instanceof Error ? erro.message : String(erro));
    }
    return { tipo: p.tipo, urlBase: p.urlBase, ...(chave ? { chave } : {}) };
  };

  /** O cliente do agente: a configuração própria dele ou a padrão. Sem nenhuma, 409 com o caminho para resolver. */
  const clienteDoAgente = async (agente: NomeAgente, idioma: Idioma): Promise<ClienteModelo> => {
    const configs = await repo.listarConfigAgentes();
    const completa = (a: AgenteConfiguravel) => configs.find((c) => c.agente === a && c.provedorId && c.modelo.trim());
    const cfg = completa(agente) ?? completa('padrao');
    if (!cfg) throw new ErroHttp(409, MSG.semModelo);
    const provedor = await configDoProvedor(cfg.provedorId!);
    return criarCliente(
      provedor,
      { modelo: cfg.modelo, ...(cfg.maxTokens ? { maxTokens: cfg.maxTokens } : {}), ...(cfg.esforco ? { esforco: cfg.esforco } : {}) },
      { ...opcoesCliente, idioma },
    );
  };

  const traduzirErro = (erro: unknown): never => {
    if (erro instanceof ErroProvedor) throw new ErroHttp(502, erro.message);
    if (erro instanceof ErroAgente) throw new ErroHttp(422, erro.message);
    throw erro;
  };

  // ---------------------------------------------------------------- provedores

  app.get('/api/provedores', async (c) => c.json(await repo.listarProvedores()));

  app.post('/api/provedores', async (c) => {
    const d = await corpo(c, NovoProvedor);
    const chave = d.chave || null;
    const provedor = await repo.criarProvedor({
      nome: d.nome,
      tipo: d.tipo,
      urlBase: d.urlBase,
      chaveCifrada: chave ? cofre.cifrar(chave) : null,
      finalChave: chave ? finalDaChave(chave) : null,
    });
    return c.json(provedor, 201);
  });

  app.patch('/api/provedores/:id', async (c) => {
    const d = await corpo(c, EdicaoProvedor);
    const campos: Parameters<Repositorio['atualizarProvedor']>[1] = {};
    if (d.nome !== undefined) campos.nome = d.nome;
    if (d.urlBase !== undefined) campos.urlBase = d.urlBase;
    if (d.chave === null || d.chave === '') Object.assign(campos, { chaveCifrada: null, finalChave: null });
    else if (d.chave !== undefined) Object.assign(campos, { chaveCifrada: cofre.cifrar(d.chave), finalChave: finalDaChave(d.chave) });
    const p = await repo.atualizarProvedor(c.req.param('id'), campos);
    if (!p) throw new ErroHttp(404, MSG.provedor);
    return c.json(p);
  });

  app.delete('/api/provedores/:id', async (c) => {
    if (!(await repo.apagarProvedor(c.req.param('id')))) throw new ErroHttp(404, MSG.provedor);
    return c.body(null, 204);
  });

  app.get('/api/provedores/:id/modelos', async (c) => {
    const provedor = await configDoProvedor(c.req.param('id'));
    try {
      return c.json(await listarModelos(provedor, { ...opcoesCliente, idioma: idiomaDe(c) }));
    } catch (erro) {
      return traduzirErro(erro);
    }
  });

  /** Uma chamada mínima, para saber se a chave e o modelo funcionam antes de gastar com um mapeamento. */
  app.post('/api/provedores/:id/testar', async (c) => {
    const { modelo } = await corpo(c, z.object({ modelo: z.string().trim().min(1, 'Informe o modelo a testar.') }));
    const cliente = criarCliente(await configDoProvedor(c.req.param('id')), { modelo, maxTokens: 512 }, { ...opcoesCliente, idioma: idiomaDe(c) });
    const inicio = Date.now();
    try {
      const r = await gerarJson(cliente, {
        sistema: 'Teste de conexão.',
        usuario: 'Responda com {"ok": true}.',
        schema: z.object({ ok: z.boolean() }),
        nomeSchema: 'teste',
        tentativas: 2,
      });
      return c.json({ ok: r.dado.ok, ms: Date.now() - inicio, uso: r.uso });
    } catch (erro) {
      if (erro instanceof ErroProvedor || erro instanceof ErroAgente) return c.json({ ok: false, ms: Date.now() - inicio, erro: erro.message });
      throw erro;
    }
  });

  // ---------------------------------------------------------------- agentes

  app.get('/api/agentes', async (c) => {
    const salvas = await repo.listarConfigAgentes();
    const agentes = AGENTES_CONFIGURAVEIS.map(
      (a) => salvas.find((s) => s.agente === a) ?? { agente: a, provedorId: null, modelo: '', maxTokens: null, esforco: null },
    );
    const idioma = idiomaDe(c);
    return c.json({ agentes, descricoes: { padrao: MSG.padrao[idioma], ...descricoesAgente(idioma) } });
  });

  app.put('/api/agentes/:agente', async (c) => {
    const agente = c.req.param('agente') as AgenteConfiguravel;
    if (!AGENTES_CONFIGURAVEIS.includes(agente)) throw new ErroHttp(404, { pt: `Agente desconhecido: ${agente}.`, en: `Unknown agent: ${agente}.` });
    const d = await corpo(c, ConfigAgenteEntrada);
    if (d.provedorId && !(await repo.obterProvedorComChave(d.provedorId))) throw new ErroHttp(422, MSG.provedor);
    return c.json(await repo.salvarConfigAgente({ agente, provedorId: d.provedorId, modelo: d.modelo, maxTokens: d.maxTokens ?? null, esforco: d.esforco ?? null }));
  });

  // ---------------------------------------------------------------- fontes e evidências

  app.get('/api/mapeamentos/:id/fontes', async (c) => {
    await exigirMapeamento(c.req.param('id'));
    return c.json(await repo.listarFontes(c.req.param('id')));
  });

  /** Arquivos por multipart (campo "arquivos"), ou texto colado em JSON: { nome, texto }. */
  app.post('/api/mapeamentos/:id/fontes', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const idioma = idiomaDe(c);
    const tf = textosFonte(idioma);
    const criadas = [];
    if ((c.req.header('content-type') ?? '').includes('application/json')) {
      const d = await corpo(c, z.object({ nome: z.string().trim().min(1).max(200), texto: z.string().trim().min(1, 'O texto está vazio.').max(2_000_000) }));
      criadas.push(await repo.criarFonte(id, { nome: d.nome, tipo: 'texto', tamanho: Buffer.byteLength(d.texto), texto: d.texto }));
      return c.json(criadas, 201);
    }
    const corpoForm = await c.req.parseBody({ all: true });
    const campo = corpoForm['arquivos'];
    const arquivos = (Array.isArray(campo) ? campo : campo ? [campo] : []).filter((a): a is File => typeof a !== 'string');
    if (!arquivos.length) throw new ErroHttp(400, MSG.semArquivo);
    const erros: string[] = [];
    for (const arquivo of arquivos) {
      if (arquivo.size > TAMANHO_MAXIMO) {
        erros.push(tf.grande(arquivo.name));
        continue;
      }
      try {
        const { tipo, texto } = await extrairTexto(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()), idioma);
        criadas.push(await repo.criarFonte(id, { nome: arquivo.name, tipo, tamanho: arquivo.size, texto }));
      } catch (erro) {
        if (erro instanceof ErroFonte) erros.push(erro.message);
        else erros.push(tf.ilegivel(arquivo.name, erro instanceof Error ? erro.message : String(erro)));
      }
    }
    if (!criadas.length) throw new ErroHttp(415, MSG.nenhumAceito, erros);
    return c.json(criadas, 201, erros.length ? { 'X-Bora-Avisos': encodeURIComponent(erros.join(' | ')) } : {});
  });

  app.get('/api/mapeamentos/:id/fontes/:fonteId', async (c) => {
    const f = await repo.obterFonte(c.req.param('id'), c.req.param('fonteId'));
    if (!f) throw new ErroHttp(404, MSG.fonte);
    return c.json(f);
  });

  app.delete('/api/mapeamentos/:id/fontes/:fonteId', async (c) => {
    if (!(await repo.apagarFonte(c.req.param('id'), c.req.param('fonteId')))) throw new ErroHttp(404, MSG.fonte);
    return c.body(null, 204);
  });

  app.get('/api/mapeamentos/:id/evidencias', async (c) => {
    await exigirMapeamento(c.req.param('id'));
    return c.json(await repo.listarEvidencias(c.req.param('id')));
  });

  // ---------------------------------------------------------------- agentes em ação

  /** Lê as fontes escolhidas (ou as que ainda não foram lidas) e grava as evidências. */
  const lerFontes = async (mapeamentoId: string, fonteIds: string[], cliente: ClienteModelo, ctx: ContextoExecucao) => {
    const resumo = [];
    for (const fonteId of fonteIds) {
      const fonte = await repo.obterFonte(mapeamentoId, fonteId);
      if (!fonte) continue;
      const r = await lerFonte(cliente, { nome: fonte.nome, texto: fonte.texto }, ctx.progresso);
      ctx.uso(r.uso);
      const salvas = await repo.substituirEvidencias(mapeamentoId, fonteId, r.evidencias);
      resumo.push({ fonteId, nome: fonte.nome, evidencias: salvas.length, naoConferidas: salvas.filter((e) => !e.verificada).length });
    }
    return resumo;
  };

  const pendentes = async (mapeamentoId: string) => (await repo.listarFontes(mapeamentoId)).filter((f) => f.evidencias === 0).map((f) => f.id);

  app.post('/api/mapeamentos/:id/ia/ler', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const { fonteIds } = await corpo(c, z.object({ fonteIds: z.array(z.string()).optional() }));
    const alvo = fonteIds?.length ? fonteIds : await pendentes(id);
    if (!alvo.length) throw new ErroHttp(400, MSG.tudoLido);
    const idioma = idiomaDe(c);
    const cliente = await clienteDoAgente('leitor', idioma);
    const exec = await executor.iniciar(id, 'ler', { fonteIds: alvo }, async (ctx) => ({ fontes: await lerFontes(id, alvo, cliente, ctx) }), idioma);
    return c.json(exec, 202);
  });

  app.post('/api/mapeamentos/:id/ia/mapear', async (c) => {
    const id = c.req.param('id');
    const mapeamento = await exigirMapeamento(id);
    const { instrucoes, lerPendentes } = await corpo(c, z.object({ instrucoes: z.string().max(4000).optional(), lerPendentes: z.boolean().default(true) }));
    const aLer = lerPendentes ? await pendentes(id) : [];
    if (!aLer.length && !(await repo.listarEvidencias(id)).length) {
      throw new ErroHttp(400, MSG.semEvidencias);
    }
    const idioma = idiomaDe(c);
    const leitor = aLer.length ? await clienteDoAgente('leitor', idioma) : null;
    const mapeador = await clienteDoAgente('mapeador', idioma);
    const versaoBase = (await repo.versaoAtual(id))!;
    const exec = await executor.iniciar(id, 'mapear', { instrucoes: instrucoes ?? null }, async (ctx) => {
      if (leitor) await lerFontes(id, aLer, leitor, ctx);
      const evidencias = await repo.listarEvidencias(id);
      const r = await mapear(
        mapeador,
        { nomeProcesso: mapeamento.nome, idProcesso: versaoBase.matriz.processo.id, evidencias, ...(instrucoes ? { instrucoes } : {}) },
        ctx.progresso,
      );
      ctx.uso(r.uso);
      return { matriz: r.matriz, validacao: r.validacao, rodadas: r.rodadas, avisos: r.avisos, versaoBase: versaoBase.numero, evidencias: evidencias.length };
    }, idioma);
    return c.json(exec, 202);
  });

  app.post('/api/mapeamentos/:id/ia/revisar', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const idioma = idiomaDe(c);
    const cliente = await clienteDoAgente('revisor', idioma);
    const versao = (await repo.versaoAtual(id))!;
    const exec = await executor.iniciar(id, 'revisar', { versao: versao.numero }, async (ctx) => {
      const r = await revisar(cliente, { matriz: versao.matriz, evidencias: await repo.listarEvidencias(id) }, ctx.progresso);
      ctx.uso(r.uso);
      return { relatorio: r.relatorio, automaticos: r.automaticos, versao: versao.numero };
    }, idioma);
    return c.json(exec, 202);
  });

  app.post('/api/mapeamentos/:id/ia/editar', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const { pedido } = await corpo(c, z.object({ pedido: z.string().trim().min(3, idiomaDe(c) === 'en' ? 'Write what to change.' : 'Escreva o que mudar.').max(4000) }));
    const idioma = idiomaDe(c);
    const cliente = await clienteDoAgente('editor', idioma);
    const versao = (await repo.versaoAtual(id))!;
    const exec = await executor.iniciar(id, 'editar', { pedido }, async (ctx) => {
      const r = await editar(cliente, { matriz: versao.matriz, pedido }, ctx.progresso);
      ctx.uso(r.uso);
      return { matriz: r.matriz, operacoes: r.operacoes, resumo: r.resumo, frases: r.frases, validacao: r.validacao, rodadas: r.rodadas, versaoBase: versao.numero };
    }, idioma);
    return c.json(exec, 202);
  });

  app.get('/api/mapeamentos/:id/execucoes', async (c) => {
    await exigirMapeamento(c.req.param('id'));
    return c.json(await repo.listarExecucoes(c.req.param('id')));
  });

  app.get('/api/execucoes/:id', async (c) => {
    const e = await repo.obterExecucao(c.req.param('id'));
    if (!e) throw new ErroHttp(404, MSG.execucao);
    return c.json(e);
  });

  // ---------------------------------------------------------------- importar e converter

  const LIMITE_CONTEUDO = 2_000_000;

  /** BPMN ou Mermaid de outra ferramenta vira um mapeamento novo, sem IA. */
  app.post('/api/mapeamentos/importar', async (c) => {
    const idioma = idiomaDe(c);
    const en = idioma === 'en';
    const d = await corpo(
      c,
      z.object({
        nome: z.string().trim().min(1, en ? 'Give the map a name.' : 'Dê um nome ao mapeamento.').max(200),
        conteudo: z.string().min(1, en ? 'The content is empty.' : 'O conteúdo está vazio.').max(LIMITE_CONTEUDO),
        formato: z.enum(['bpmn', 'mermaid', 'csv', 'auto']).default('auto'),
      }),
    );
    const formato = d.formato === 'auto' ? detectarFormato(d.conteudo) : d.formato;
    if (!formato) {
      throw new ErroHttp(422, MSG.formatoDesconhecido, { podeUsarIa: true });
    }
    let r: ResultadoImportacao;
    try {
      r =
        formato === 'bpmn'
          ? await importarBpmn(d.conteudo, { idioma })
          : formato === 'csv'
            ? csvParaMatriz(d.conteudo, d.nome, { idioma })
            : importarMermaid(d.conteudo, d.nome, { idioma });
    } catch (erro) {
      if (erro instanceof ErroImportacao) throw new ErroHttp(422, erro.message, { podeUsarIa: formato !== 'csv' });
      throw erro;
    }
    const matriz: Matriz = { ...r.matriz, processo: { ...r.matriz.processo, nome: d.nome, id: paraId(d.nome, 'processo') } };
    const mapeamento = await repo.criarMapeamento(
      { nome: d.nome, descricao: '', linguagem: formato === 'mermaid' ? 'mermaid' : 'bpmn' },
      matriz,
      'pessoa',
      IMPORTADO_DE[idioma][formato],
    );
    if (r.correcoes) await repo.salvarCorrecoes(mapeamento.id, 'bpmn', r.correcoes);
    return c.json({ mapeamento, avisos: r.avisos, validacao: validarMatriz(matriz, { idioma }) }, 201);
  });

  const iniciarConversao = async (mapeamentoId: string, conteudo: string, cliente: ClienteModelo, idioma: Idioma) => {
    const m = (await repo.obterMapeamento(mapeamentoId))!;
    const versao = (await repo.versaoAtual(mapeamentoId))!;
    return executor.iniciar(mapeamentoId, 'converter', { caracteres: conteudo.length }, async (ctx) => {
      const r = await converter(cliente, { conteudo, nomeProcesso: m.nome, idProcesso: versao.matriz.processo.id }, ctx.progresso);
      ctx.uso(r.uso);
      return { matriz: r.matriz, validacao: r.validacao, rodadas: r.rodadas, avisos: r.avisos, versaoBase: versao.numero };
    }, idioma);
  };

  /** Qualquer outro formato (PlantUML, lista de passos, tabela): o Conversor escreve a matriz num mapeamento novo. */
  app.post('/api/mapeamentos/importar-com-ia', async (c) => {
    const d = await corpo(c, z.object({ nome: z.string().trim().min(1).max(200), conteudo: z.string().min(1).max(LIMITE_CONTEUDO) }));
    const idioma = idiomaDe(c);
    const cliente = await clienteDoAgente('conversor', idioma);
    const criado = idioma === 'en' ? 'Created for AI conversion.' : 'Criado para a conversão com IA.';
    const mapeamento = await repo.criarMapeamento({ nome: d.nome, descricao: '', linguagem: 'bpmn' }, matrizInicial('em-branco', d.nome, idioma), 'pessoa', criado);
    const execucao = await iniciarConversao(mapeamento.id, d.conteudo, cliente, idioma);
    return c.json({ mapeamento, execucao }, 202);
  });

  app.post('/api/mapeamentos/:id/ia/converter', async (c) => {
    const id = c.req.param('id');
    await exigirMapeamento(id);
    const { conteudo } = await corpo(c, z.object({ conteudo: z.string().min(1).max(LIMITE_CONTEUDO) }));
    const idioma = idiomaDe(c);
    return c.json(await iniciarConversao(id, conteudo, await clienteDoAgente('conversor', idioma), idioma), 202);
  });

  // ---------------------------------------------------------------- estilo visual

  const CHAVE_ESTILO = 'estilo_visual';
  const estiloAtual = async () => (await repo.obterConfiguracao<EstiloVisual>(CHAVE_ESTILO)) ?? estiloVazio();

  app.get('/api/estilo', async (c) => c.json(await estiloAtual()));

  app.put('/api/estilo', async (c) => {
    const estilo = await corpo(c, EstiloVisualSchema);
    await repo.salvarConfiguracao(CHAVE_ESTILO, estilo);
    return c.json(estilo);
  });

  /** As cores que a pessoa aplicou à mão, em todos os mapeamentos, com o contexto de cada etapa. */
  const exemplosDeCor = async (): Promise<ExemploCor[]> => {
    const exemplos: ExemploCor[] = [];
    for (const m of await repo.listarMapeamentos()) {
      const versao = await repo.versaoAtual(m.id);
      if (!versao) continue;
      const raias = new Map(versao.matriz.raias.map((r) => [r.id, r.nome]));
      for (const visao of await repo.listarVisoes(m.id)) {
        for (const [chave, n] of Object.entries(visao.correcoes.nos)) {
          if (!n.corFundo && !n.corBorda) continue;
          const e = versao.matriz.etapas.find((x) => x.chave === chave);
          if (!e) continue;
          exemplos.push({
            tipo: e.tipo,
            raia: raias.get(e.raia) ?? e.raia,
            nome: e.nome,
            ...(e.revisarHumano ? { revisarHumano: true } : {}),
            ...(!e.evidencias?.length ? { semEvidencia: true } : {}),
            ...(n.corFundo ? { corFundo: n.corFundo } : {}),
            ...(n.corBorda ? { corBorda: n.corBorda } : {}),
          });
        }
      }
    }
    return exemplos.slice(0, 300);
  };

  /** O agente Visual propõe um estilo; nada é salvo até a pessoa aceitar (PUT /api/estilo). */
  app.post('/api/estilo/aprender', async (c) => {
    const cliente = await clienteDoAgente('visual', idiomaDe(c));
    const exemplos = await exemplosDeCor();
    const frases = (await repo.listarRegistroGeral(40)).flatMap((r) => r.frases).slice(0, 100);
    try {
      const r = await aprenderEstilo(cliente, { exemplos, frases, estiloAtual: await estiloAtual() });
      return c.json({ ...r, exemplos: exemplos.length });
    } catch (erro) {
      return traduzirErro(erro);
    }
  });

  /** Grava a proposta do Mapeador, do Editor ou do Conversor como versão nova da matriz, com o agente como autor. */
  app.post('/api/execucoes/:id/aplicar', async (c) => {
    const exec = await repo.obterExecucao(c.req.param('id'));
    if (!exec) throw new ErroHttp(404, MSG.execucao);
    if (exec.tipo !== 'mapear' && exec.tipo !== 'editar' && exec.tipo !== 'converter') {
      throw new ErroHttp(400, MSG.soPropostas);
    }
    if (exec.status !== 'concluida') throw new ErroHttp(409, MSG.naoTerminou);
    if (exec.aplicadaNaVersao !== null)
      throw new ErroHttp(409, { pt: `Esta proposta já virou a versão ${exec.aplicadaNaVersao}.`, en: `This proposal already became version ${exec.aplicadaNaVersao}.` });
    const idioma = idiomaDe(c);
    const en = idioma === 'en';
    const { forcar, mensagem } = await corpo(c, z.object({ forcar: z.boolean().default(false), mensagem: z.string().max(500).optional() }));
    const saida = exec.saida as { matriz: unknown; versaoBase: number; resumo?: string; evidencias?: number };
    const atual = (await repo.versaoAtual(exec.mapeamentoId))!;
    if (atual.numero !== saida.versaoBase && !forcar) {
      throw new ErroHttp(
        409,
        {
          pt: `A matriz mudou desde que o agente trabalhou (v${saida.versaoBase} → v${atual.numero}). Aplicar substitui essas mudanças pela proposta.`,
          en: `The matrix changed since the agent worked on it (v${saida.versaoBase} → v${atual.numero}). Applying replaces those changes with the proposal.`,
        },
        { versaoBase: saida.versaoBase, versaoAtual: atual.numero },
      );
    }
    let matriz: Matriz;
    try {
      matriz = lerMatriz(saida.matriz);
    } catch (erro) {
      throw new ErroHttp(422, erro instanceof Error ? erro.message : String(erro));
    }
    const texto =
      mensagem?.trim() ||
      (exec.tipo === 'mapear'
        ? en
          ? `Mapped by the agent from ${saida.evidencias ?? 0} pieces of evidence.`
          : `Mapeada pelo agente a partir de ${saida.evidencias ?? 0} evidências.`
        : exec.tipo === 'converter'
          ? en
            ? 'Converted by the agent from code or text.'
            : 'Convertida pelo agente a partir de código ou texto.'
          : en
            ? `${saida.resumo ?? 'Agent edit.'} (request: "${(exec.entrada as { pedido: string }).pedido}")`
            : `${saida.resumo ?? 'Edição do agente.'} (pedido: "${(exec.entrada as { pedido: string }).pedido}")`);
    const autor = exec.tipo === 'mapear' ? 'agente:mapeador' : exec.tipo === 'converter' ? 'agente:conversor' : 'agente:editor';
    const versao = await repo.salvarVersao(exec.mapeamentoId, matriz, autor, texto);
    await repo.atualizarExecucao(exec.id, { aplicadaNaVersao: versao.numero });
    const { matriz: _m, ...cabecalho } = versao;
    return c.json({ versao: cabecalho, validacao: validarMatriz(matriz, { idioma }) }, 201);
  });
}
