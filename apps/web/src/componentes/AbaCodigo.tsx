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
      ? [renderizarBpmn(matriz, { correcoes: visoes.bpmn.correcoes }), 'bpmn', 'application/xml']
      : [JSON.stringify(renderizarReactFlow(matriz, { correcoes: visoes.reactflow.correcoes }), null, 2), 'reactflow.json', 'application/json'];
  return <CodigoLeitura conteudo={conteudo} nomeArquivo={`${matriz.processo.id}.${extensao}`} tipo={tipo} />;
}

function CodigoLeitura({ conteudo, nomeArquivo, tipo }: { conteudo: string; nomeArquivo: string; tipo: string }) {
  const avisar = useAvisos();
  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">Gerado da matriz com as correções salvas. Para mudar, edite a matriz ou o desenho.</span>
        <div className="barra-visao-acoes">
          <button
            className="botao"
            onClick={() =>
              void navigator.clipboard.writeText(conteudo).then(
                () => avisar('Código copiado.', 'sucesso'),
                () => avisar('O navegador não deixou copiar.', 'erro'),
              )
            }
          >
            Copiar
          </button>
          <button className="botao botao-primario" onClick={() => baixar(nomeArquivo, conteudo, tipo)}>
            Baixar {nomeArquivo}
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
  const gerado = useMemo(() => renderizarMermaid(matriz, { cores: coresDoEstilo(matriz, estilo) }), [matriz, estilo]);
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
      const r = importarMermaid(texto, matriz.processo.nome);
      const nova: Matriz = { ...r.matriz, processo: matriz.processo };
      const mudancas = compararMatrizes(matriz, nova);
      if (!mudancas.length) {
        avisar('O código diz o mesmo que a matriz: nada a trazer.', 'info');
        return;
      }
      setFalhaLeitura(null);
      if (r.avisos.length) avisar('Lido com avisos:', 'info', r.avisos);
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
          {salvo === null ? 'Código gerado da matriz.' : 'Código editado à mão: não acompanha mudanças na matriz.'} Mudou o fluxo no código? Traga para a matriz.
        </span>
        <div className="barra-visao-acoes">
          <button className="botao" onClick={() => baixar(`${matriz.processo.id}.mmd`, texto, 'text/plain')}>
            Baixar .mmd
          </button>
          <button className="botao" onClick={trazer} title="Lê o código e abre a matriz resultante na aba Matriz, para revisar e salvar">
            Trazer para a matriz
          </button>
          <button className="botao" onClick={() => void aoSalvar(null)} disabled={salvo === null}>
            Voltar ao gerado
          </button>
          <button className="botao botao-primario" onClick={() => void aoSalvar(texto)} disabled={!sujo}>
            Salvar código
          </button>
        </div>
      </div>
      {falhaLeitura && (
        <div className="faixa-erro">
          <p>Não deu para ler o código: {falhaLeitura}</p>
          <button className="botao" onClick={() => aoConverterComIa(texto)}>
            Converter com IA
          </button>
        </div>
      )}
      <div className="codigo-lado-a-lado">
        <textarea className="cartao codigo editor-codigo" value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} aria-label="Código Mermaid" />
        <div className="cartao painel-mermaid">
          <DiagramaMermaid matriz={matriz} codigo={texto} />
        </div>
      </div>
    </div>
  );
}
