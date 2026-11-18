import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { LINGUAGENS, type Linguagem } from '@bora-mapear/core';
import { api, DESCRICOES_LINGUAGEM, ErroApi, formatarData, NOMES_LINGUAGEM, type ResumoMapeamento } from '../api.ts';
import { useAvisos } from '../avisos.tsx';

export function Lista() {
  const avisar = useAvisos();
  const [itens, setItens] = useState<ResumoMapeamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  const carregar = () =>
    api
      .listar()
      .then((l) => (setItens(l), setErro(null)))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void carregar();
  }, []);

  const apagar = async (m: ResumoMapeamento) => {
    if (!window.confirm(`Apagar "${m.nome}" com todas as versões e correções? Não dá para desfazer.`)) return;
    try {
      await api.apagar(m.id);
      avisar(`"${m.nome}" foi apagado.`, 'sucesso');
      void carregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };

  return (
    <section className="pagina">
      <div className="pagina-cabecalho">
        <div>
          <h1>Mapeamentos</h1>
          <p className="suave">Cada mapeamento guarda a matriz do processo, as versões e as correções de cada desenho.</p>
        </div>
        <button className="botao botao-primario" onClick={() => dialogo.current?.showModal()}>
          Novo mapeamento
        </button>
      </div>

      {erro && (
        <div className="cartao estado-erro">
          <strong>Não deu para carregar a lista.</strong>
          <p>{erro}</p>
          <button className="botao" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </div>
      )}
      {!erro && itens === null && <div className="cartao estado-carregando">Carregando…</div>}
      {!erro && itens?.length === 0 && (
        <div className="cartao estado-vazio">
          <h2>Nenhum mapeamento ainda</h2>
          <p className="suave">Comece em branco ou pelo exemplo de pedido de venda, para ver as três linguagens funcionando.</p>
          <button className="botao botao-primario" onClick={() => dialogo.current?.showModal()}>
            Criar o primeiro
          </button>
        </div>
      )}
      {itens && itens.length > 0 && (
        <div className="cartao">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Linguagem</th>
                <th className="num">Etapas</th>
                <th className="num">Versão</th>
                <th>Atualizado</th>
                <th aria-label="Ações" />
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
                  <td className="num">v{m.versaoAtual}</td>
                  <td className="suave">{formatarData(m.atualizadoEm)}</td>
                  <td className="acoes">
                    <button className="botao botao-fantasma botao-perigo" onClick={() => void apagar(m)}>
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NovoMapeamento dialogo={dialogo} />
    </section>
  );
}

function NovoMapeamento({ dialogo }: { dialogo: RefObject<HTMLDialogElement | null> }) {
  const avisar = useAvisos();
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
        <h2 id="titulo-novo">Novo mapeamento</h2>
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pedido de venda" required autoFocus />
        </label>
        <label className="campo">
          <span>Descrição (opcional)</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Do pedido do cliente ao despacho" />
        </label>
        <fieldset className="campo">
          <legend>Linguagem do desenho</legend>
          <div className="opcoes">
            {LINGUAGENS.map((l) => (
              <label key={l} className={`opcao ${linguagem === l ? 'opcao-ativa' : ''}`}>
                <input type="radio" name="linguagem" value={l} checked={linguagem === l} onChange={() => setLinguagem(l)} />
                <strong>{NOMES_LINGUAGEM[l]}</strong>
                <span className="suave pequeno">{DESCRICOES_LINGUAGEM[l]}</span>
              </label>
            ))}
          </div>
          <p className="suave pequeno">Dá para trocar depois: a matriz é a mesma em qualquer linguagem.</p>
        </fieldset>
        <fieldset className="campo">
          <legend>Começar</legend>
          <div className="opcoes opcoes-duas">
            <label className={`opcao ${modelo === 'em-branco' ? 'opcao-ativa' : ''}`}>
              <input type="radio" name="modelo" checked={modelo === 'em-branco'} onChange={() => setModelo('em-branco')} />
              <strong>Em branco</strong>
              <span className="suave pequeno">Início, uma tarefa e fim.</span>
            </label>
            <label className={`opcao ${modelo === 'exemplo' ? 'opcao-ativa' : ''}`}>
              <input type="radio" name="modelo" checked={modelo === 'exemplo'} onChange={() => setModelo('exemplo')} />
              <strong>Pelo exemplo</strong>
              <span className="suave pequeno">Pedido de venda: 4 raias, 15 etapas.</span>
            </label>
          </div>
        </fieldset>
        <div className="dialogo-acoes">
          <button type="button" className="botao" onClick={() => dialogo.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={enviando || !nome.trim()}>
            {enviando ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
