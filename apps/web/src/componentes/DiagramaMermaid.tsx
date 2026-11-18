import { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { renderizarMermaid, type Matriz } from '@bora-mapear/core';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: true } });
let contador = 0;

/** Desenha o código Mermaid (o editado à mão, se houver; senão o gerado da matriz). */
export function DiagramaMermaid({ matriz, codigo }: { matriz: Matriz; codigo: string | null }) {
  const fonte = useMemo(() => codigo ?? renderizarMermaid(matriz), [matriz, codigo]);
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
      {erro && <p className="faixa-erro">O Mermaid não leu o código: {erro}</p>}
      <div ref={alvo} className="diagrama-mermaid" />
    </>
  );
}
