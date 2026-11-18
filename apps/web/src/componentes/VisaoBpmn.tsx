import { useEffect, useRef, useState } from 'react';
import Modeler from 'bpmn-js/lib/Modeler';
import CorModule from 'bpmn-js-color-picker';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import 'bpmn-js-color-picker/colors/color-picker.css';
import { correcoesVazias, etapasUnicas, extrairCorrecoesDoBpmn, renderizarBpmn, type Correcoes, type Matriz } from '@bora-mapear/core';
import { baixar } from '../api.ts';

interface Props {
  matriz: Matriz;
  correcoes: Correcoes;
  nomeArquivo: string;
  aoSalvar: (correcoes: Correcoes, alertasDeConteudo: string[]) => Promise<void>;
}

interface ElementoBpmn {
  businessObject?: { name?: string };
}

interface Viewbox {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  inner: { x: number; y: number; width: number; height: number };
  outer: { width: number; height: number };
}

interface Canvas {
  viewbox(novo?: Omit<Viewbox, 'scale' | 'inner' | 'outer'>): Viewbox;
}

/** Enquadra o desenho deixando livre a faixa da paleta, à esquerda. */
function enquadrar(canvas: Canvas) {
  const { inner, outer } = canvas.viewbox();
  if (!inner.width || !outer.width) return;
  const paleta = (document.querySelector('.djs-palette') as HTMLElement | null)?.getBoundingClientRect().right ?? 0;
  const inicio = (document.querySelector('.canvas-bpmn') as HTMLElement | null)?.getBoundingClientRect().left ?? 0;
  const faixaPaleta = Math.max(0, paleta - inicio);
  const margem = 24;
  const escala = Math.min((outer.width - faixaPaleta - margem * 2) / inner.width, (outer.height - margem * 2) / inner.height, 1);
  canvas.viewbox({
    x: inner.x - (faixaPaleta + margem) / escala,
    y: inner.y - margem / escala,
    width: outer.width / escala,
    height: outer.height / escala,
  });
}

/**
 * O desenho BPMN no editor do bpmn-js. Mover, redimensionar, pintar e redesenhar setas vira correção.
 * Mudança de conteúdo (renomear, criar, apagar) é detectada e avisada: ela vai na matriz.
 */
export function VisaoBpmn({ matriz, correcoes, nomeArquivo, aoSalvar }: Props) {
  const recipiente = useRef<HTMLDivElement>(null);
  const modeler = useRef<Modeler | null>(null);
  const importando = useRef(false);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const m = new Modeler({ container: recipiente.current!, additionalModules: [CorModule] });
    modeler.current = m;
    m.on('commandStack.changed', () => {
      if (!importando.current) setSujo(true);
    });
    return () => {
      m.destroy();
      modeler.current = null;
    };
  }, []);

  useEffect(() => {
    const m = modeler.current;
    if (!m) return;
    let cancelado = false;
    importando.current = true;
    m.importXML(renderizarBpmn(matriz, { correcoes }))
      .then(({ warnings }) => {
        if (cancelado) return;
        if (warnings.length) console.warn('bpmn-js:', warnings);
        enquadrar(m.get('canvas') as Canvas);
        setErro(null);
        setSujo(false);
      })
      .catch((e: unknown) => !cancelado && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        importando.current = false;
      });
    return () => {
      cancelado = true;
    };
  }, [matriz, correcoes]);

  const salvar = async () => {
    const m = modeler.current;
    if (!m) return;
    setSalvando(true);
    try {
      const { xml } = await m.saveXML({ format: false });
      const { correcoes: novas, desconhecidos, ausentes } = extrairCorrecoesDoBpmn(xml ?? '', matriz);
      const registro = m.get('elementRegistry') as { get: (id: string) => ElementoBpmn | undefined };
      const alertas: string[] = [];
      for (const e of etapasUnicas(matriz)) {
        const nome = registro.get(e.chave)?.businessObject?.name ?? '';
        if (registro.get(e.chave) && nome !== e.nome) alertas.push(`${e.chave} renomeada para "${nome}"`);
      }
      if (desconhecidos.length) alertas.push(`Elementos novos no desenho: ${desconhecidos.join(', ')}`);
      if (ausentes.length) alertas.push(`Etapas apagadas do desenho: ${ausentes.join(', ')}`);
      await aoSalvar(novas, alertas);
    } finally {
      setSalvando(false);
    }
  };

  const baixarSvg = async () => {
    const m = modeler.current;
    if (!m) return;
    const { svg } = await m.saveSVG();
    baixar(`${nomeArquivo}.svg`, svg, 'image/svg+xml');
  };

  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">
          Arraste, redimensione e pinte (clique no elemento → ícone de cor). Renomear e criar etapas é na aba Matriz.
        </span>
        <div className="barra-visao-acoes">
          {sujo && <span className="selo selo-aviso">Correções não salvas</span>}
          <button className="botao" onClick={() => void baixarSvg()}>
            Baixar SVG
          </button>
          <button
            className="botao"
            onClick={() => void aoSalvar(correcoesVazias(), [])}
            disabled={salvando || (Object.keys(correcoes.nos).length === 0 && Object.keys(correcoes.arestas).length === 0 && Object.keys(correcoes.raias).length === 0 && !correcoes.pool)}
            title="Apaga as correções desta visão e volta ao layout automático"
          >
            Voltar ao automático
          </button>
          <button className="botao botao-primario" onClick={() => void salvar()} disabled={!sujo || salvando}>
            {salvando ? 'Salvando…' : 'Salvar correções'}
          </button>
        </div>
      </div>
      {erro && <p className="faixa-erro">O bpmn-js não abriu o desenho: {erro}</p>}
      <div ref={recipiente} className="canvas canvas-bpmn" />
    </div>
  );
}
