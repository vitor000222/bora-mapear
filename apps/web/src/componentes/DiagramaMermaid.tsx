import { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { coresDoEstilo, renderizarMermaid, type EstiloVisual, type Matriz } from '@bora-mapear/core';
import { exportarSvg } from '../exportar.ts';
import { BotoesExportar } from './BotoesExportar.tsx';
import { useIdioma, useTextos } from '../i18n/index.tsx';

// Rótulos em texto SVG (não HTML): o PNG e o PDF saem com o texto.
// Tema na cara da marca: tinta sobre papel branco, raias (subgraphs) na linha forte, IBM Plex, setas retas
// (a curva "step" do Mermaid desalinha a ponta da seta).
const FONTE = "'IBM Plex Sans Variable', 'IBM Plex Sans', 'Segoe UI', Arial, sans-serif";
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  htmlLabels: false,
  fontFamily: FONTE,
  themeVariables: {
    fontFamily: FONTE,
    fontSize: '13px',
    background: '#ffffff',
    mainBkg: '#ffffff',
    primaryColor: '#ffffff',
    primaryBorderColor: '#1c1c1a',
    primaryTextColor: '#1c1c1a',
    secondaryColor: '#f4f4f1',
    tertiaryColor: '#ffffff',
    nodeBorder: '#1c1c1a',
    textColor: '#1c1c1a',
    lineColor: '#1c1c1a',
    clusterBkg: '#ffffff',
    clusterBorder: '#c3c3ba',
    titleColor: '#1c1c1a',
    edgeLabelBackground: '#ffffff',
  },
  flowchart: { htmlLabels: false, curve: 'linear' },
});
let contador = 0;

/** Desenha o código Mermaid (o editado à mão, se houver; senão o gerado da matriz). */
export function DiagramaMermaid({ matriz, codigo, estilo, exportarComo }: { matriz: Matriz; codigo: string | null; estilo?: EstiloVisual; exportarComo?: string }) {
  const { idioma } = useIdioma();
  const fonte = useMemo(
    () => codigo ?? renderizarMermaid(matriz, { idioma, ...(estilo ? { cores: coresDoEstilo(matriz, estilo) } : {}) }),
    [matriz, codigo, estilo, idioma],
  );
  const t = useTextos().desenho.mermaid;
  const alvo = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const id = `mermaid-${++contador}`;
    mermaid
      .render(id, fonte)
      .then(({ svg }) => {
        if (cancelado || !alvo.current) return;
        alvo.current.innerHTML = svg;
        setErro(null);
      })
      .catch((e: unknown) => {
        document.getElementById(`d${id}`)?.remove();
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelado = true;
    };
  }, [fonte]);

  return (
    <>
      {exportarComo && !erro && (
        <div className="barra-visao-acoes barra-mermaid">
          <BotoesExportar
            aoExportar={async (f) => {
              const svg = alvo.current?.querySelector('svg');
              if (!svg) throw new Error(t.naoPronto);
              await exportarSvg(svg.outerHTML, f, exportarComo);
            }}
          />
        </div>
      )}
      {erro && <p className="faixa-erro">{t.naoLeu(erro)}</p>}
      <div ref={alvo} className="diagrama-mermaid" />
    </>
  );
}
