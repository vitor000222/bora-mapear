import { useMemo, useState } from 'react';
import { renderizarBpmn, renderizarMermaid, renderizarReactFlow, type Linguagem, type Matriz } from '@bora-mapear/core';
import { baixar, type VisaoSalva } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { DiagramaMermaid } from './DiagramaMermaid.tsx';

interface Props {
  linguagem: Linguagem;
  matriz: Matriz;
  visoes: Record<Linguagem, VisaoSalva>;
  aoSalvarCodigo: (codigo: string | null) => Promise<void>;
}

/** O código por trás do desenho. BPMN e React Flow só leitura; Mermaid editável. */
export function AbaCodigo({ linguagem, matriz, visoes, aoSalvarCodigo }: Props) {
  if (linguagem === 'mermaid') return <CodigoMermaid matriz={matriz} salvo={visoes.mermaid.codigo} aoSalvar={aoSalvarCodigo} />;
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

function CodigoMermaid({ matriz, salvo, aoSalvar }: { matriz: Matriz; salvo: string | null; aoSalvar: (c: string | null) => Promise<void> }) {
  const gerado = useMemo(() => renderizarMermaid(matriz), [matriz]);
  const base = salvo ?? gerado;
  const [texto, setTexto] = useState(base);
  const [ultimo, setUltimo] = useState(base);
  if (base !== ultimo) {
    setUltimo(base);
    setTexto(base);
  }
  const sujo = texto !== base;

  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">
          {salvo === null ? 'Código gerado da matriz.' : 'Código editado à mão: não acompanha mudanças na matriz.'}
        </span>
        <div className="barra-visao-acoes">
          <button className="botao" onClick={() => baixar(`${matriz.processo.id}.mmd`, texto, 'text/plain')}>
            Baixar .mmd
          </button>
          <button className="botao" onClick={() => void aoSalvar(null)} disabled={salvo === null}>
            Voltar ao gerado
          </button>
          <button className="botao botao-primario" onClick={() => void aoSalvar(texto)} disabled={!sujo}>
            Salvar código
          </button>
        </div>
      </div>
      <div className="codigo-lado-a-lado">
        <textarea className="cartao codigo editor-codigo" value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} aria-label="Código Mermaid" />
        <div className="cartao painel-mermaid">
          <DiagramaMermaid matriz={matriz} codigo={texto} />
        </div>
      </div>
    </div>
  );
}
