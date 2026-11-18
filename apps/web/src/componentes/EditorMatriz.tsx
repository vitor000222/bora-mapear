import { Fragment, useMemo, useState } from 'react';
import {
  GRUPOS_TIPO,
  MatrizSchema,
  ROTULOS_TIPO,
  validarMatriz,
  type Etapa,
  type Matriz,
  type Problema,
  type Saida,
  type TipoEtapa,
} from '@bora-mapear/core';

interface Props {
  matriz: Matriz;
  sujo: boolean;
  proximaVersao: number;
  aoMudar: (m: Matriz) => void;
  aoDescartar: () => void;
  aoSalvar: (m: Matriz, mensagem: string) => Promise<void>;
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
function validarAoVivo(m: Matriz): { formato: string[]; problemas: Problema[] } {
  const r = MatrizSchema.safeParse(m);
  if (!r.success) {
    return {
      formato: r.error.issues.map((i) => {
        const [lista, indice, campo] = i.path;
        if (lista === 'etapas' && typeof indice === 'number') {
          return `Linha ${indice + 1} (${m.etapas[indice]?.chave ?? '?'}), ${String(campo ?? '')}: ${i.message}`;
        }
        return `${i.path.join('.')}: ${i.message}`;
      }),
      problemas: [],
    };
  }
  return { formato: [], problemas: validarMatriz(r.data).problemas };
}

export function EditorMatriz({ matriz: m, sujo, proximaVersao, aoMudar, aoDescartar, aoSalvar }: Props) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [destaque, setDestaque] = useState<string | null>(null);

  const { formato, problemas } = useMemo(() => validarAoVivo(m), [m]);
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
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(nova)) return 'Comece com letra; use letras, números, _ e -.';
    if (m.etapas.some((e) => e.chave === nova)) return `Já existe a chave ${nova}.`;
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
    if (erros > 0 && !window.confirm(`A matriz tem ${erros} ${erros === 1 ? 'erro' : 'erros'} no portão. Salvar como rascunho mesmo assim?`)) return;
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
          {sujo ? <strong>Mudanças não salvas</strong> : <span className="suave">Edite a matriz; o portão confere enquanto você digita.</span>}
        </div>
        <input
          className="entrada"
          placeholder="O que mudou? (opcional)"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          disabled={!sujo}
          aria-label="Mensagem da versão"
        />
        <button className="botao" onClick={aoDescartar} disabled={!sujo || salvando}>
          Descartar
        </button>
        <button className="botao botao-primario" onClick={() => void salvar()} disabled={!sujo || salvando}>
          {salvando ? 'Salvando…' : `Salvar versão ${proximaVersao}`}
        </button>
      </div>

      <div className="grade-editor">
        <div className="coluna-principal">
          <div className="cartao secao">
            <h2>Processo</h2>
            <div className="linha-campos">
              <label className="campo">
                <span>Nome</span>
                <input className="entrada" value={m.processo.nome} onChange={(e) => aoMudar({ ...m, processo: { ...m.processo, nome: e.target.value } })} />
              </label>
              <label className="campo">
                <span>Id</span>
                <input className="entrada mono" value={m.processo.id} onChange={(e) => aoMudar({ ...m, processo: { ...m.processo, id: e.target.value } })} />
              </label>
            </div>
          </div>

          <div className="cartao secao">
            <div className="secao-cabecalho">
              <h2>Raias</h2>
              <span className="suave pequeno">De cima para baixo. Raia é função, não pessoa.</span>
            </div>
            <ol className="lista-raias">
              {m.raias.map((r, i) => (
                <li key={r.id}>
                  <input
                    className="entrada"
                    value={r.nome}
                    aria-label={`Nome da raia ${i + 1}`}
                    onChange={(e) => aoMudar({ ...m, raias: m.raias.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })}
                  />
                  <span className="mono suave pequeno">{r.id}</span>
                  <button className="icone" title="Subir" aria-label="Subir raia" onClick={() => aoMudar({ ...m, raias: mover(m.raias, i, i - 1) })} disabled={i === 0}>
                    ↑
                  </button>
                  <button
                    className="icone"
                    title="Descer"
                    aria-label="Descer raia"
                    onClick={() => aoMudar({ ...m, raias: mover(m.raias, i, i + 1) })}
                    disabled={i === m.raias.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    className="icone icone-perigo"
                    title={usadas.has(r.id) ? 'Tem etapas nesta raia: mude-as de raia antes' : 'Remover raia'}
                    aria-label="Remover raia"
                    onClick={() => aoMudar({ ...m, raias: m.raias.filter((_, j) => j !== i) })}
                    disabled={usadas.has(r.id) || m.raias.length === 1}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <button className="botao botao-fantasma" onClick={() => aoMudar({ ...m, raias: [...m.raias, { id: proximoIdRaia(m), nome: `Raia ${m.raias.length + 1}` }] })}>
              + Raia
            </button>
          </div>

          <div className="cartao secao">
            <div className="secao-cabecalho">
              <h2>Etapas</h2>
              <span className="suave pequeno">
                Em <em>Próximos</em>, escreva as chaves de destino separadas por vírgula; numa decisão, com o rótulo: <code>E04: Sim, E10: Não</code>.
              </span>
            </div>
            <div className="rolagem-x">
              <table className="tabela tabela-matriz">
                <thead>
                  <tr>
                    <th aria-label="Detalhes" />
                    <th>Chave</th>
                    <th>Tipo</th>
                    <th>Nome</th>
                    <th>Raia</th>
                    <th>Sistema</th>
                    <th>Próximos</th>
                    <th aria-label="Ações" />
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
                            <button className="icone" aria-expanded={aberta} aria-label="Detalhes da etapa" onClick={() => alternar(e.chave)}>
                              {aberta ? '▾' : '▸'}
                            </button>
                          </td>
                          <td>
                            <CampoChave valor={e.chave} aoConfirmar={(nova) => renomearChave(i, nova)} />
                          </td>
                          <td>
                            <select className="entrada" value={e.tipo} onChange={(ev) => atualizar(i, { tipo: ev.target.value as TipoEtapa })} aria-label="Tipo">
                              {GRUPOS_TIPO.map((g) => (
                                <optgroup key={g.grupo} label={g.grupo}>
                                  {g.tipos.map((t) => (
                                    <option key={t} value={t}>
                                      {ROTULOS_TIPO[t]}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="entrada entrada-nome" value={e.nome} onChange={(ev) => atualizar(i, { nome: ev.target.value })} aria-label="Nome" placeholder="Verbo + objeto" />
                          </td>
                          <td>
                            <select className="entrada" value={e.raia} onChange={(ev) => atualizar(i, { raia: ev.target.value })} aria-label="Raia">
                              {!m.raias.some((r) => r.id === e.raia) && <option value={e.raia}>{e.raia} (não existe)</option>}
                              {m.raias.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nome}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input className="entrada entrada-curta" value={e.sistema ?? ''} onChange={(ev) => atualizar(i, opcional('sistema', ev.target.value))} aria-label="Sistema" />
                          </td>
                          <td>
                            <CampoProximos valor={e.proximos} aoConfirmar={(proximos) => atualizar(i, { proximos })} />
                          </td>
                          <td className="acoes">
                            <button className="icone" aria-label="Subir etapa" title="Subir" onClick={() => etapas(mover(m.etapas, i, i - 1))} disabled={i === 0}>
                              ↑
                            </button>
                            <button className="icone" aria-label="Descer etapa" title="Descer" onClick={() => etapas(mover(m.etapas, i, i + 1))} disabled={i === m.etapas.length - 1}>
                              ↓
                            </button>
                            <button className="icone icone-perigo" aria-label="Remover etapa" title="Remover (e as setas que chegam nela)" onClick={() => remover(i)}>
                              ✕
                            </button>
                          </td>
                        </tr>
                        {aberta && (
                          <tr className="linha-detalhes">
                            <td />
                            <td colSpan={7}>
                              <Detalhes etapa={e} aoMudar={(campos) => atualizar(i, campos)} />
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
              + Etapa
            </button>
          </div>
        </div>

        <aside className="cartao secao painel-portao" aria-label="Portão">
          <h2>Portão</h2>
          {formato.length > 0 && (
            <>
              <p className="texto-erro">A matriz está fora do formato:</p>
              <ul className="lista-problemas">
                {formato.map((f) => (
                  <li key={f} className="erro">
                    {f}
                  </li>
                ))}
              </ul>
            </>
          )}
          {formato.length === 0 && problemas.length === 0 && <p className="texto-ok">Aprovada, sem avisos.</p>}
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
                  {inalcancaveis.length === 1 ? 'Uma etapa não tem' : `${inalcancaveis.length} etapas não têm`} caminho a partir de um início
                  (em geral, consequência de uma seta quebrada acima):{' '}
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
      title={erro ?? 'A chave prende as setas e as correções do desenho. Renomear atualiza as setas.'}
      aria-label="Chave"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function CampoProximos({ valor, aoConfirmar }: { valor: Saida[]; aoConfirmar: (s: Saida[]) => void }) {
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
      aria-label="Próximos"
      placeholder="E02"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => aoConfirmar(lerProximos(texto))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Detalhes({ etapa: e, aoMudar }: { etapa: Etapa; aoMudar: (campos: Partial<Etapa>) => void }) {
  return (
    <div className="detalhes">
      <label className="campo campo-largo">
        <span>Descrição</span>
        <textarea className="entrada" rows={2} value={e.descricao ?? ''} onChange={(ev) => aoMudar(opcional('descricao', ev.target.value))} />
      </label>
      <label className="campo">
        <span>Ator (se diferente da raia)</span>
        <input className="entrada" value={e.ator ?? ''} onChange={(ev) => aoMudar(opcional('ator', ev.target.value))} />
      </label>
      <label className="campo">
        <span>Regra</span>
        <input className="entrada" value={e.regra ?? ''} onChange={(ev) => aoMudar(opcional('regra', ev.target.value))} />
      </label>
      <label className="campo">
        <span>Entrada</span>
        <input className="entrada" value={e.entrada ?? ''} onChange={(ev) => aoMudar(opcional('entrada', ev.target.value))} />
      </label>
      <label className="campo">
        <span>Saída</span>
        <input className="entrada" value={e.saida ?? ''} onChange={(ev) => aoMudar(opcional('saida', ev.target.value))} />
      </label>
      <label className="campo">
        <span>Evidências</span>
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
        <span>Pede revisão humana</span>
      </label>
    </div>
  );
}
