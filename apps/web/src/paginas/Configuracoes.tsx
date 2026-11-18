import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { gruposTipo, rotulosTipo, type TipoEtapa } from '@bora-mapear/core';
import {
  apiIa,
  ErroApi,
  formatarCusto,
  type AgenteConfiguravel,
  type ConfigAgente,
  type Esforco,
  type EstiloVisual,
  type Provedor,
  type RegraVisual,
  type TipoProvedor,
} from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { useIdioma, useTextos, type Textos } from '../i18n/index.tsx';

type TextosConfig = Textos['config'];

interface Predefinido {
  /** Nome próprio do serviço; sem ele, o nome vem dos textos (`novoProvedor.outro`). */
  nome?: string;
  tipo: TipoProvedor;
  urlBase: string;
  pedeChave: boolean;
  dica?: keyof TextosConfig['novoProvedor']['dicas'];
}

const PREDEFINIDOS: Predefinido[] = [
  { nome: 'OpenRouter', tipo: 'openai', urlBase: 'https://openrouter.ai/api/v1', pedeChave: true, dica: 'openrouter' },
  { nome: 'Anthropic', tipo: 'anthropic', urlBase: 'https://api.anthropic.com', pedeChave: true, dica: 'anthropic' },
  { nome: 'OpenAI', tipo: 'openai', urlBase: 'https://api.openai.com/v1', pedeChave: true },
  { nome: 'Google Gemini', tipo: 'openai', urlBase: 'https://generativelanguage.googleapis.com/v1beta/openai', pedeChave: true, dica: 'gemini' },
  { nome: 'Groq', tipo: 'openai', urlBase: 'https://api.groq.com/openai/v1', pedeChave: true },
  { nome: 'DeepSeek', tipo: 'openai', urlBase: 'https://api.deepseek.com/v1', pedeChave: true },
  { nome: 'Ollama (local)', tipo: 'openai', urlBase: 'http://127.0.0.1:11434/v1', pedeChave: false, dica: 'ollama' },
  { nome: 'LM Studio (local)', tipo: 'openai', urlBase: 'http://127.0.0.1:1234/v1', pedeChave: false },
  { tipo: 'openai', urlBase: 'https://', pedeChave: true, dica: 'outro' },
];

const ESFORCOS: Array<Esforco | ''> = ['', 'low', 'medium', 'high', 'xhigh', 'max'];

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Configuracoes() {
  const avisar = useAvisos();
  const t = useTextos().config;
  const [provedores, setProvedores] = useState<Provedor[] | null>(null);
  const [agentes, setAgentes] = useState<ConfigAgente[]>([]);
  const [descricoes, setDescricoes] = useState<Partial<Record<AgenteConfiguravel, string>>>({});
  const [modelos, setModelos] = useState<Record<string, string[]>>({});

  const carregar = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([apiIa.provedores(), apiIa.agentes()]);
      setProvedores(p);
      setAgentes(a.agentes);
      setDescricoes(a.descricoes);
    } catch (e) {
      avisar(mensagemDe(e), 'erro');
    }
  }, [avisar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const carregarModelos = async (provedorId: string) => {
    if (modelos[provedorId]) return;
    try {
      const lista = await apiIa.modelos(provedorId);
      setModelos((m) => ({ ...m, [provedorId]: lista }));
      avisar(t.modelos.disponiveis(lista.length), 'info');
    } catch (e) {
      avisar(t.modelos.naoListou(mensagemDe(e)), 'erro');
    }
  };

  return (
    <section className="pagina">
      <a href="#/" className="voltar">
        {t.voltar}
      </a>
      <div>
        <h1>{t.titulo}</h1>
        <p className="suave">{t.intro}</p>
      </div>

      <div className="cartao secao">
        <div className="secao-cabecalho">
          <h2>{t.provedores.titulo}</h2>
          <span className="suave pequeno">{t.provedores.subtitulo}</span>
        </div>
        {provedores === null && <p className="suave">{t.provedores.carregando}</p>}
        {provedores?.length === 0 && <p className="suave">{t.provedores.nenhum}</p>}
        <ul className="lista-provedores">
          {provedores?.map((p) => (
            <ItemProvedor key={p.id} provedor={p} aoMudar={() => void carregar()} />
          ))}
        </ul>
        <NovoProvedor aoCriar={() => void carregar()} />
      </div>

      <div className="cartao secao">
        <div className="secao-cabecalho">
          <h2>{t.modelos.titulo}</h2>
          <span className="suave pequeno">{t.modelos.subtitulo}</span>
        </div>
        {agentes.map((a) => (
          <LinhaAgente
            key={a.agente}
            config={a}
            descricao={descricoes[a.agente] ?? ''}
            provedores={provedores ?? []}
            modelos={a.provedorId ? modelos[a.provedorId] : undefined}
            aoListarModelos={(id) => void carregarModelos(id)}
            aoSalvar={async (c) => {
              try {
                await apiIa.salvarAgente(c);
                avisar(t.modelos.salvo(t.agentes[c.agente]), 'sucesso');
                void carregar();
              } catch (e) {
                avisar(mensagemDe(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
              }
            }}
          />
        ))}
      </div>

      <SecaoEstilo />
    </section>
  );
}

type FamiliaRegra = keyof TextosConfig['familias'];

function resumoCondicao(r: RegraVisual, t: TextosConfig, rotulos: Record<TipoEtapa, string>): string {
  const q = r.quando;
  const partes = [
    q.tipos?.length && q.tipos.map((tipo) => rotulos[tipo]).join(', '),
    q.familias?.length && q.familias.map((f) => t.familias[f]).join(', '),
    q.raias?.length && t.condicao.raia(q.raias.join(', ')),
    q.nomeContem && t.condicao.nomeContem(q.nomeContem),
    q.revisarHumano && t.condicao.revisarHumano,
    q.semEvidencia && t.condicao.semEvidencia,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : t.condicao.todas;
}

function Amostra({ regra }: { regra: Pick<RegraVisual, 'corFundo' | 'corBorda'> }) {
  return <span className="amostra amostra-fixa" style={{ background: regra.corFundo ?? '#ffffff', borderColor: regra.corBorda ?? '#9aa1ad' }} aria-hidden />;
}

interface PropostaEstilo {
  estilo: EstiloVisual;
  observacoes: string[];
  cobertura: Array<{ vale: number; acerta: number }>;
  exemplos: number;
}

/** O estilo visual: regras de cor que o "Aplicar meu estilo" usa em qualquer desenho. */
function SecaoEstilo() {
  const avisar = useAvisos();
  const textosConfig = useTextos().config;
  const t = textosConfig.estilo;
  const { idioma } = useIdioma();
  const rotulos = rotulosTipo(idioma);
  const [estilo, setEstilo] = useState<EstiloVisual | null>(null);
  const [proposta, setProposta] = useState<PropostaEstilo | null>(null);
  const [aprendendo, setAprendendo] = useState(false);
  const [alvo, setAlvo] = useState<string>('tipo:tarefa_manual');
  const [fundo, setFundo] = useState('#fff3e0');
  const [borda, setBorda] = useState('#ef6c00');

  useEffect(() => {
    apiIa.estilo().then(setEstilo, (e: unknown) => avisar(mensagemDe(e), 'erro'));
  }, [avisar]);

  const salvar = async (novo: EstiloVisual, texto: string) => {
    try {
      setEstilo(await apiIa.salvarEstilo(novo));
      avisar(texto, 'sucesso');
    } catch (e) {
      avisar(mensagemDe(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    }
  };

  const aprender = async () => {
    setAprendendo(true);
    try {
      setProposta(await apiIa.aprenderEstilo());
    } catch (e) {
      avisar(mensagemDe(e), 'erro');
    } finally {
      setAprendendo(false);
    }
  };

  const adicionar = () => {
    if (!estilo) return;
    const [tipoAlvo, valor] = alvo.split(':') as ['tipo' | 'familia', string];
    const familias: Record<string, string> = textosConfig.familias;
    const nome = tipoAlvo === 'tipo' ? rotulos[valor as TipoEtapa] : (familias[valor] ?? valor);
    const regra: RegraVisual = {
      descricao: t.descricaoRegra(nome, fundo),
      quando: tipoAlvo === 'tipo' ? { tipos: [valor as TipoEtapa] } : { familias: [valor as FamiliaRegra] },
      corFundo: fundo,
      corBorda: borda,
    };
    void salvar({ versao: 1, regras: [...estilo.regras, regra] }, t.regraAdicionada);
  };

  return (
    <div className="cartao secao">
      <div className="secao-cabecalho">
        <h2>{t.titulo}</h2>
        <span className="suave pequeno">{t.subtitulo}</span>
      </div>
      {estilo?.regras.length === 0 && <p className="suave">{t.nenhuma}</p>}
      <ol className="lista-regras">
        {estilo?.regras.map((r, i) => (
          <li key={i}>
            <Amostra regra={r} />
            <div>
              <strong>{r.descricao}</strong>
              <div className="suave pequeno">{resumoCondicao(r, textosConfig, rotulos)}</div>
            </div>
            <button
              className="icone icone-perigo"
              aria-label={t.removerRegra(r.descricao)}
              onClick={() => void salvar({ versao: 1, regras: estilo.regras.filter((_, j) => j !== i) }, t.regraRemovida)}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div className="nova-regra">
        <select className="entrada" value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label={t.etapasDaRegra}>
          <optgroup label={t.familia}>
            {Object.entries(textosConfig.familias).map(([f, nome]) => (
              <option key={f} value={`familia:${f}`}>
                {nome}
              </option>
            ))}
          </optgroup>
          {gruposTipo(idioma).map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.tipos.map((tipo) => (
                <option key={tipo} value={`tipo:${tipo}`}>
                  {rotulos[tipo]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label className="campo-cor">
          {t.fundo} <input type="color" value={fundo} onChange={(e) => setFundo(e.target.value)} />
        </label>
        <label className="campo-cor">
          {t.borda} <input type="color" value={borda} onChange={(e) => setBorda(e.target.value)} />
        </label>
        <button className="botao" onClick={adicionar} disabled={!estilo}>
          {t.novaRegra}
        </button>
        <button className="botao botao-primario" onClick={() => void aprender()} disabled={aprendendo} title={t.aprenderDica}>
          {aprendendo ? t.aprendendo : t.aprender}
        </button>
      </div>
      {proposta && (
        <div className="proposta">
          <strong>{t.proposta}</strong>
          <span className="suave pequeno">{t.tiradaDe(proposta.exemplos)}</span>
          {proposta.estilo.regras.length === 0 && <p className="pequeno">{t.semPadrao}</p>}
          <ol className="lista-regras">
            {proposta.estilo.regras.map((r, i) => (
              <li key={i}>
                <Amostra regra={r} />
                <div>
                  <strong>{r.descricao}</strong>
                  <div className="suave pequeno">
                    {resumoCondicao(r, textosConfig, rotulos)}
                    {t.acerta(proposta.cobertura[i]?.acerta ?? 0, proposta.cobertura[i]?.vale ?? 0)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {proposta.observacoes.length > 0 && (
            <ul className="pequeno suave">
              {proposta.observacoes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
          <div className="barra-visao-acoes">
            <button
              className="botao botao-primario"
              disabled={!proposta.estilo.regras.length}
              onClick={() => {
                void salvar(proposta.estilo, t.estiloAtualizado);
                setProposta(null);
              }}
            >
              {t.usar}
            </button>
            <button className="botao" onClick={() => setProposta(null)}>
              {t.descartar}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemProvedor({ provedor: p, aoMudar }: { provedor: Provedor; aoMudar: () => void }) {
  const avisar = useAvisos();
  const t = useTextos().config.provedor;
  const [modeloTeste, setModeloTeste] = useState(p.tipo === 'anthropic' ? 'claude-opus-5-5' : '');
  const [testando, setTestando] = useState(false);
  const [novaChave, setNovaChave] = useState<string | null>(null);

  const testar = async () => {
    setTestando(true);
    try {
      const r = await apiIa.testarProvedor(p.id, modeloTeste);
      if (r.ok) avisar(t.funcionou(modeloTeste, (r.ms / 1000).toFixed(1), formatarCusto(r.uso?.custo)).trim(), 'sucesso');
      else avisar(t.naoFuncionou(r.erro ?? t.respostaInesperada), 'erro');
    } catch (e) {
      avisar(mensagemDe(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    } finally {
      setTestando(false);
    }
  };

  return (
    <li className="provedor">
      <div className="provedor-info">
        <strong>{p.nome}</strong>
        <span className="suave pequeno mono">{p.urlBase}</span>
        <span className="pequeno">
          {p.tipo === 'anthropic' ? t.tipoAnthropic : t.tipoOpenai} ·{' '}
          {p.temChave ? <span className="mono">{t.chave(p.finalChave ?? '')}</span> : <span className="suave">{t.semChave}</span>}
        </span>
      </div>
      <div className="provedor-acoes">
        <input className="entrada entrada-curta" placeholder={t.modeloParaTestar} value={modeloTeste} onChange={(e) => setModeloTeste(e.target.value)} aria-label={t.modeloParaTestarRotulo} />
        <button className="botao" onClick={() => void testar()} disabled={testando || !modeloTeste.trim()}>
          {testando ? t.testando : t.testar}
        </button>
        {novaChave === null ? (
          <button className="botao" onClick={() => setNovaChave('')}>
            {p.temChave ? t.trocarChave : t.porChave}
          </button>
        ) : (
          <>
            <input className="entrada entrada-curta" type="password" autoComplete="off" placeholder={t.novaChave} value={novaChave} onChange={(e) => setNovaChave(e.target.value)} aria-label={t.novaChaveRotulo} />
            <button
              className="botao botao-primario"
              disabled={!novaChave.trim()}
              onClick={async () => {
                try {
                  await apiIa.editarProvedor(p.id, { chave: novaChave.trim() });
                  setNovaChave(null);
                  avisar(t.chaveTrocada, 'sucesso');
                  aoMudar();
                } catch (e) {
                  avisar(mensagemDe(e), 'erro');
                }
              }}
            >
              {t.salvar}
            </button>
            <button className="botao" onClick={() => setNovaChave(null)}>
              {t.cancelar}
            </button>
          </>
        )}
        <button
          className="botao botao-fantasma botao-perigo"
          onClick={async () => {
            if (!window.confirm(t.confirmarRemover(p.nome))) return;
            await apiIa.apagarProvedor(p.id);
            aoMudar();
          }}
        >
          {t.remover}
        </button>
      </div>
    </li>
  );
}

function NovoProvedor({ aoCriar }: { aoCriar: () => void }) {
  const avisar = useAvisos();
  const t = useTextos().config.novoProvedor;
  const nomeDe = (p: Predefinido) => p.nome ?? t.outro;
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const pre = PREDEFINIDOS[indice]!;
  const [nome, setNome] = useState(nomeDe(pre));
  const [urlBase, setUrlBase] = useState(pre.urlBase);
  const [chave, setChave] = useState('');

  const escolher = (i: number) => {
    setIndice(i);
    setNome(nomeDe(PREDEFINIDOS[i]!));
    setUrlBase(PREDEFINIDOS[i]!.urlBase);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiIa.criarProvedor({ nome, tipo: pre.tipo, urlBase, ...(chave.trim() ? { chave: chave.trim() } : {}) });
      avisar(t.cadastrado(nome), 'sucesso');
      setChave('');
      setAberto(false);
      aoCriar();
    } catch (erro) {
      avisar(mensagemDe(erro), 'erro', erro instanceof ErroApi ? erro.detalhes : undefined);
    }
  };

  if (!aberto) {
    return (
      <button className="botao botao-fantasma" onClick={() => setAberto(true)}>
        {t.abrir}
      </button>
    );
  }
  return (
    <form className="novo-provedor" onSubmit={(e) => void salvar(e)}>
      <label className="campo">
        <span>{t.provedor}</span>
        <select className="entrada" value={indice} onChange={(e) => escolher(Number(e.target.value))}>
          {PREDEFINIDOS.map((p, i) => (
            <option key={i} value={i}>
              {nomeDe(p)}
            </option>
          ))}
        </select>
        {pre.dica && <span className="suave pequeno">{t.dicas[pre.dica]}</span>}
      </label>
      <label className="campo">
        <span>{t.nome}</span>
        <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <label className="campo">
        <span>{t.urlBase}</span>
        <input className="entrada mono" value={urlBase} onChange={(e) => setUrlBase(e.target.value)} required />
      </label>
      <label className="campo">
        <span>{t.chave(!pre.pedeChave)}</span>
        <input className="entrada" type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} required={pre.pedeChave} />
      </label>
      <div className="dialogo-acoes">
        <button type="button" className="botao" onClick={() => setAberto(false)}>
          {t.cancelar}
        </button>
        <button type="submit" className="botao botao-primario">
          {t.cadastrar}
        </button>
      </div>
    </form>
  );
}

interface PropsLinhaAgente {
  config: ConfigAgente;
  descricao: string;
  provedores: Provedor[];
  modelos: string[] | undefined;
  aoListarModelos: (provedorId: string) => void;
  aoSalvar: (c: ConfigAgente) => Promise<void>;
}

function LinhaAgente({ config, descricao, provedores, modelos, aoListarModelos, aoSalvar }: PropsLinhaAgente) {
  const textosConfig = useTextos().config;
  const t = textosConfig.modelos;
  const [c, setC] = useState(config);
  const [ultimo, setUltimo] = useState(config);
  if (config !== ultimo) {
    setUltimo(config);
    setC(config);
  }
  const provedor = provedores.find((p) => p.id === c.provedorId);
  const sujo = JSON.stringify(c) !== JSON.stringify(config);
  const lista = `modelos-${c.agente}`;
  const ehPadrao = c.agente === 'padrao';
  const nomeAgente = textosConfig.agentes[c.agente];

  return (
    <div className="linha-agente">
      <div className="linha-agente-nome">
        <strong>{nomeAgente}</strong>
        <span className="suave pequeno">{descricao}</span>
      </div>
      <select
        className="entrada"
        value={c.provedorId ?? ''}
        aria-label={t.provedorDoAgente(nomeAgente)}
        onChange={(e) => setC({ ...c, provedorId: e.target.value || null, esforco: null })}
      >
        <option value="">{ehPadrao ? t.escolhaProvedor : t.usarPadrao}</option>
        {provedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      <input
        className="entrada mono"
        list={lista}
        placeholder={provedor?.tipo === 'anthropic' ? 'claude-opus-5-5' : t.idDoModelo}
        value={c.modelo}
        disabled={!c.provedorId}
        onFocus={() => c.provedorId && aoListarModelos(c.provedorId)}
        onChange={(e) => setC({ ...c, modelo: e.target.value })}
        aria-label={t.modeloDoAgente(nomeAgente)}
      />
      <datalist id={lista}>
        {modelos?.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <select
        className="entrada"
        value={c.esforco ?? ''}
        disabled={provedor?.tipo !== 'anthropic'}
        title={provedor?.tipo === 'anthropic' ? t.esforcoDica : t.esforcoSoClaude}
        onChange={(e) => setC({ ...c, esforco: (e.target.value || null) as Esforco | null })}
        aria-label={t.esforco}
      >
        {ESFORCOS.map((valor) => (
          <option key={valor} value={valor}>
            {t.esforcos[valor || 'padrao']}
          </option>
        ))}
      </select>
      <button className="botao botao-primario" disabled={!sujo || (Boolean(c.provedorId) && !c.modelo.trim())} onClick={() => void aoSalvar(c)}>
        {t.salvar}
      </button>
    </div>
  );
}
