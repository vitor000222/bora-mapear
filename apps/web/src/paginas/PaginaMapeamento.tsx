import { useCallback, useEffect, useState } from 'react';
import { LINGUAGENS, type Correcoes, type Linguagem, type Matriz, type ResultadoValidacao } from '@bora-mapear/core';
import { api, ErroApi, NOMES_LINGUAGEM, type MapeamentoCompleto } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { EditorMatriz } from '../componentes/EditorMatriz.tsx';
import { VisaoBpmn } from '../componentes/VisaoBpmn.tsx';
import { VisaoReactFlow } from '../componentes/VisaoReactFlow.tsx';
import { DiagramaMermaid } from '../componentes/DiagramaMermaid.tsx';
import { AbaCodigo } from '../componentes/AbaCodigo.tsx';
import { Historico } from '../componentes/Historico.tsx';
import { AbaIa } from '../componentes/AbaIa.tsx';

type Aba = 'desenho' | 'matriz' | 'ia' | 'codigo' | 'historico';
const ABAS: Array<{ id: Aba; nome: string }> = [
  { id: 'desenho', nome: 'Desenho' },
  { id: 'matriz', nome: 'Matriz' },
  { id: 'ia', nome: 'IA' },
  { id: 'codigo', nome: 'Código' },
  { id: 'historico', nome: 'Histórico' },
];

export function PaginaMapeamento({ id }: { id: string }) {
  const avisar = useAvisos();
  const [dados, setDados] = useState<MapeamentoCompleto | null>(null);
  const [erro, setErro] = useState<{ status: number; texto: string } | null>(null);
  const [aba, setAba] = useState<Aba>('desenho');
  const [rascunho, setRascunho] = useState<Matriz | null>(null);
  const [historicoVersao, setHistoricoVersao] = useState(0);

  const recarregar = useCallback(async () => {
    try {
      setDados(await api.obter(id));
      setErro(null);
    } catch (e) {
      setErro({ status: e instanceof ErroApi ? e.status : 0, texto: e instanceof Error ? e.message : String(e) });
    }
  }, [id]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Avisa antes de fechar a aba com a matriz editada e não salva.
  useEffect(() => {
    if (!rascunho) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [rascunho]);

  if (erro) {
    return (
      <section className="pagina">
        <a href="#/" className="voltar">
          ← Mapeamentos
        </a>
        <div className="cartao estado-erro">
          <strong>{erro.status === 404 ? 'Este mapeamento não existe mais.' : 'Não deu para abrir o mapeamento.'}</strong>
          <p>{erro.texto}</p>
          {erro.status !== 404 && (
            <button className="botao" onClick={() => void recarregar()}>
              Tentar de novo
            </button>
          )}
        </div>
      </section>
    );
  }
  if (!dados) return <section className="pagina"><div className="cartao estado-carregando">Carregando…</div></section>;

  const { mapeamento, matriz, validacao, visoes, versao } = dados;
  const linguagem = mapeamento.linguagem;

  const trocarLinguagem = async (l: Linguagem) => {
    setDados({ ...dados, mapeamento: { ...mapeamento, linguagem: l } });
    try {
      await api.editar(id, { linguagem: l });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
      void recarregar();
    }
  };

  const renomear = async (nome: string) => {
    if (!nome.trim() || nome === mapeamento.nome) return;
    try {
      await api.editar(id, { nome: nome.trim() });
      await recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };

  const salvarCorrecoes = async (l: Linguagem, correcoes: Correcoes, alertas: string[] = []) => {
    try {
      const { registro } = await api.salvarCorrecoes(id, l, correcoes);
      if (registro) avisar('Correções salvas.', 'sucesso', registro.frases);
      else avisar('Nada mudou desde a última gravação.', 'info');
      if (alertas.length) avisar('Mudanças de conteúdo feitas no desenho não foram salvas. Faça-as na aba Matriz:', 'erro', alertas);
      setHistoricoVersao((n) => n + 1);
      await recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    }
  };

  const salvarCodigo = async (codigo: string | null) => {
    try {
      await api.salvarCodigo(id, 'mermaid', codigo);
      avisar(codigo === null ? 'Código voltou ao gerado pela matriz.' : 'Código Mermaid salvo.', 'sucesso');
      setHistoricoVersao((n) => n + 1);
      await recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };

  const salvarVersao = async (m: Matriz, mensagem: string) => {
    try {
      const r = await api.salvarVersao(id, m, mensagem);
      setRascunho(null);
      avisar(
        `Versão ${r.versao.numero} salva.`,
        r.validacao.ok ? 'sucesso' : 'erro',
        r.validacao.ok ? undefined : ['A matriz foi salva como rascunho: o portão ainda acusa erros.'],
      );
      setHistoricoVersao((n) => n + 1);
      await recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    }
  };

  return (
    <section className="pagina pagina-larga">
      <a href="#/" className="voltar">
        ← Mapeamentos
      </a>
      <div className="mapa-cabecalho">
        <div className="mapa-titulo">
          <input
            className="titulo-editavel"
            defaultValue={mapeamento.nome}
            key={mapeamento.nome}
            aria-label="Nome do mapeamento"
            onBlur={(e) => void renomear(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div className="mapa-meta">
            <span className="suave">
              v{versao.numero} · {matriz.etapas.length} etapas · {matriz.raias.length} raias
            </span>
            <SeloPortao validacao={validacao} aoClicar={() => setAba('matriz')} />
          </div>
        </div>
        <div className="segmentado" role="radiogroup" aria-label="Linguagem do desenho">
          {LINGUAGENS.map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={linguagem === l}
              className={linguagem === l ? 'ativo' : ''}
              onClick={() => void trocarLinguagem(l)}
            >
              {NOMES_LINGUAGEM[l]}
            </button>
          ))}
        </div>
      </div>

      <nav className="abas" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}>
            {a.nome}
            {a.id === 'matriz' && rascunho && <span className="ponto" title="Mudanças não salvas" />}
          </button>
        ))}
      </nav>

      {aba === 'desenho' && (
        <div className="aba-conteudo">
          {linguagem === 'bpmn' && (
            <VisaoBpmn
              matriz={matriz}
              correcoes={visoes.bpmn.correcoes}
              nomeArquivo={matriz.processo.id}
              aoSalvar={(c, alertas) => salvarCorrecoes('bpmn', c, alertas)}
            />
          )}
          {linguagem === 'reactflow' && (
            <VisaoReactFlow matriz={matriz} correcoes={visoes.reactflow.correcoes} aoSalvar={(c) => salvarCorrecoes('reactflow', c)} />
          )}
          {linguagem === 'mermaid' && (
            <div className="cartao painel-mermaid">
              {visoes.mermaid.codigo !== null && (
                <p className="faixa-info">Este desenho usa o código Mermaid editado à mão. Ele não acompanha mudanças na matriz.</p>
              )}
              <DiagramaMermaid matriz={matriz} codigo={visoes.mermaid.codigo} />
            </div>
          )}
          {rascunho && <p className="faixa-info">O desenho mostra a versão salva. A matriz tem mudanças ainda não salvas.</p>}
        </div>
      )}

      {aba === 'matriz' && (
        <div className="aba-conteudo">
          <EditorMatriz
            matriz={rascunho ?? matriz}
            sujo={rascunho !== null}
            proximaVersao={versao.numero + 1}
            aoMudar={setRascunho}
            aoDescartar={() => setRascunho(null)}
            aoSalvar={(m, mensagem) => salvarVersao(m, mensagem)}
          />
        </div>
      )}

      {aba === 'ia' && (
        <div className="aba-conteudo">
          <AbaIa
            id={id}
            versaoAtual={versao.numero}
            aoRevisarProposta={(m) => {
              if (rascunho && !window.confirm('A matriz já tem mudanças não salvas. Trocar pela proposta do agente?')) return;
              setRascunho(m);
              setAba('matriz');
              avisar('Proposta aberta na Matriz como rascunho. Revise e salve a versão.', 'info');
            }}
            aoAplicar={async () => {
              setHistoricoVersao((n) => n + 1);
              await recarregar();
            }}
          />
        </div>
      )}

      {aba === 'codigo' && (
        <div className="aba-conteudo">
          <AbaCodigo linguagem={linguagem} matriz={matriz} visoes={visoes} aoSalvarCodigo={salvarCodigo} />
        </div>
      )}

      {aba === 'historico' && (
        <div className="aba-conteudo">
          <Historico
            id={id}
            versaoAtual={versao.numero}
            atualizar={historicoVersao}
            aoRestaurar={async (m, numero) => salvarVersao(m, `Restaurada da versão ${numero}.`)}
          />
        </div>
      )}
    </section>
  );
}

function SeloPortao({ validacao, aoClicar }: { validacao: ResultadoValidacao; aoClicar: () => void }) {
  const erros = validacao.problemas.filter((p) => p.severidade === 'erro').length;
  const avisos = validacao.problemas.length - erros;
  const [classe, texto] = !validacao.ok
    ? ['selo-erro', `Portão: ${erros} ${erros === 1 ? 'erro' : 'erros'}`]
    : avisos
      ? ['selo-aviso', `Portão: aprovada, ${avisos} ${avisos === 1 ? 'aviso' : 'avisos'}`]
      : ['selo-ok', 'Portão: aprovada'];
  return (
    <button className={`selo ${classe}`} onClick={aoClicar} title="Ver na aba Matriz">
      {texto}
    </button>
  );
}
