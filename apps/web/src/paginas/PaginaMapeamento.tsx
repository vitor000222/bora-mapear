import { useCallback, useEffect, useState } from 'react';
import { LINGUAGENS, type Correcoes, type Linguagem, type Matriz, type ResultadoValidacao } from '@bora-mapear/core';
import { api, apiIa, ErroApi, NOMES_LINGUAGEM, type EstiloVisual, type MapeamentoCompleto, type ResumoMapeamento } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { EditorMatriz } from '../componentes/EditorMatriz.tsx';
import { VisaoBpmn } from '../componentes/VisaoBpmn.tsx';
import { VisaoReactFlow } from '../componentes/VisaoReactFlow.tsx';
import { DiagramaMermaid } from '../componentes/DiagramaMermaid.tsx';
import { AbaCodigo } from '../componentes/AbaCodigo.tsx';
import { Historico } from '../componentes/Historico.tsx';
import { AbaIa } from '../componentes/AbaIa.tsx';
import { useTextos } from '../i18n/index.tsx';

type Aba = 'desenho' | 'matriz' | 'ia' | 'codigo' | 'historico';
// O nome de cada aba vem de `mapeamento.abas` no dicionário.
const ABAS: Array<{ id: Aba }> = [{ id: 'desenho' }, { id: 'matriz' }, { id: 'ia' }, { id: 'codigo' }, { id: 'historico' }];

export function PaginaMapeamento({ id, abaInicial }: { id: string; abaInicial?: string }) {
  const avisar = useAvisos();
  const t = useTextos().mapeamento;
  const [dados, setDados] = useState<MapeamentoCompleto | null>(null);
  const [erro, setErro] = useState<{ status: number; texto: string } | null>(null);
  const [aba, setAba] = useState<Aba>(ABAS.some((a) => a.id === abaInicial) ? (abaInicial as Aba) : 'desenho');
  const [rascunho, setRascunho] = useState<Matriz | null>(null);
  const [historicoVersao, setHistoricoVersao] = useState(0);
  const [estilo, setEstilo] = useState<EstiloVisual>({ versao: 1, regras: [] });
  const [mapeamentos, setMapeamentos] = useState<ResumoMapeamento[]>([]);

  useEffect(() => {
    apiIa.estilo().then(setEstilo, () => {});
    api.listar().then(setMapeamentos, () => {});
  }, []);

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
          {t.pagina.voltar}
        </a>
        <div className="cartao estado-erro">
          <strong>{erro.status === 404 ? t.pagina.naoExiste : t.pagina.naoAbriu}</strong>
          <p>{erro.texto}</p>
          {erro.status !== 404 && (
            <button className="botao" onClick={() => void recarregar()}>
              {t.pagina.tentarDeNovo}
            </button>
          )}
        </div>
      </section>
    );
  }
  if (!dados) return <section className="pagina"><div className="cartao estado-carregando">{t.pagina.carregando}</div></section>;

  const { mapeamento, matriz, validacao, visoes, versao, pais, filhos } = dados;

  const criarFilho = async (chave: string) => {
    try {
      const r = await api.criarSubprocesso(id, chave);
      avisar(t.avisos.filhoCriado(r.filho.nome, r.versaoPai), 'sucesso');
      setHistoricoVersao((n) => n + 1);
      setMapeamentos(await api.listar());
      await recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };
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
      if (registro) avisar(t.avisos.correcoesSalvas, 'sucesso', registro.frases);
      else avisar(t.avisos.nadaMudou, 'info');
      if (alertas.length) avisar(t.avisos.conteudoNoDesenho, 'erro', alertas);
      setHistoricoVersao((n) => n + 1);
      await recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
    }
  };

  const salvarCodigo = async (codigo: string | null) => {
    try {
      await api.salvarCodigo(id, 'mermaid', codigo);
      avisar(codigo === null ? t.avisos.codigoVoltou : t.avisos.codigoSalvo, 'sucesso');
      setHistoricoVersao((n) => n + 1);
      await recarregar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };

  const salvarVersao = async (m: Matriz, mensagem: string): Promise<boolean> => {
    try {
      const r = await api.salvarVersao(id, m, mensagem);
      setRascunho(null);
      avisar(
        t.avisos.versaoSalva(r.versao.numero),
        r.validacao.ok ? 'sucesso' : 'erro',
        r.validacao.ok ? undefined : [t.avisos.salvaComoRascunho],
      );
      setHistoricoVersao((n) => n + 1);
      await recarregar();
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro', e instanceof ErroApi ? e.detalhes : undefined);
      return false;
    }
  };

  const revisarProposta = (m: Matriz, origem: string) => {
    if (rascunho && !window.confirm(t.avisos.trocarPelaProposta)) return;
    setRascunho(m);
    setAba('matriz');
    avisar(t.avisos.abertaComoRascunho(origem), 'info');
  };

  const converterComIa = async (conteudo: string) => {
    try {
      await apiIa.converter(id, conteudo);
      setAba('ia');
      avisar(t.avisos.conversorTrabalhando, 'info');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };

  return (
    <section className="pagina pagina-larga">
      <a href="#/" className="voltar">
        {t.pagina.voltar}
      </a>
      {pais.length > 0 && (
        <p className="faixa-info pequeno">
          {t.pagina.subprocessoDe}{' '}
          {pais.map((p, i) => (
            <span key={`${p.id}-${p.chave}`}>
              {i > 0 && ', '}
              <a href={`#/m/${p.id}`}>{p.nome}</a>
              {t.pagina.etapaDoPai(p.chave, p.etapa)}
            </span>
          ))}
          .
        </p>
      )}
      <div className="mapa-cabecalho">
        <div className="mapa-titulo">
          <input
            className="titulo-editavel"
            defaultValue={mapeamento.nome}
            key={mapeamento.nome}
            aria-label={t.pagina.nomeDoMapeamento}
            onBlur={(e) => void renomear(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div className="mapa-meta">
            <span className="suave">{t.pagina.resumo(versao.numero, matriz.etapas.length, matriz.raias.length)}</span>
            <SeloPortao validacao={validacao} aoClicar={() => setAba('matriz')} />
          </div>
        </div>
        <div className="segmentado" role="radiogroup" aria-label={t.pagina.linguagemDoDesenho}>
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
            {t.abas[a.id]}
            {a.id === 'matriz' && rascunho && <span className="ponto" title={t.pagina.naoSalvas} />}
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
              estilo={estilo}
              proximaVersao={versao.numero + 1}
              aoSalvar={(c, alertas) => salvarCorrecoes('bpmn', c, alertas)}
              aoSalvarVersao={salvarVersao}
              aoRevisarProposta={(m) => revisarProposta(m, t.origens.desenho)}
              filhos={filhos}
            />
          )}
          {linguagem === 'reactflow' && (
            <VisaoReactFlow matriz={matriz} correcoes={visoes.reactflow.correcoes} estilo={estilo} filhos={filhos} aoSalvar={(c) => salvarCorrecoes('reactflow', c)} />
          )}
          {linguagem === 'mermaid' && (
            <div className="cartao painel-mermaid">
              {visoes.mermaid.codigo !== null && (
                <p className="faixa-info">{t.pagina.mermaidEditado}</p>
              )}
              <DiagramaMermaid matriz={matriz} codigo={visoes.mermaid.codigo} estilo={estilo} exportarComo={matriz.processo.id} />
            </div>
          )}
          {rascunho && <p className="faixa-info">{t.pagina.desenhoMostraSalva}</p>}
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
            aoSalvar={async (m, mensagem) => void (await salvarVersao(m, mensagem))}
            idMapeamento={id}
            mapeamentos={mapeamentos}
            filhos={filhos}
            aoCriarFilho={criarFilho}
          />
        </div>
      )}

      {aba === 'ia' && (
        <div className="aba-conteudo">
          <AbaIa
            id={id}
            versaoAtual={versao.numero}
            aoRevisarProposta={(m) => revisarProposta(m, t.origens.agente)}
            aoAplicar={async () => {
              setHistoricoVersao((n) => n + 1);
              await recarregar();
            }}
          />
        </div>
      )}

      {aba === 'codigo' && (
        <div className="aba-conteudo">
          <AbaCodigo
            linguagem={linguagem}
            matriz={matriz}
            visoes={visoes}
            estilo={estilo}
            aoSalvarCodigo={salvarCodigo}
            aoTrazerParaMatriz={(m) => revisarProposta(m, t.origens.codigo)}
            aoConverterComIa={(conteudo) => void converterComIa(conteudo)}
          />
        </div>
      )}

      {aba === 'historico' && (
        <div className="aba-conteudo">
          <Historico
            id={id}
            versaoAtual={versao.numero}
            atualizar={historicoVersao}
            aoRestaurar={async (m, numero) => void (await salvarVersao(m, t.historico.restaurada(numero)))}
          />
        </div>
      )}
    </section>
  );
}

function SeloPortao({ validacao, aoClicar }: { validacao: ResultadoValidacao; aoClicar: () => void }) {
  const t = useTextos().mapeamento.selo;
  const erros = validacao.problemas.filter((p) => p.severidade === 'erro').length;
  const avisos = validacao.problemas.length - erros;
  const [classe, texto] = !validacao.ok
    ? ['selo-erro', t.erros(erros)]
    : avisos
      ? ['selo-aviso', t.aprovadaComAvisos(avisos)]
      : ['selo-ok', t.aprovada];
  return (
    <button className={`selo ${classe}`} onClick={aoClicar} title={t.titulo}>
      {texto}
    </button>
  );
}
