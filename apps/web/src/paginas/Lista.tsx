import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { LINGUAGENS, type Linguagem } from '@bora-mapear/core';
import { api, descricaoLinguagem, ErroApi, formatarData, NOMES_LINGUAGEM, type ResumoMapeamento } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { Importar } from '../componentes/Importar.tsx';
import { useTextos } from '../i18n/index.tsx';

export function Lista() {
  const avisar = useAvisos();
  const t = useTextos().lista;
  const [itens, setItens] = useState<ResumoMapeamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const dialogoImportar = useRef<HTMLDialogElement>(null);

  const carregar = () =>
    api
      .listar()
      .then((l) => (setItens(l), setErro(null)))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void carregar();
  }, []);

  const apagar = async (m: ResumoMapeamento) => {
    if (!window.confirm(t.apagar.confirmar(m.nome))) return;
    try {
      await api.apagar(m.id);
      avisar(t.apagar.apagado(m.nome), 'sucesso');
      void carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };

  return (
    <section className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>{t.pagina.titulo}</h1>
          <p className="suave">{t.pagina.subtitulo}</p>
        </div>
        <div className="barra-visao-acoes">
          <button className="botao" onClick={() => dialogoImportar.current?.showModal()}>
            {t.pagina.importar}
          </button>
          <button className="botao botao-primario" onClick={() => dialogo.current?.showModal()}>
            {t.pagina.novo}
          </button>
        </div>
      </div>

      {erro && (
        <div className="cartao estado-erro">
          <strong>{t.pagina.erroCarregar}</strong>
          <p>{erro}</p>
          <button className="botao" onClick={() => void carregar()}>
            {t.pagina.tentarDeNovo}
          </button>
        </div>
      )}
      {!erro && itens === null && <div className="cartao estado-carregando">{t.pagina.carregando}</div>}
      {!erro && itens?.length === 0 && (
        <div className="cartao estado-vazio">
          <h2>{t.pagina.vazioTitulo}</h2>
          <p className="suave">{t.pagina.vazioTexto}</p>
          <button className="botao botao-primario" onClick={() => dialogo.current?.showModal()}>
            {t.pagina.criarPrimeiro}
          </button>
        </div>
      )}
      {itens && itens.length > 0 && (
        <div className="cartao">
          <table className="tabela">
            <thead>
              <tr>
                <th>{t.tabela.nome}</th>
                <th>{t.tabela.linguagem}</th>
                <th className="num">{t.tabela.etapas}</th>
                <th className="num col-versao">{t.tabela.versao}</th>
                <th>{t.tabela.atualizado}</th>
                <th aria-label={t.tabela.acoes} />
              </tr>
            </thead>
            <tbody>
              {itens.map((m) => (
                <tr key={m.id}>
                  <td>
                    <a href={`#/m/${m.id}`} className="link-forte">
                      {m.nome}
                    </a>
                    {m.descricao && <div className="suave pequeno">{m.descricao}</div>}
                  </td>
                  <td>
                    <span className={`selo selo-${m.linguagem}`}>{NOMES_LINGUAGEM[m.linguagem]}</span>
                  </td>
                  <td className="num">{m.etapas}</td>
                  <td className="num col-versao">v{m.versaoAtual}</td>
                  <td className="suave">{formatarData(m.atualizadoEm)}</td>
                  <td className="acoes">
                    <button className="botao botao-fantasma botao-perigo" onClick={() => void apagar(m)}>
                      {t.tabela.apagar}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NovoMapeamento dialogo={dialogo} />
      <Importar dialogo={dialogoImportar} />
    </section>
  );
}

function NovoMapeamento({ dialogo }: { dialogo: RefObject<HTMLDialogElement | null> }) {
  const avisar = useAvisos();
  const t = useTextos().lista.novo;
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [linguagem, setLinguagem] = useState<Linguagem>('bpmn');
  const [modelo, setModelo] = useState<'em-branco' | 'exemplo'>('em-branco');
  const [enviando, setEnviando] = useState(false);

  const criar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    try {
      const m = await api.criar({ nome, descricao, linguagem, modelo });
      dialogo.current?.close();
      window.location.hash = `#/m/${m.id}`;
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <dialog ref={dialogo} className="dialogo" aria-labelledby="titulo-novo">
      <form onSubmit={(e) => void criar(e)}>
        <h2 id="titulo-novo">{t.titulo}</h2>
        <label className="campo">
          <span>{t.nome}</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t.nomeExemplo} required autoFocus />
        </label>
        <label className="campo">
          <span>{t.descricao}</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={t.descricaoExemplo} />
        </label>
        <fieldset className="campo">
          <legend>{t.linguagem}</legend>
          <div className="opcoes">
            {LINGUAGENS.map((l) => (
              <label key={l} className={`opcao ${linguagem === l ? 'opcao-ativa' : ''}`}>
                <input type="radio" name="linguagem" value={l} checked={linguagem === l} onChange={() => setLinguagem(l)} />
                <strong>{NOMES_LINGUAGEM[l]}</strong>
                <span className="suave pequeno">{descricaoLinguagem(l)}</span>
              </label>
            ))}
          </div>
          <p className="suave pequeno">{t.trocarDepois}</p>
        </fieldset>
        <fieldset className="campo">
          <legend>{t.comecar}</legend>
          <div className="opcoes opcoes-duas">
            <label className={`opcao ${modelo === 'em-branco' ? 'opcao-ativa' : ''}`}>
              <input type="radio" name="modelo" checked={modelo === 'em-branco'} onChange={() => setModelo('em-branco')} />
              <strong>{t.emBranco}</strong>
              <span className="suave pequeno">{t.emBrancoTexto}</span>
            </label>
            <label className={`opcao ${modelo === 'exemplo' ? 'opcao-ativa' : ''}`}>
              <input type="radio" name="modelo" checked={modelo === 'exemplo'} onChange={() => setModelo('exemplo')} />
              <strong>{t.exemplo}</strong>
              <span className="suave pequeno">{t.exemploTexto}</span>
            </label>
          </div>
        </fieldset>
        <div className="dialogo-acoes">
          <button type="button" className="botao" onClick={() => dialogo.current?.close()}>
            {t.cancelar}
          </button>
          <button type="submit" className="botao botao-primario" disabled={enviando || !nome.trim()}>
            {enviando ? t.criando : t.criar}
          </button>
        </div>
      </form>
    </dialog>
  );
}
