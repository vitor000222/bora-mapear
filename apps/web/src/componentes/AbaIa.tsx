import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { Matriz, ResultadoValidacao } from '@bora-mapear/core';
import { apiIa, ErroApi, formatarCusto, formatarData, formatarTokens, type Evidencia, type Execucao, type Fonte } from '../api.ts';
import { useAvisos } from '../avisos.tsx';

const ROTULOS_SOBRE: Record<string, string> = {
  etapa: 'Etapa',
  decisao: 'Decisão',
  ator: 'Quem faz',
  sistema: 'Sistema',
  documento: 'Documento',
  regra: 'Regra',
  espera: 'Espera',
  problema: 'Problema',
  volume: 'Volume',
  outro: 'Outro',
};

const NOMES_EXECUCAO: Record<Execucao['tipo'], string> = {
  ler: 'Leitor',
  mapear: 'Mapeador',
  revisar: 'Revisor',
  editar: 'Editor',
};

const ACEITOS = '.pdf,.docx,.txt,.md,.csv,.vtt,.srt';

interface Props {
  id: string;
  versaoAtual: number;
  /** Abre a proposta na aba Matriz como rascunho, para revisar antes de salvar. */
  aoRevisarProposta: (m: Matriz) => void;
  /** Uma proposta virou versão: recarregar o mapeamento. */
  aoAplicar: () => Promise<void>;
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AbaIa({ id, versaoAtual, aoRevisarProposta, aoAplicar }: Props) {
  const avisar = useAvisos();
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [instrucoes, setInstrucoes] = useState('');
  const [pedido, setPedido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const rodandoAntes = useRef<Set<string>>(new Set());

  const carregarTudo = useCallback(async () => {
    try {
      const [f, e, x, a] = await Promise.all([apiIa.fontes(id), apiIa.evidencias(id), apiIa.execucoes(id), apiIa.agentes()]);
      setFontes(f);
      setEvidencias(e);
      setExecucoes(x);
      setConfigurado(a.agentes.some((c) => c.agente === 'padrao' && c.provedorId && c.modelo.trim()));
      rodandoAntes.current = new Set(x.filter((y) => y.status === 'rodando').map((y) => y.id));
    } catch (erro) {
      avisar(mensagemDe(erro), 'erro');
    }
  }, [id, avisar]);

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  // Enquanto algum agente trabalha, acompanha o progresso.
  const rodando = execucoes.some((x) => x.status === 'rodando');
  useEffect(() => {
    if (!rodando) return;
    const intervalo = setInterval(async () => {
      try {
        const lista = await apiIa.execucoes(id);
        setExecucoes(lista);
        const terminadas = lista.filter((x) => x.status !== 'rodando' && rodandoAntes.current.has(x.id));
        if (terminadas.length) {
          for (const t of terminadas) {
            if (t.status === 'falhou') avisar(`${NOMES_EXECUCAO[t.tipo]} falhou: ${t.erro ?? ''}`, 'erro');
            else avisar(`${NOMES_EXECUCAO[t.tipo]} terminou.`, 'sucesso');
          }
          const [f, e] = await Promise.all([apiIa.fontes(id), apiIa.evidencias(id)]);
          setFontes(f);
          setEvidencias(e);
        }
        rodandoAntes.current = new Set(lista.filter((x) => x.status === 'rodando').map((x) => x.id));
      } catch {
        // Uma falha de rede passageira não interrompe o acompanhamento.
      }
    }, 1500);
    return () => clearInterval(intervalo);
  }, [rodando, id, avisar]);

  const disparar = async (acao: () => Promise<Execucao>) => {
    setEnviando(true);
    try {
      const exec = await acao();
      rodandoAntes.current.add(exec.id);
      setExecucoes((x) => [exec, ...x]);
    } catch (e) {
      avisar(mensagemDe(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    } finally {
      setEnviando(false);
    }
  };

  const enviar = async (arquivos: File[]) => {
    if (!arquivos.length) return;
    try {
      const novas = await apiIa.enviarArquivos(id, arquivos);
      avisar(`${novas.length} ${novas.length === 1 ? 'fonte enviada' : 'fontes enviadas'}.`, 'sucesso');
    } catch (e) {
      avisar(mensagemDe(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    }
    setFontes(await apiIa.fontes(id));
  };

  const pendentes = fontes.filter((f) => f.evidencias === 0).length;

  return (
    <div className="aba-ia">
      {configurado === false && (
        <div className="faixa-info">
          Os agentes usam a sua chave de API. <a href="#/config">Cadastre um provedor e escolha o modelo padrão</a> antes de rodar.
        </div>
      )}

      <div className="ia-grade">
        <div className="coluna-principal">
          <Fontes
            fontes={fontes}
            id={id}
            aoEnviar={(a) => void enviar(a)}
            aoMudar={async () => setFontes(await apiIa.fontes(id))}
            aoLerDeNovo={(fonteId) => void disparar(() => apiIa.ler(id, [fonteId]))}
          />

          <div className="cartao secao">
            <div className="secao-cabecalho">
              <h2>Agentes</h2>
              <span className="suave pequeno">Cada um devolve uma proposta. Nada muda na matriz sem você aplicar.</span>
            </div>
            <div className="acao-agente">
              <div>
                <strong>Mapear</strong>
                <p className="suave pequeno">
                  {pendentes ? `Lê ${pendentes === 1 ? 'a fonte nova' : `as ${pendentes} fontes novas`} e ` : ''}
                  escreve a matriz a partir {evidencias.length || pendentes ? 'das evidências' : 'das fontes'}. Passa pelo portão e corrige sozinho até três vezes.
                </p>
                <textarea
                  className="entrada"
                  rows={2}
                  placeholder="Instruções (opcional): ex. só o fluxo de venda, sem o pós-venda; raias por área."
                  value={instrucoes}
                  onChange={(e) => setInstrucoes(e.target.value)}
                />
              </div>
              <button className="botao botao-primario" disabled={enviando || rodando || (!evidencias.length && !pendentes)} onClick={() => void disparar(() => apiIa.mapear(id, instrucoes))}>
                Mapear
              </button>
            </div>
            <div className="acao-agente">
              <div>
                <strong>Pedir mudança</strong>
                <p className="suave pequeno">Diga em português o que mudar. O Editor devolve as operações e a matriz nova.</p>
                <textarea
                  className="entrada"
                  rows={2}
                  placeholder="Ex.: depois de analisar o crédito, a gerência aprova pedidos acima de R$ 50 mil."
                  value={pedido}
                  onChange={(e) => setPedido(e.target.value)}
                />
              </div>
              <button
                className="botao botao-primario"
                disabled={enviando || rodando || pedido.trim().length < 3}
                onClick={() =>
                  void disparar(async () => {
                    const r = await apiIa.editar(id, pedido);
                    setPedido('');
                    return r;
                  })
                }
              >
                Propor
              </button>
            </div>
            <div className="acao-agente">
              <div>
                <strong>Revisar</strong>
                <p className="suave pequeno">Aponta lacunas, com a pergunta para fazer ao cliente, e linhas que pedem olho humano.</p>
              </div>
              <button className="botao" disabled={enviando || rodando} onClick={() => void disparar(() => apiIa.revisar(id))}>
                Revisar a v{versaoAtual}
              </button>
            </div>
          </div>

          <div className="cartao secao">
            <h2>Execuções</h2>
            {!execucoes.length && <p className="suave">Nenhuma ainda.</p>}
            <ol className="lista-execucoes">
              {execucoes.map((x) => (
                <ItemExecucao
                  key={x.id}
                  exec={x}
                  versaoAtual={versaoAtual}
                  aoRevisarProposta={aoRevisarProposta}
                  aoAplicar={async (forcar) => {
                    try {
                      const r = await apiIa.aplicar(x.id, forcar);
                      avisar(`A proposta virou a versão ${r.versao.numero}.`, 'sucesso');
                      setExecucoes(await apiIa.execucoes(id));
                      await aoAplicar();
                    } catch (e) {
                      if (e instanceof ErroApi && e.status === 409 && !forcar && window.confirm(`${e.message}\n\nAplicar mesmo assim?`)) {
                        const r = await apiIa.aplicar(x.id, true);
                        avisar(`A proposta virou a versão ${r.versao.numero}.`, 'sucesso');
                        setExecucoes(await apiIa.execucoes(id));
                        await aoAplicar();
                      } else if (!(e instanceof ErroApi && e.status === 409 && !forcar)) {
                        avisar(mensagemDe(e), 'erro');
                      }
                    }
                  }}
                />
              ))}
            </ol>
          </div>
        </div>

        <Evidencias evidencias={evidencias} />
      </div>
    </div>
  );
}

function Fontes({
  fontes,
  id,
  aoEnviar,
  aoMudar,
  aoLerDeNovo,
}: {
  fontes: Fonte[];
  id: string;
  aoEnviar: (a: File[]) => void;
  aoMudar: () => Promise<void>;
  aoLerDeNovo: (fonteId: string) => void;
}) {
  const avisar = useAvisos();
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [colando, setColando] = useState(false);
  const [nomeColado, setNomeColado] = useState('Anotações');
  const [textoColado, setTextoColado] = useState('');
  const [aberta, setAberta] = useState<{ id: string; texto: string } | null>(null);

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    aoEnviar([...e.dataTransfer.files]);
  };

  return (
    <div className="cartao secao">
      <div className="secao-cabecalho">
        <h2>Fontes</h2>
        <span className="suave pequeno">POPs, documentos e transcrições: PDF, DOCX, TXT, MD, VTT, SRT.</span>
      </div>
      <div
        className={`zona-envio ${arrastando ? 'zona-ativa' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
      >
        <span>Arraste arquivos aqui ou</span>
        <button className="botao" onClick={() => entrada.current?.click()}>
          Escolher arquivos
        </button>
        <button className="botao botao-fantasma" onClick={() => setColando((v) => !v)}>
          {colando ? 'Fechar' : 'Colar texto'}
        </button>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={ACEITOS}
          hidden
          onChange={(e) => {
            aoEnviar([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>
      {colando && (
        <div className="colar">
          <input className="entrada" value={nomeColado} onChange={(e) => setNomeColado(e.target.value)} aria-label="Nome da fonte" />
          <textarea className="entrada" rows={6} placeholder="Cole aqui anotações, a descrição do processo ou um trecho de transcrição." value={textoColado} onChange={(e) => setTextoColado(e.target.value)} />
          <button
            className="botao botao-primario"
            disabled={!textoColado.trim() || !nomeColado.trim()}
            onClick={async () => {
              try {
                await apiIa.colarTexto(id, nomeColado.trim(), textoColado);
                setTextoColado('');
                setColando(false);
                avisar('Texto adicionado como fonte.', 'sucesso');
                await aoMudar();
              } catch (e) {
                avisar(mensagemDe(e), 'erro');
              }
            }}
          >
            Adicionar fonte
          </button>
        </div>
      )}
      {fontes.length > 0 && (
        <table className="tabela">
          <thead>
            <tr>
              <th>Arquivo</th>
              <th className="num">Tamanho</th>
              <th className="num">Evidências</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {fontes.map((f) => (
              <tr key={f.id}>
                <td>
                  <button
                    className="link link-texto"
                    onClick={async () => setAberta(aberta?.id === f.id ? null : { id: f.id, texto: (await apiIa.fonte(id, f.id)).texto })}
                  >
                    {f.nome}
                  </button>
                  <div className="suave pequeno">
                    {f.tipo.toUpperCase()} · {f.caracteres.toLocaleString('pt-BR')} caracteres
                  </div>
                  {aberta?.id === f.id && <pre className="texto-fonte">{aberta.texto}</pre>}
                </td>
                <td className="num suave">{f.tamanho >= 1024 ? `${Math.round(f.tamanho / 1024)} KB` : `${f.tamanho} B`}</td>
                <td className="num">{f.evidencias ? f.evidencias : <span className="selo selo-aviso">não lida</span>}</td>
                <td className="acoes">
                  {f.evidencias > 0 && (
                    <button className="botao botao-fantasma" onClick={() => aoLerDeNovo(f.id)} title="As evidências desta fonte são trocadas; as chaves antigas não voltam.">
                      Ler de novo
                    </button>
                  )}
                  <button
                    className="botao botao-fantasma botao-perigo"
                    onClick={async () => {
                      if (!window.confirm(`Remover "${f.nome}" e as evidências tiradas dela?`)) return;
                      await apiIa.apagarFonte(id, f.id);
                      await aoMudar();
                    }}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Evidencias({ evidencias }: { evidencias: Evidencia[] }) {
  const [filtro, setFiltro] = useState('');
  const visiveis = filtro ? evidencias.filter((e) => `${e.chave} ${e.citacao} ${e.fonte}`.toLowerCase().includes(filtro.toLowerCase())) : evidencias;
  const naoConferidas = evidencias.filter((e) => !e.verificada).length;
  return (
    <aside className="cartao secao painel-evidencias" aria-label="Evidências">
      <div className="secao-cabecalho">
        <h2>Evidências</h2>
        <span className="suave pequeno">
          {evidencias.length}
          {naoConferidas ? ` · ${naoConferidas} não conferidas` : ''}
        </span>
      </div>
      {!evidencias.length && <p className="suave pequeno">Rode o Leitor (ou o Mapear) para tirar das fontes os trechos que dizem como o processo funciona.</p>}
      {evidencias.length > 8 && <input className="entrada" placeholder="Filtrar" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar evidências" />}
      <ol className="lista-evidencias">
        {visiveis.map((e) => (
          <li key={e.chave} id={`ev-${e.chave}`}>
            <div className="evidencia-cabecalho">
              <code>{e.chave}</code>
              <span className="selo">{ROTULOS_SOBRE[e.sobre] ?? e.sobre}</span>
              {!e.verificada && (
                <span className="selo selo-aviso" title="A citação não foi achada literalmente no texto da fonte.">
                  não conferida
                </span>
              )}
            </div>
            <q>{e.citacao}</q>
            <span className="suave pequeno">
              {e.fonte}
              {e.local ? ` · ${e.local}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

interface SaidaProposta {
  matriz: Matriz;
  validacao: ResultadoValidacao;
  rodadas: number;
  versaoBase: number;
  avisos?: string[];
  frases?: string[];
  resumo?: string;
  evidencias?: number;
}

interface SaidaRevisao {
  relatorio: { resumo: string; lacunas: Array<{ descricao: string; pergunta: string; chaves?: string[] }>; revisar: Array<{ chave: string; motivo: string }> };
  automaticos: string[];
  versao: number;
}

function ItemExecucao({
  exec: x,
  versaoAtual,
  aoRevisarProposta,
  aoAplicar,
}: {
  exec: Execucao;
  versaoAtual: number;
  aoRevisarProposta: (m: Matriz) => void;
  aoAplicar: (forcar: boolean) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(x.status !== 'concluida' || x.aplicadaNaVersao === null);
  const duracao = x.concluidoEm ? Math.round((new Date(x.concluidoEm).getTime() - new Date(x.criadoEm).getTime()) / 1000) : null;
  const proposta = (x.tipo === 'mapear' || x.tipo === 'editar') && x.status === 'concluida' ? (x.saida as unknown as SaidaProposta) : null;
  const revisao = x.tipo === 'revisar' && x.status === 'concluida' ? (x.saida as unknown as SaidaRevisao) : null;
  const pedido = x.tipo === 'editar' ? String((x.entrada as { pedido?: string } | null)?.pedido ?? '') : '';

  return (
    <li className={`execucao execucao-${x.status}`}>
      <button className="execucao-cabecalho" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <strong>{NOMES_EXECUCAO[x.tipo]}</strong>
        <span className={`selo ${x.status === 'concluida' ? 'selo-ok' : x.status === 'falhou' ? 'selo-erro' : 'selo-aviso'}`}>
          {x.status === 'rodando' ? 'trabalhando…' : x.status === 'concluida' ? 'concluída' : 'falhou'}
        </span>
        {x.aplicadaNaVersao !== null && <span className="selo selo-bpmn">virou a v{x.aplicadaNaVersao}</span>}
        <span className="suave pequeno">
          {formatarData(x.criadoEm)}
          {duracao !== null ? ` · ${duracao} s` : ''}
          {x.tokensEntrada + x.tokensSaida ? ` · ${formatarTokens(x.tokensEntrada + x.tokensSaida)} tokens` : ''}
          {x.custo !== null ? ` · ${formatarCusto(x.custo)}` : ''}
        </span>
      </button>
      {aberto && (
        <div className="execucao-corpo">
          {pedido && <p className="pequeno">Pedido: “{pedido}”</p>}
          {x.log.length > 0 && (
            <ol className="log">
              {x.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          )}
          {x.erro && <p className="faixa-erro">{x.erro}</p>}
          {proposta && (
            <div className="proposta">
              <p>
                <strong>Proposta:</strong> {proposta.matriz.etapas.length} etapas, {proposta.matriz.raias.length} raias ·{' '}
                {proposta.validacao.ok ? <span className="texto-ok">aprovada no portão</span> : <span className="texto-erro">o portão ainda acusa erros</span>}
                {proposta.rodadas > 1 ? ` · ${proposta.rodadas} rodadas` : ''} · feita sobre a v{proposta.versaoBase}
                {proposta.versaoBase !== versaoAtual ? ` (a atual é a v${versaoAtual})` : ''}
              </p>
              {proposta.resumo && <p className="pequeno">{proposta.resumo}</p>}
              {proposta.frases && (
                <ul className="pequeno">
                  {proposta.frases.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              {proposta.avisos?.length ? (
                <ul className="pequeno texto-aviso">
                  {proposta.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
              {x.aplicadaNaVersao === null && (
                <div className="barra-visao-acoes">
                  <button className="botao" onClick={() => aoRevisarProposta(proposta.matriz)}>
                    Revisar na Matriz
                  </button>
                  <button className="botao botao-primario" onClick={() => void aoAplicar(false)}>
                    Aplicar como v{versaoAtual + 1}
                  </button>
                </div>
              )}
            </div>
          )}
          {revisao && (
            <div className="proposta">
              <p>{revisao.relatorio.resumo}</p>
              {revisao.relatorio.lacunas.length > 0 && (
                <>
                  <strong className="pequeno">Lacunas: perguntas para o cliente</strong>
                  <ul className="pequeno">
                    {revisao.relatorio.lacunas.map((l, i) => (
                      <li key={i}>
                        {l.descricao}
                        <br />
                        <em>“{l.pergunta}”</em>
                        {l.chaves?.length ? <span className="suave"> ({l.chaves.join(', ')})</span> : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {revisao.relatorio.revisar.length > 0 && (
                <>
                  <strong className="pequeno">Linhas para revisar</strong>
                  <ul className="pequeno">
                    {revisao.relatorio.revisar.map((r) => (
                      <li key={r.chave}>
                        <code>{r.chave}</code> {r.motivo}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {revisao.automaticos.length > 0 && (
                <>
                  <strong className="pequeno">Conferências automáticas</strong>
                  <ul className="pequeno">
                    {revisao.automaticos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
