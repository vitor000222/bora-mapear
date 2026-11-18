import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { Matriz, ResultadoValidacao } from '@bora-mapear/core';
import { apiIa, ErroApi, formatarCusto, formatarData, formatarTokens, type Evidencia, type Execucao, type Fonte } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { localDoIdioma, textos, useTextos } from '../i18n/index.tsx';

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
  const t = useTextos().ia;
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
          // Lido a cada volta, e não do `t` do render, para seguir uma troca de idioma.
          const tx = textos().ia;
          for (const x of terminadas) {
            if (x.status === 'falhou') avisar(tx.avisos.falhou(tx.agentes[x.tipo], x.erro ?? ''), 'erro');
            else avisar(tx.avisos.terminou(tx.agentes[x.tipo]), 'sucesso');
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
      avisar(t.avisos.fontesEnviadas(novas.length), 'sucesso');
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
          {t.semChave.antes}
          <a href="#/config">{t.semChave.link}</a>
          {t.semChave.depois}
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
              <h2>{t.agentesSecao.titulo}</h2>
              <span className="suave pequeno">{t.agentesSecao.subtitulo}</span>
            </div>
            <div className="acao-agente">
              <div>
                <strong>{t.agentesSecao.mapear.titulo}</strong>
                <p className="suave pequeno">{t.agentesSecao.mapear.descricao(pendentes, Boolean(evidencias.length || pendentes))}</p>
                <textarea
                  className="entrada"
                  rows={2}
                  placeholder={t.agentesSecao.mapear.instrucoes}
                  value={instrucoes}
                  onChange={(e) => setInstrucoes(e.target.value)}
                />
              </div>
              <button className="botao botao-primario" disabled={enviando || rodando || (!evidencias.length && !pendentes)} onClick={() => void disparar(() => apiIa.mapear(id, instrucoes))}>
                {t.agentesSecao.mapear.botao}
              </button>
            </div>
            <div className="acao-agente">
              <div>
                <strong>{t.agentesSecao.editar.titulo}</strong>
                <p className="suave pequeno">{t.agentesSecao.editar.descricao}</p>
                <textarea
                  className="entrada"
                  rows={2}
                  placeholder={t.agentesSecao.editar.exemplo}
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
                {t.agentesSecao.editar.botao}
              </button>
            </div>
            <div className="acao-agente">
              <div>
                <strong>{t.agentesSecao.revisar.titulo}</strong>
                <p className="suave pequeno">{t.agentesSecao.revisar.descricao}</p>
              </div>
              <button className="botao" disabled={enviando || rodando} onClick={() => void disparar(() => apiIa.revisar(id))}>
                {t.agentesSecao.revisar.botao(versaoAtual)}
              </button>
            </div>
          </div>

          <div className="cartao secao">
            <h2>{t.execucoes.titulo}</h2>
            {!execucoes.length && <p className="suave">{t.execucoes.nenhuma}</p>}
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
                      avisar(t.avisos.propostaAplicada(r.versao.numero), 'sucesso');
                      setExecucoes(await apiIa.execucoes(id));
                      await aoAplicar();
                    } catch (e) {
                      if (e instanceof ErroApi && e.status === 409 && !forcar && window.confirm(t.avisos.aplicarMesmoAssim(e.message))) {
                        const r = await apiIa.aplicar(x.id, true);
                        avisar(t.avisos.propostaAplicada(r.versao.numero), 'sucesso');
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
  const t = useTextos().ia.fontes;
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [colando, setColando] = useState(false);
  const [nomeColado, setNomeColado] = useState(t.nomePadrao);
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
        <h2>{t.titulo}</h2>
        <span className="suave pequeno">{t.subtitulo}</span>
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
        <span>{t.arraste}</span>
        <button className="botao" onClick={() => entrada.current?.click()}>
          {t.escolher}
        </button>
        <button className="botao botao-fantasma" onClick={() => setColando((v) => !v)}>
          {colando ? t.fechar : t.colarTexto}
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
          <input className="entrada" value={nomeColado} onChange={(e) => setNomeColado(e.target.value)} aria-label={t.nomeDaFonte} />
          <textarea className="entrada" rows={6} placeholder={t.colarAqui} value={textoColado} onChange={(e) => setTextoColado(e.target.value)} />
          <button
            className="botao botao-primario"
            disabled={!textoColado.trim() || !nomeColado.trim()}
            onClick={async () => {
              try {
                await apiIa.colarTexto(id, nomeColado.trim(), textoColado);
                setTextoColado('');
                setColando(false);
                avisar(t.textoAdicionado, 'sucesso');
                await aoMudar();
              } catch (e) {
                avisar(mensagemDe(e), 'erro');
              }
            }}
          >
            {t.adicionar}
          </button>
        </div>
      )}
      {fontes.length > 0 && (
        <table className="tabela">
          <thead>
            <tr>
              <th>{t.colunas.arquivo}</th>
              <th className="num">{t.colunas.tamanho}</th>
              <th className="num">{t.colunas.evidencias}</th>
              <th aria-label={t.colunas.acoes} />
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
                    {f.tipo.toUpperCase()} · {f.caracteres.toLocaleString(localDoIdioma())} {t.caracteres}
                  </div>
                  {aberta?.id === f.id && <pre className="texto-fonte">{aberta.texto}</pre>}
                </td>
                <td className="num suave">{f.tamanho >= 1024 ? `${Math.round(f.tamanho / 1024)} KB` : `${f.tamanho} B`}</td>
                <td className="num">{f.evidencias ? f.evidencias : <span className="selo selo-aviso">{t.naoLida}</span>}</td>
                <td className="acoes">
                  {f.evidencias > 0 && (
                    <button className="botao botao-fantasma" onClick={() => aoLerDeNovo(f.id)} title={t.lerDeNovoDica}>
                      {t.lerDeNovo}
                    </button>
                  )}
                  <button
                    className="botao botao-fantasma botao-perigo"
                    onClick={async () => {
                      if (!window.confirm(t.confirmarRemover(f.nome))) return;
                      await apiIa.apagarFonte(id, f.id);
                      await aoMudar();
                    }}
                  >
                    {t.remover}
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
  const textosIa = useTextos().ia;
  const t = textosIa.evidencias;
  const rotulosSobre: Record<string, string> = textosIa.sobre;
  const [filtro, setFiltro] = useState('');
  const visiveis = filtro ? evidencias.filter((e) => `${e.chave} ${e.citacao} ${e.fonte}`.toLowerCase().includes(filtro.toLowerCase())) : evidencias;
  const naoConferidas = evidencias.filter((e) => !e.verificada).length;
  return (
    <aside className="cartao secao painel-evidencias" aria-label={t.titulo}>
      <div className="secao-cabecalho">
        <h2>{t.titulo}</h2>
        <span className="suave pequeno">
          {evidencias.length}
          {naoConferidas ? t.naoConferidas(naoConferidas) : ''}
        </span>
      </div>
      {!evidencias.length && <p className="suave pequeno">{t.vazio}</p>}
      {evidencias.length > 8 && <input className="entrada" placeholder={t.filtrar} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label={t.filtrarRotulo} />}
      <ol className="lista-evidencias">
        {visiveis.map((e) => (
          <li key={e.chave} id={`ev-${e.chave}`}>
            <div className="evidencia-cabecalho">
              <code>{e.chave}</code>
              <span className="selo">{rotulosSobre[e.sobre] ?? e.sobre}</span>
              {!e.verificada && (
                <span className="selo selo-aviso" title={t.naoConferidaDica}>
                  {t.naoConferida}
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
  const textosIa = useTextos().ia;
  const t = textosIa.execucoes;
  const [aberto, setAberto] = useState(x.status !== 'concluida' || x.aplicadaNaVersao === null);
  const duracao = x.concluidoEm ? Math.round((new Date(x.concluidoEm).getTime() - new Date(x.criadoEm).getTime()) / 1000) : null;
  const proposta = (x.tipo === 'mapear' || x.tipo === 'editar' || x.tipo === 'converter') && x.status === 'concluida' ? (x.saida as unknown as SaidaProposta) : null;
  const revisao = x.tipo === 'revisar' && x.status === 'concluida' ? (x.saida as unknown as SaidaRevisao) : null;
  const pedido = x.tipo === 'editar' ? String((x.entrada as { pedido?: string } | null)?.pedido ?? '') : '';

  return (
    <li className={`execucao execucao-${x.status}`}>
      <button className="execucao-cabecalho" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <strong>{textosIa.agentes[x.tipo]}</strong>
        <span className={`selo ${x.status === 'concluida' ? 'selo-ok' : x.status === 'falhou' ? 'selo-erro' : 'selo-aviso'}`}>{t.status[x.status]}</span>
        {x.aplicadaNaVersao !== null && <span className="selo selo-bpmn">{t.virouVersao(x.aplicadaNaVersao)}</span>}
        <span className="suave pequeno">
          {formatarData(x.criadoEm)}
          {duracao !== null ? ` · ${duracao} s` : ''}
          {x.tokensEntrada + x.tokensSaida ? ` · ${formatarTokens(x.tokensEntrada + x.tokensSaida)} tokens` : ''}
          {x.custo !== null ? ` · ${formatarCusto(x.custo)}` : ''}
        </span>
      </button>
      {aberto && (
        <div className="execucao-corpo">
          {pedido && (
            <p className="pequeno">
              {t.pedido} “{pedido}”
            </p>
          )}
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
                <strong>{t.proposta.rotulo}</strong> {t.proposta.tamanho(proposta.matriz.etapas.length, proposta.matriz.raias.length)} ·{' '}
                {proposta.validacao.ok ? <span className="texto-ok">{t.proposta.aprovada}</span> : <span className="texto-erro">{t.proposta.reprovada}</span>}
                {proposta.rodadas > 1 ? t.proposta.rodadas(proposta.rodadas) : ''}
                {t.proposta.feitaSobre(proposta.versaoBase)}
                {proposta.versaoBase !== versaoAtual ? t.proposta.atual(versaoAtual) : ''}
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
                    {t.proposta.revisarNaMatriz}
                  </button>
                  <button className="botao botao-primario" onClick={() => void aoAplicar(false)}>
                    {t.proposta.aplicarComo(versaoAtual + 1)}
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
                  <strong className="pequeno">{t.revisao.lacunas}</strong>
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
                  <strong className="pequeno">{t.revisao.revisar}</strong>
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
                  <strong className="pequeno">{t.revisao.automaticos}</strong>
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
