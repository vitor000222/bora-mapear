import { Fragment, useMemo, useRef, useState } from 'react';
import {
  csvParaMatriz,
  ErroImportacao,
  gruposTipo,
  matrizParaCsv,
  MatrizSchema,
  rotulosTipo,
  validarMatriz,
  type Etapa,
  type Idioma,
  type Matriz,
  type Problema,
  type Saida,
  type TipoEtapa,
} from '@bora-mapear/core';
import { baixar, type ResumoMapeamento } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { useIdioma, useTextos, type Textos } from '../i18n/index.tsx';

interface Props {
  matriz: Matriz;
  sujo: boolean;
  proximaVersao: number;
  aoMudar: (m: Matriz) => void;
  aoDescartar: () => void;
  aoSalvar: (m: Matriz, mensagem: string) => Promise<void>;
  /** Para ligar subprocessos: o próprio mapeamento, os outros e os filhos já ligados. */
  idMapeamento: string;
  mapeamentos: ResumoMapeamento[];
  filhos: Record<string, { id: string; nome: string } | null>;
  aoCriarFilho: (chave: string) => Promise<void>;
}

/** "E04: Sim, E10: Não" ⇄ [{ para: 'E04', rotulo: 'Sim' }, …] */
export function formatarProximos(proximos: Saida[]): string {
  return proximos.map((s) => (s.rotulo ? `${s.para}: ${s.rotulo}` : s.para)).join(', ');
}

export function lerProximos(texto: string): Saida[] {
  return texto
    .split(/[,;]/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const i = parte.indexOf(':');
      if (i < 0) return { para: parte };
      const para = parte.slice(0, i).trim();
      const rotulo = parte.slice(i + 1).trim();
      return rotulo ? { para, rotulo } : { para };
    });
}

function proximaChave(etapas: Etapa[]): string {
  const numeros = etapas.map((e) => /^E(\d+)$/.exec(e.chave)?.[1]).filter(Boolean).map(Number);
  const n = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return `E${String(n).padStart(2, '0')}`;
}

function proximoIdRaia(m: Matriz): string {
  let n = m.raias.length + 1;
  while (m.raias.some((r) => r.id === `raia-${n}`)) n++;
  return `raia-${n}`;
}

function mover<T>(lista: T[], de: number, para: number): T[] {
  if (para < 0 || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item!);
  return nova;
}

/** Valida ao vivo: primeiro o formato (Zod), depois o portão. */
function validarAoVivo(m: Matriz, idioma: Idioma, t: Textos['matriz']): { formato: string[]; problemas: Problema[] } {
  const r = MatrizSchema.safeParse(m);
  if (!r.success) {
    return {
      formato: r.error.issues.map((i) => {
        const [lista, indice, campo] = i.path;
        // O esquema escreve a regra de chave e id em português; em inglês, a mensagem vem do dicionário.
        const mensagem = (i.code === 'invalid_format' && t.portao.formatoId) || i.message;
        if (lista === 'etapas' && typeof indice === 'number') {
          return t.portao.linha(indice + 1, m.etapas[indice]?.chave ?? '?', String(campo ?? ''), mensagem);
        }
        return `${i.path.join('.')}: ${mensagem}`;
      }),
      problemas: [],
    };
  }
  return { formato: [], problemas: validarMatriz(r.data, { idioma }).problemas };
}

export function EditorMatriz({ matriz: m, sujo, proximaVersao, aoMudar, aoDescartar, aoSalvar, idMapeamento, mapeamentos, filhos, aoCriarFilho }: Props) {
  const avisar = useAvisos();
  const { idioma } = useIdioma();
  const t = useTextos().matriz;
  const rotulos = rotulosTipo(idioma);
  const arquivoCsv = useRef<HTMLInputElement>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [destaque, setDestaque] = useState<string | null>(null);

  const { formato, problemas } = useMemo(() => validarAoVivo(m, idioma, t), [m, idioma, t]);
  const porChave = useMemo(() => {
    const mapa = new Map<string, Problema[]>();
    for (const p of problemas) if (p.chave) mapa.set(p.chave, [...(mapa.get(p.chave) ?? []), p]);
    return mapa;
  }, [problemas]);
  const erros = problemas.filter((p) => p.severidade === 'erro').length + formato.length;
  const inalcancaveis = problemas.filter((p) => p.codigo === 'INALCANCAVEL' && p.chave).map((p) => p.chave!);

  const etapas = (novas: Etapa[]) => aoMudar({ ...m, etapas: novas });
  const atualizar = (i: number, campos: Partial<Etapa>) => etapas(m.etapas.map((e, j) => (j === i ? { ...e, ...campos } : e)));

  const renomearChave = (i: number, nova: string): string | null => {
    const antiga = m.etapas[i]!.chave;
    if (nova === antiga) return null;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(nova)) return t.chave.formatoInvalido;
    if (m.etapas.some((e) => e.chave === nova)) return t.chave.jaExiste(nova);
    etapas(
      m.etapas.map((e, j) => ({
        ...e,
        chave: j === i ? nova : e.chave,
        proximos: e.proximos.map((s) => (s.para === antiga ? { ...s, para: nova } : s)),
      })),
    );
    return null;
  };

  const remover = (i: number) => {
    const chave = m.etapas[i]!.chave;
    etapas(
      m.etapas
        .filter((_, j) => j !== i)
        .map((e) => ({ ...e, proximos: e.proximos.filter((s) => s.para !== chave) })),
    );
  };

  const adicionar = () => {
    const nova: Etapa = { chave: proximaChave(m.etapas), tipo: 'tarefa_usuario', nome: '', raia: m.raias[0]?.id ?? 'raia-1', proximos: [] };
    etapas([...m.etapas, nova]);
  };

  const alternar = (chave: string) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      return nova;
    });

  const salvar = async () => {
    if (erros > 0 && !window.confirm(t.barra.confirmarRascunho(erros))) return;
    setSalvando(true);
    await aoSalvar(m, mensagem.trim());
    setMensagem('');
    setSalvando(false);
  };

  const irPara = (chave: string) => {
    setDestaque(chave);
    document.getElementById(`linha-${chave}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setDestaque(null), 1600);
  };

  const usadas = new Set(m.etapas.map((e) => e.raia));

  return (
    <div className="editor-matriz">
      <div className="barra-salvar cartao">
        <div className="barra-salvar-texto">
          {sujo ? <strong>{t.barra.naoSalvas}</strong> : <span className="suave">{t.barra.dica}</span>}
        </div>
        <input
          className="entrada"
          placeholder={t.barra.mensagemPlaceholder}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          disabled={!sujo}
          aria-label={t.barra.mensagemRotulo}
        />
        <button className="botao" onClick={() => baixar(`${m.processo.id}.csv`, matrizParaCsv(m, { idioma }), 'text/csv;charset=utf-8')} title={t.barra.exportarCsvTitulo}>
          {t.barra.exportarCsv}
        </button>
        <button className="botao" onClick={() => arquivoCsv.current?.click()} title={t.barra.importarCsvTitulo}>
          {t.barra.importarCsv}
        </button>
        <input
          ref={arquivoCsv}
          type="file"
          accept=".csv,.tsv,.txt"
          hidden
          onChange={async (ev) => {
            const arquivo = ev.target.files?.[0];
            ev.target.value = '';
            if (!arquivo) return;
            try {
              const r = csvParaMatriz(await arquivo.text(), m.processo.nome, { idioma });
              aoMudar({ ...r.matriz, processo: m.processo });
              avisar(t.barra.planilhaLida(r.matriz.etapas.length), r.avisos.length ? 'info' : 'sucesso', r.avisos);
            } catch (e) {
              avisar(e instanceof ErroImportacao ? e.message : t.barra.planilhaFalhou(e instanceof Error ? e.message : String(e)), 'erro');
            }
          }}
        />
        <button className="botao" onClick={aoDescartar} disabled={!sujo || salvando}>
          {t.barra.descartar}
        </button>
        <button className="botao botao-primario" onClick={() => void salvar()} disabled={!sujo || salvando}>
          {salvando ? t.barra.salvando : t.barra.salvarVersao(proximaVersao)}
        </button>
      </div>

      <div className="grade-editor">
        <div className="coluna-principal">
          <div className="cartao secao">
            <h2>{t.processo.titulo}</h2>
            <div className="linha-campos">
              <label className="campo">
                <span>{t.processo.nome}</span>
                <input className="entrada" value={m.processo.nome} onChange={(e) => aoMudar({ ...m, processo: { ...m.processo, nome: e.target.value } })} />
              </label>
              <label className="campo">
                <span>{t.processo.id}</span>
                <input className="entrada mono" value={m.processo.id} onChange={(e) => aoMudar({ ...m, processo: { ...m.processo, id: e.target.value } })} />
              </label>
            </div>
          </div>

          <div className="cartao secao">
            <div className="secao-cabecalho">
              <h2>{t.raias.titulo}</h2>
              <span className="suave pequeno">{t.raias.dica}</span>
            </div>
            <ol className="lista-raias">
              {m.raias.map((r, i) => (
                <li key={r.id}>
                  <input
                    className="entrada"
                    value={r.nome}
                    aria-label={t.raias.nomeDaRaia(i + 1)}
                    onChange={(e) => aoMudar({ ...m, raias: m.raias.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                  />
                  <span className="mono suave pequeno">{r.id}</span>
                  <button className="icone" title={t.raias.subir} aria-label={t.raias.subirRaia} onClick={() => aoMudar({ ...m, raias: mover(m.raias, i, i - 1) })} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    className="icone"
                    title={t.raias.descer}
                    aria-label={t.raias.descerRaia}
                    onClick={() => aoMudar({ ...m, raias: mover(m.raias, i, i + 1) })}
                    disabled={i === m.raias.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    className="icone icone-perigo"
                    title={usadas.has(r.id) ? t.raias.temEtapas : t.raias.removerRaia}
                    aria-label={t.raias.removerRaia}
                    onClick={() => aoMudar({ ...m, raias: m.raias.filter((_, j) => j !== i) })}
                    disabled={usadas.has(r.id) || m.raias.length === 1}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <button className="botao botao-fantasma" onClick={() => aoMudar({ ...m, raias: [...m.raias, { id: proximoIdRaia(m), nome: t.raias.nomePadrao(m.raias.length + 1) }] })}>
              {t.raias.adicionar}
            </button>
          </div>

          <div className="cartao secao">
            <div className="secao-cabecalho">
              <h2>{t.etapas.titulo}</h2>
              <span className="suave pequeno">
                {t.etapas.dicaAntes}
                <em>{t.etapas.dicaProximos}</em>
                {t.etapas.dicaMeio}
                <code>{t.etapas.dicaExemplo}</code>
                {t.etapas.dicaDepois}
              </span>
            </div>
            <div className="rolagem-x">
              <table className="tabela tabela-matriz">
                <thead>
                  <tr>
                    <th aria-label={t.etapas.colunas.detalhes} />
                    <th>{t.etapas.colunas.chave}</th>
                    <th>{t.etapas.colunas.tipo}</th>
                    <th>{t.etapas.colunas.nome}</th>
                    <th>{t.etapas.colunas.raia}</th>
                    <th>{t.etapas.colunas.sistema}</th>
                    <th>{t.etapas.colunas.proximos}</th>
                    <th aria-label={t.etapas.colunas.acoes} />
                  </tr>
                </thead>
                <tbody>
                  {m.etapas.map((e, i) => {
                    const probs = porChave.get(e.chave) ?? [];
                    const temErro = probs.some((p) => p.severidade === 'erro');
                    const aberta = abertas.has(e.chave);
                    return (
                      <Fragment key={`${i}-${e.chave}`}>
                        <tr
                          id={`linha-${e.chave}`}
                          className={[temErro ? 'linha-erro' : probs.length ? 'linha-aviso' : '', destaque === e.chave ? 'linha-destaque' : ''].join(' ')}
                          title={probs.map((p) => p.mensagem).join('\n') || undefined}
                        >
                          <td>
                            <button className="icone" aria-expanded={aberta} aria-label={t.etapas.detalhesDaEtapa} onClick={() => alternar(e.chave)}>
                              {aberta ? '▾' : '▸'}
                            </button>
                          </td>
                          <td>
                            <CampoChave valor={e.chave} aoConfirmar={(nova) => renomearChave(i, nova)} />
                          </td>
                          <td>
                            <select className="entrada" value={e.tipo} onChange={(ev) => atualizar(i, { tipo: ev.target.value as TipoEtapa })} aria-label={t.etapas.colunas.tipo}>
                              {gruposTipo(idioma).map((g) => (
                                <optgroup key={g.grupo} label={g.grupo}>
                                  {g.tipos.map((tipo) => (
                                    <option key={tipo} value={tipo}>
                                      {rotulos[tipo]}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="entrada entrada-nome" value={e.nome} onChange={(ev) => atualizar(i, { nome: ev.target.value })} aria-label={t.etapas.colunas.nome} placeholder={t.etapas.nomePlaceholder} />
                          </td>
                          <td>
                            <select className="entrada" value={e.raia} onChange={(ev) => atualizar(i, { raia: ev.target.value })} aria-label={t.etapas.colunas.raia}>
                              {!m.raias.some((r) => r.id === e.raia) && <option value={e.raia}>{t.etapas.raiaInexistente(e.raia)}</option>}
                              {m.raias.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="entrada entrada-curta" value={e.sistema ?? ''} onChange={(ev) => atualizar(i, opcional('sistema', ev.target.value))} aria-label={t.etapas.colunas.sistema} />
                          </td>
                          <td>
                            <CampoProximos valor={e.proximos} aoConfirmar={(proximos) => atualizar(i, { proximos })} />
                          </td>
                          <td className="acoes">
                            <button className="icone" aria-label={t.etapas.subirEtapa} title={t.raias.subir} onClick={() => etapas(mover(m.etapas, i, i - 1))} disabled={i === 0}>
                              ↑
                            </button>
                            <button className="icone" aria-label={t.etapas.descerEtapa} title={t.raias.descer} onClick={() => etapas(mover(m.etapas, i, i + 1))} disabled={i === m.etapas.length - 1}>
                              ↓
                            </button>
                            <button className="icone icone-perigo" aria-label={t.etapas.removerEtapa} title={t.etapas.removerTitulo} onClick={() => remover(i)}>
                              ✕
                            </button>
                          </td>
                        </tr>
                        {aberta && (
                          <tr className="linha-detalhes">
                            <td />
                            <td colSpan={7}>
                              <Detalhes etapa={e} aoMudar={(campos) => atualizar(i, campos)} />
                              {e.tipo === 'subprocesso' && (
                                <VinculoSubprocesso
                                  etapa={e}
                                  sujo={sujo}
                                  filho={filhos[e.chave]}
                                  opcoes={mapeamentos.filter((x) => x.id !== idMapeamento)}
                                  aoLigar={(id) => atualizar(i, { subprocesso: id || undefined })}
                                  aoCriar={() => aoCriarFilho(e.chave)}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="botao botao-fantasma" onClick={adicionar}>
              {t.etapas.adicionar}
            </button>
          </div>
        </div>

        <aside className="cartao secao painel-portao" aria-label={t.portao.titulo}>
          <h2>{t.portao.titulo}</h2>
          {formato.length > 0 && (
            <>
              <p className="texto-erro">{t.portao.foraDoFormato}</p>
              <ul className="lista-problemas">
                {formato.map((f) => (
                  <li key={f} className="erro">
                    {f}
                  </li>
                ))}
              </ul>
            </>
          )}
          {formato.length === 0 && problemas.length === 0 && <p className="texto-ok">{t.portao.aprovada}</p>}
          {problemas.length > 0 && (
            <ul className="lista-problemas">
              {[...problemas.filter((p) => p.severidade === 'erro'), ...problemas.filter((p) => p.severidade === 'aviso')]
                .filter((p) => p.codigo !== 'INALCANCAVEL')
                .map((p, k) => (
                  <li key={k} className={p.severidade}>
                    {p.chave ? (
                      <button className="link" onClick={() => irPara(p.chave!)}>
                        {p.chave}
                      </button>
                    ) : null}{' '}
                    {p.mensagem}
                  </li>
                ))}
              {inalcancaveis.length > 0 && (
                <li className="erro">
                  {t.portao.inalcancaveis(inalcancaveis.length)}{' '}
                  {inalcancaveis.map((c, k) => (
                    <Fragment key={c}>
                      {k > 0 && ', '}
                      <button className="link" onClick={() => irPara(c)}>
                        {c}
                      </button>
                    </Fragment>
                  ))}
                </li>
              )}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Campo opcional: vazio vira ausente, para não gravar string vazia na matriz. */
function opcional<K extends 'sistema' | 'descricao' | 'ator' | 'entrada' | 'saida' | 'regra'>(campo: K, valor: string): Partial<Etapa> {
  return { [campo]: valor.trim() ? valor : undefined } as Partial<Etapa>;
}

function CampoChave({ valor, aoConfirmar }: { valor: string; aoConfirmar: (nova: string) => string | null }) {
  const t = useTextos().matriz;
  const [texto, setTexto] = useState(valor);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState(valor);
  if (valor !== ultimo) {
    setUltimo(valor);
    setTexto(valor);
  }
  const confirmar = () => {
    const problema = aoConfirmar(texto.trim());
    setErro(problema);
    if (problema) setTexto(valor);
  };
  return (
    <input
      className={`entrada mono entrada-chave ${erro ? 'entrada-invalida' : ''}`}
      value={texto}
      title={erro ?? t.chave.titulo}
      aria-label={t.etapas.colunas.chave}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function CampoProximos({ valor, aoConfirmar }: { valor: Saida[]; aoConfirmar: (s: Saida[]) => void }) {
  const t = useTextos().matriz;
  const formatado = formatarProximos(valor);
  const [texto, setTexto] = useState(formatado);
  const [ultimo, setUltimo] = useState(formatado);
  if (formatado !== ultimo) {
    setUltimo(formatado);
    setTexto(formatado);
  }
  return (
    <input
      className="entrada mono entrada-proximos"
      value={texto}
      aria-label={t.etapas.colunas.proximos}
      placeholder="E02"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => aoConfirmar(lerProximos(texto))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Detalhes({ etapa: e, aoMudar }: { etapa: Etapa; aoMudar: (campos: Partial<Etapa>) => void }) {
  const t = useTextos().matriz.detalhes;
  return (
    <div className="detalhes">
      <label className="campo campo-largo">
        <span>{t.descricao}</span>
        <textarea className="entrada" rows={2} value={e.descricao ?? ''} onChange={(ev) => aoMudar(opcional('descricao', ev.target.value))} />
      </label>
      <label className="campo">
        <span>{t.ator}</span>
        <input className="entrada" value={e.ator ?? ''} onChange={(ev) => aoMudar(opcional('ator', ev.target.value))} />
      </label>
      <label className="campo">
        <span>{t.regra}</span>
        <input className="entrada" value={e.regra ?? ''} onChange={(ev) => aoMudar(opcional('regra', ev.target.value))} />
      </label>
      <label className="campo">
        <span>{t.entrada}</span>
        <input className="entrada" value={e.entrada ?? ''} onChange={(ev) => aoMudar(opcional('entrada', ev.target.value))} />
      </label>
      <label className="campo">
        <span>{t.saida}</span>
        <input className="entrada" value={e.saida ?? ''} onChange={(ev) => aoMudar(opcional('saida', ev.target.value))} />
      </label>
      <label className="campo">
        <span>{t.evidencias}</span>
        <input
          className="entrada mono"
          placeholder="EV-001, EV-002"
          value={(e.evidencias ?? []).join(', ')}
          onChange={(ev) => {
            const lista = ev.target.value.split(',').map((s) => s.trim()).filter(Boolean);
            aoMudar({ evidencias: lista.length ? lista : undefined });
          }}
        />
      </label>
      <label className="campo campo-check">
        <input type="checkbox" checked={e.revisarHumano ?? false} onChange={(ev) => aoMudar({ revisarHumano: ev.target.checked || undefined })} />
        <span>{t.revisarHumano}</span>
      </label>
    </div>
  );
}

function VinculoSubprocesso({
  etapa,
  sujo,
  filho,
  opcoes,
  aoLigar,
  aoCriar,
}: {
  etapa: Etapa;
  sujo: boolean;
  filho: { id: string; nome: string } | null | undefined;
  opcoes: ResumoMapeamento[];
  aoLigar: (id: string) => void;
  aoCriar: () => Promise<void>;
}) {
  const t = useTextos().matriz.subprocesso;
  const [criando, setCriando] = useState(false);
  const ligado = etapa.subprocesso ? (filho ?? opcoes.find((o) => o.id === etapa.subprocesso) ?? null) : null;
  return (
    <div className="vinculo-subprocesso">
      <strong className="pequeno">{t.titulo}</strong>
      {etapa.subprocesso && ligado && (
        <span>
          {t.detalhadoEm}{' '}
          <a href={`#/m/${ligado.id}`} className="link-forte">
            {ligado.nome}
          </a>
          {t.abrirNoDesenho}
        </span>
      )}
      {etapa.subprocesso && !ligado && <span className="texto-aviso">{t.naoExisteMais}</span>}
      <select className="entrada" value={etapa.subprocesso ?? ''} onChange={(ev) => aoLigar(ev.target.value)} aria-label={t.titulo}>
        <option value="">{t.nenhum}</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      {!etapa.subprocesso && (
        <button
          className="botao"
          disabled={sujo || criando}
          title={sujo ? t.salveAntes : t.criaEmBranco}
          onClick={async () => {
            setCriando(true);
            await aoCriar();
            setCriando(false);
          }}
        >
          {criando ? t.criando : t.criar}
        </button>
      )}
    </div>
  );
}
