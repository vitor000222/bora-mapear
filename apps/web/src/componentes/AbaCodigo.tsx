import { useMemo, useState } from 'react';
import {
  compararMatrizes,
  coresDoEstilo,
  ErroImportacao,
  importarMermaid,
  renderizarBpmn,
  renderizarMermaid,
  renderizarReactFlow,
  type EstiloVisual,
  type Linguagem,
  type Matriz,
} from '@bora-mapear/core';
import { baixar, type VisaoSalva } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { DiagramaMermaid } from './DiagramaMermaid.tsx';
import { useIdioma, useTextos } from '../i18n/index.tsx';

interface Props {
  linguagem: Linguagem;
  matriz: Matriz;
  visoes: Record<Linguagem, VisaoSalva>;
  estilo: EstiloVisual;
  aoSalvarCodigo: (codigo: string | null) => Promise<void>;
  /** O código Mermaid editado vira proposta de matriz. */
  aoTrazerParaMatriz: (m: Matriz) => void;
  aoConverterComIa: (conteudo: string) => void;
}

/** O código por trás do desenho. BPMN e React Flow só leitura; Mermaid editável e de volta para a matriz. */
export function AbaCodigo({ linguagem, matriz, visoes, estilo, aoSalvarCodigo, aoTrazerParaMatriz, aoConverterComIa }: Props) {
  const { idioma } = useIdioma();
  if (linguagem === 'mermaid') {
    return (
      <CodigoMermaid
        matriz={matriz}
        salvo={visoes.mermaid.codigo}
        estilo={estilo}
        aoSalvar={aoSalvarCodigo}
        aoTrazerParaMatriz={aoTrazerParaMatriz}
        aoConverterComIa={aoConverterComIa}
      />
    );
  }
  const [conteudo, extensao, tipo] =
    linguagem === 'bpmn'
      ? [renderizarBpmn(matriz, { correcoes: visoes.bpmn.correcoes, idioma }), 'bpmn', 'application/xml']
      : [JSON.stringify(renderizarReactFlow(matriz, { correcoes: visoes.reactflow.correcoes }), null, 2), 'reactflow.json', 'application/json'];
  return <CodigoLeitura conteudo={conteudo} nomeArquivo={`${matriz.processo.id}.${extensao}`} tipo={tipo} />;
}

function CodigoLeitura({ conteudo, nomeArquivo, tipo }: { conteudo: string; nomeArquivo: string; tipo: string }) {
  const avisar = useAvisos();
  const t = useTextos().mapeamento.codigo;
  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">{t.geradoDaMatriz}</span>
        <div className="barra-visao-acoes">
          <button
            className="botao"
            onClick={() =>
              void navigator.clipboard.writeText(conteudo).then(
                () => avisar(t.copiado, 'sucesso'),
                () => avisar(t.naoCopiou, 'erro'),
              )
            }
          >
            {t.copiar}
          </button>
          <button className="botao botao-primario" onClick={() => baixar(nomeArquivo, conteudo, tipo)}>
            {t.baixar(nomeArquivo)}
          </button>
        </div>
      </div>
      <pre className="cartao codigo">{conteudo}</pre>
    </div>
  );
}

interface PropsMermaid {
  matriz: Matriz;
  salvo: string | null;
  estilo: EstiloVisual;
  aoSalvar: (c: string | null) => Promise<void>;
  aoTrazerParaMatriz: (m: Matriz) => void;
  aoConverterComIa: (conteudo: string) => void;
}

function CodigoMermaid({ matriz, salvo, estilo, aoSalvar, aoTrazerParaMatriz, aoConverterComIa }: PropsMermaid) {
  const avisar = useAvisos();
  const { idioma } = useIdioma();
  const t = useTextos().mapeamento.codigo;
  // O idioma só muda o comentário do topo; fora das dependências para não apagar o que a pessoa está editando.
  const gerado = useMemo(() => renderizarMermaid(matriz, { cores: coresDoEstilo(matriz, estilo), idioma }), [matriz, estilo]);
  const base = salvo ?? gerado;
  const [texto, setTexto] = useState(base);
  const [ultimo, setUltimo] = useState(base);
  const [falhaLeitura, setFalhaLeitura] = useState<string | null>(null);
  if (base !== ultimo) {
    setUltimo(base);
    setTexto(base);
  }
  const sujo = texto !== base;

  const trazer = () => {
    try {
      const r = importarMermaid(texto, matriz.processo.nome, { idioma });
      const nova: Matriz = { ...r.matriz, processo: matriz.processo };
      const mudancas = compararMatrizes(matriz, nova, { idioma });
      if (!mudancas.length) {
        avisar(t.nadaATrazer, 'info');
        return;
      }
      setFalhaLeitura(null);
      if (r.avisos.length) avisar(t.lidoComAvisos, 'info', r.avisos);
      aoTrazerParaMatriz(nova);
    } catch (e) {
      if (e instanceof ErroImportacao) setFalhaLeitura(e.message);
      else throw e;
    }
  };

  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">
          {salvo === null ? t.mermaidGerado : t.mermaidEditado} {t.trazerDica}
        </span>
        <div className="barra-visao-acoes">
          <button className="botao" onClick={() => baixar(`${matriz.processo.id}.mmd`, texto, 'text/plain')}>
            {t.baixarMmd}
          </button>
          <button className="botao" onClick={trazer} title={t.trazerTitulo}>
            {t.trazer}
          </button>
          <button className="botao" onClick={() => void aoSalvar(null)} disabled={salvo === null}>
            {t.voltarAoGerado}
          </button>
          <button className="botao botao-primario" onClick={() => void aoSalvar(texto)} disabled={!sujo}>
            {t.salvar}
          </button>
        </div>
      </div>
      {falhaLeitura && (
        <div className="faixa-erro">
          <p>{t.naoLeu(falhaLeitura)}</p>
          <button className="botao" onClick={() => aoConverterComIa(texto)}>
            {t.converterComIa}
          </button>
        </div>
      )}
      <div className="codigo-lado-a-lado">
        <textarea className="cartao codigo editor-codigo" value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} aria-label={t.codigoMermaid} />
        <div className="cartao painel-mermaid">
          <DiagramaMermaid matriz={matriz} codigo={texto} />
        </div>
      </div>
    </div>
  );
}
