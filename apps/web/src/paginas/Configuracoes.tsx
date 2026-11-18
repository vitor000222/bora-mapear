import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { GRUPOS_TIPO, ROTULOS_TIPO, type TipoEtapa } from '@bora-mapear/core';
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

interface Predefinido {
  nome: string;
  tipo: TipoProvedor;
  urlBase: string;
  pedeChave: boolean;
  dica: string;
}

const PREDEFINIDOS: Predefinido[] = [
  { nome: 'OpenRouter', tipo: 'openai', urlBase: 'https://openrouter.ai/api/v1', pedeChave: true, dica: 'Uma chave para centenas de modelos. Informa o custo de cada chamada.' },
  { nome: 'Anthropic', tipo: 'anthropic', urlBase: 'https://api.anthropic.com', pedeChave: true, dica: 'Modelos Claude, pelo SDK oficial.' },
  { nome: 'OpenAI', tipo: 'openai', urlBase: 'https://api.openai.com/v1', pedeChave: true, dica: '' },
  { nome: 'Google Gemini', tipo: 'openai', urlBase: 'https://generativelanguage.googleapis.com/v1beta/openai', pedeChave: true, dica: 'Pelo endpoint compatível com OpenAI do Google.' },
  { nome: 'Groq', tipo: 'openai', urlBase: 'https://api.groq.com/openai/v1', pedeChave: true, dica: '' },
  { nome: 'DeepSeek', tipo: 'openai', urlBase: 'https://api.deepseek.com/v1', pedeChave: true, dica: '' },
  { nome: 'Ollama (local)', tipo: 'openai', urlBase: 'http://127.0.0.1:11434/v1', pedeChave: false, dica: 'Modelos rodando no seu computador, sem chave e sem custo.' },
  { nome: 'LM Studio (local)', tipo: 'openai', urlBase: 'http://127.0.0.1:1234/v1', pedeChave: false, dica: '' },
  { nome: 'Outro (compatível com OpenAI)', tipo: 'openai', urlBase: 'https://', pedeChave: true, dica: 'Qualquer serviço que responda em /chat/completions.' },
];

const NOMES_AGENTE: Record<AgenteConfiguravel, string> = {
  padrao: 'Padrão',
  leitor: 'Leitor',
  mapeador: 'Mapeador',
  revisor: 'Revisor',
  editor: 'Editor',
  conversor: 'Conversor',
  visual: 'Visual',
};

const ESFORCOS: Array<{ valor: Esforco | ''; nome: string }> = [
  { valor: '', nome: 'Padrão do modelo' },
  { valor: 'low', nome: 'Baixo' },
  { valor: 'medium', nome: 'Médio' },
  { valor: 'high', nome: 'Alto' },
  { valor: 'xhigh', nome: 'Muito alto' },
  { valor: 'max', nome: 'Máximo' },
];

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Configuracoes() {
  const avisar = useAvisos();
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
      avisar(`${lista.length} modelos disponíveis neste provedor.`, 'info');
    } catch (e) {
      avisar(`Não deu para listar os modelos: ${mensagemDe(e)}`, 'erro');
    }
  };

  return (
    <section className="pagina">
      <a href="#/" className="voltar">
        ← Mapeamentos
      </a>
      <div>
        <h1>Configurações</h1>
        <p className="suave">
          Os agentes usam a sua chave. Ela fica cifrada no banco local, nunca volta para o navegador, e as chamadas saem deste servidor direto para o provedor.
        </p>
      </div>

      <div className="cartao secao">
        <div className="secao-cabecalho">
          <h2>Provedores</h2>
          <span className="suave pequeno">Onde os modelos rodam.</span>
        </div>
        {provedores === null && <p className="suave">Carregando…</p>}
        {provedores?.length === 0 && <p className="suave">Nenhum provedor ainda. Cadastre um abaixo para os agentes funcionarem.</p>}
        <ul className="lista-provedores">
          {provedores?.map((p) => (
            <ItemProvedor key={p.id} provedor={p} aoMudar={() => void carregar()} />
          ))}
        </ul>
        <NovoProvedor aoCriar={() => void carregar()} />
      </div>

      <div className="cartao secao">
        <div className="secao-cabecalho">
          <h2>Modelo de cada agente</h2>
          <span className="suave pequeno">O padrão vale para todo agente sem modelo próprio.</span>
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
                avisar(`${NOMES_AGENTE[c.agente]}: salvo.`, 'sucesso');
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

const NOMES_FAMILIA: Record<string, string> = { evento: 'Eventos', tarefa: 'Tarefas', subprocesso: 'Subprocessos', gateway: 'Decisões e gateways' };

function resumoCondicao(r: RegraVisual): string {
  const q = r.quando;
  const partes = [
    q.tipos?.length && q.tipos.map((t) => ROTULOS_TIPO[t]).join(', '),
    q.familias?.length && q.familias.map((f) => NOMES_FAMILIA[f]).join(', '),
    q.raias?.length && `raia ${q.raias.join(', ')}`,
    q.nomeContem && `nome com "${q.nomeContem}"`,
    q.revisarHumano && 'pede revisão humana',
    q.semEvidencia && 'sem evidência',
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'todas as etapas';
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
    const nome = tipoAlvo === 'tipo' ? ROTULOS_TIPO[valor as TipoEtapa] : (NOMES_FAMILIA[valor] ?? valor);
    const regra: RegraVisual = {
      descricao: `${nome} em ${fundo}`,
      quando: tipoAlvo === 'tipo' ? { tipos: [valor as TipoEtapa] } : { familias: [valor as 'evento' | 'tarefa' | 'subprocesso' | 'gateway'] },
      corFundo: fundo,
      corBorda: borda,
    };
    void salvar({ versao: 1, regras: [...estilo.regras, regra] }, 'Regra adicionada.');
  };

  return (
    <div className="cartao secao">
      <div className="secao-cabecalho">
        <h2>Estilo visual</h2>
        <span className="suave pequeno">Regras de cor que o botão "Aplicar meu estilo" usa em qualquer desenho. A de baixo vence.</span>
      </div>
      {estilo?.regras.length === 0 && (
        <p className="suave">Nenhuma regra ainda. Crie uma abaixo, ou deixe o agente Visual aprender com as cores que você já aplicou.</p>
      )}
      <ol className="lista-regras">
        {estilo?.regras.map((r, i) => (
          <li key={i}>
            <Amostra regra={r} />
            <div>
              <strong>{r.descricao}</strong>
              <div className="suave pequeno">{resumoCondicao(r)}</div>
            </div>
            <button
              className="icone icone-perigo"
              aria-label={`Remover a regra ${r.descricao}`}
              onClick={() => void salvar({ versao: 1, regras: estilo.regras.filter((_, j) => j !== i) }, 'Regra removida.')}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div className="nova-regra">
        <select className="entrada" value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="Etapas da regra">
          <optgroup label="Família">
            {Object.entries(NOMES_FAMILIA).map(([f, nome]) => (
              <option key={f} value={`familia:${f}`}>
                {nome}
              </option>
            ))}
          </optgroup>
          {GRUPOS_TIPO.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.tipos.map((t) => (
                <option key={t} value={`tipo:${t}`}>
                  {ROTULOS_TIPO[t]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <label className="campo-cor">
          Fundo <input type="color" value={fundo} onChange={(e) => setFundo(e.target.value)} />
        </label>
        <label className="campo-cor">
          Borda <input type="color" value={borda} onChange={(e) => setBorda(e.target.value)} />
        </label>
        <button className="botao" onClick={adicionar} disabled={!estilo}>
          + Regra
        </button>
        <button className="botao botao-primario" onClick={() => void aprender()} disabled={aprendendo} title="O agente Visual lê as cores que você aplicou nos desenhos e propõe regras">
          {aprendendo ? 'Aprendendo…' : 'Aprender com minhas correções'}
        </button>
      </div>
      {proposta && (
        <div className="proposta">
          <strong>Proposta do agente Visual</strong>
          <span className="suave pequeno">Tirada de {proposta.exemplos} etapas que você pintou.</span>
          {proposta.estilo.regras.length === 0 && <p className="pequeno">Nenhuma regra: não achou padrão.</p>}
          <ol className="lista-regras">
            {proposta.estilo.regras.map((r, i) => (
              <li key={i}>
                <Amostra regra={r} />
                <div>
                  <strong>{r.descricao}</strong>
                  <div className="suave pequeno">
                    {resumoCondicao(r)} · acerta {proposta.cobertura[i]?.acerta ?? 0} de {proposta.cobertura[i]?.vale ?? 0} exemplos
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
                void salvar(proposta.estilo, 'Estilo atualizado.');
                setProposta(null);
              }}
            >
              Usar este estilo
            </button>
            <button className="botao" onClick={() => setProposta(null)}>
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemProvedor({ provedor: p, aoMudar }: { provedor: Provedor; aoMudar: () => void }) {
  const avisar = useAvisos();
  const [modeloTeste, setModeloTeste] = useState(p.tipo === 'anthropic' ? 'claude-opus-5-5' : '');
  const [testando, setTestando] = useState(false);
  const [novaChave, setNovaChave] = useState<string | null>(null);

  const testar = async () => {
    setTestando(true);
    try {
      const r = await apiIa.testarProvedor(p.id, modeloTeste);
      if (r.ok) avisar(`Funcionou: ${modeloTeste} respondeu em ${(r.ms / 1000).toFixed(1)} s. ${formatarCusto(r.uso?.custo)}`.trim(), 'sucesso');
      else avisar(`Não funcionou: ${r.erro ?? 'resposta inesperada'}`, 'erro');
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
          {p.tipo === 'anthropic' ? 'API da Anthropic' : 'Compatível com OpenAI'} ·{' '}
          {p.temChave ? <span className="mono">chave ••••{p.finalChave}</span> : <span className="suave">sem chave</span>}
        </span>
      </div>
      <div className="provedor-acoes">
        <input className="entrada entrada-curta" placeholder="modelo para testar" value={modeloTeste} onChange={(e) => setModeloTeste(e.target.value)} aria-label="Modelo para testar" />
        <button className="botao" onClick={() => void testar()} disabled={testando || !modeloTeste.trim()}>
          {testando ? 'Testando…' : 'Testar'}
        </button>
        {novaChave === null ? (
          <button className="botao" onClick={() => setNovaChave('')}>
            {p.temChave ? 'Trocar chave' : 'Pôr chave'}
          </button>
        ) : (
          <>
            <input className="entrada entrada-curta" type="password" autoComplete="off" placeholder="nova chave" value={novaChave} onChange={(e) => setNovaChave(e.target.value)} aria-label="Nova chave" />
            <button
              className="botao botao-primario"
              disabled={!novaChave.trim()}
              onClick={async () => {
                try {
                  await apiIa.editarProvedor(p.id, { chave: novaChave.trim() });
                  setNovaChave(null);
                  avisar('Chave trocada.', 'sucesso');
                  aoMudar();
                } catch (e) {
                  avisar(mensagemDe(e), 'erro');
                }
              }}
            >
              Salvar
            </button>
            <button className="botao" onClick={() => setNovaChave(null)}>
              Cancelar
            </button>
          </>
        )}
        <button
          className="botao botao-fantasma botao-perigo"
          onClick={async () => {
            if (!window.confirm(`Remover "${p.nome}"? Os agentes que usam este provedor ficam sem modelo.`)) return;
            await apiIa.apagarProvedor(p.id);
            aoMudar();
          }}
        >
          Remover
        </button>
      </div>
    </li>
  );
}

function NovoProvedor({ aoCriar }: { aoCriar: () => void }) {
  const avisar = useAvisos();
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const pre = PREDEFINIDOS[indice]!;
  const [nome, setNome] = useState(pre.nome);
  const [urlBase, setUrlBase] = useState(pre.urlBase);
  const [chave, setChave] = useState('');

  const escolher = (i: number) => {
    setIndice(i);
    setNome(PREDEFINIDOS[i]!.nome);
    setUrlBase(PREDEFINIDOS[i]!.urlBase);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiIa.criarProvedor({ nome, tipo: pre.tipo, urlBase, ...(chave.trim() ? { chave: chave.trim() } : {}) });
      avisar(`${nome} cadastrado. Agora escolha o modelo dos agentes abaixo.`, 'sucesso');
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
        + Provedor
      </button>
    );
  }
  return (
    <form className="novo-provedor" onSubmit={(e) => void salvar(e)}>
      <label className="campo">
        <span>Provedor</span>
        <select className="entrada" value={indice} onChange={(e) => escolher(Number(e.target.value))}>
          {PREDEFINIDOS.map((p, i) => (
            <option key={p.nome} value={i}>
              {p.nome}
            </option>
          ))}
        </select>
        {pre.dica && <span className="suave pequeno">{pre.dica}</span>}
      </label>
      <label className="campo">
        <span>Nome</span>
        <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <label className="campo">
        <span>URL base</span>
        <input className="entrada mono" value={urlBase} onChange={(e) => setUrlBase(e.target.value)} required />
      </label>
      <label className="campo">
        <span>Chave de API {pre.pedeChave ? '' : '(opcional)'}</span>
        <input className="entrada" type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} required={pre.pedeChave} />
      </label>
      <div className="dialogo-acoes">
        <button type="button" className="botao" onClick={() => setAberto(false)}>
          Cancelar
        </button>
        <button type="submit" className="botao botao-primario">
          Cadastrar
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

  return (
    <div className="linha-agente">
      <div className="linha-agente-nome">
        <strong>{NOMES_AGENTE[c.agente]}</strong>
        <span className="suave pequeno">{descricao}</span>
      </div>
      <select
        className="entrada"
        value={c.provedorId ?? ''}
        aria-label={`Provedor do agente ${NOMES_AGENTE[c.agente]}`}
        onChange={(e) => setC({ ...c, provedorId: e.target.value || null, esforco: null })}
      >
        <option value="">{ehPadrao ? 'Escolha um provedor' : 'Usar o padrão'}</option>
        {provedores.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      <input
        className="entrada mono"
        list={lista}
        placeholder={provedor?.tipo === 'anthropic' ? 'claude-opus-5-5' : 'id do modelo'}
        value={c.modelo}
        disabled={!c.provedorId}
        onFocus={() => c.provedorId && aoListarModelos(c.provedorId)}
        onChange={(e) => setC({ ...c, modelo: e.target.value })}
        aria-label={`Modelo do agente ${NOMES_AGENTE[c.agente]}`}
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
        title={provedor?.tipo === 'anthropic' ? 'Quanto o modelo pensa antes de responder' : 'Só para modelos Claude'}
        onChange={(e) => setC({ ...c, esforco: (e.target.value || null) as Esforco | null })}
        aria-label="Esforço"
      >
        {ESFORCOS.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.nome}
          </option>
        ))}
      </select>
      <button className="botao botao-primario" disabled={!sujo || (Boolean(c.provedorId) && !c.modelo.trim())} onClick={() => void aoSalvar(c)}>
        Salvar
      </button>
    </div>
  );
}
