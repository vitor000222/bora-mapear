import { useEffect, useRef, useState } from 'react';
import Modeler from 'bpmn-js/lib/Modeler';
import CorModule from 'bpmn-js-color-picker';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import 'bpmn-js-color-picker/colors/color-picker.css';
import { getStrokeColor } from 'bpmn-js/lib/draw/BpmnRenderUtil';
import {
  aplicarEstilo,
  compararMatrizes,
  correcoesVazias,
  extrairCorrecoesDoBpmn,
  importarBpmn,
  reconciliarComOriginal,
  renderizarBpmn,
  temCorrecoes,
  validarMatriz,
  type Correcoes,
  type EstiloVisual,
  type Matriz,
} from '@bora-mapear/core';
import { exportarSvg } from '../exportar.ts';
import { BotoesExportar } from './BotoesExportar.tsx';
import { useAvisos } from '../avisos.tsx';
import { useIdioma, useTextos } from '../i18n/index.tsx';

interface Props {
  matriz: Matriz;
  correcoes: Correcoes;
  nomeArquivo: string;
  estilo: EstiloVisual;
  proximaVersao: number;
  aoSalvar: (correcoes: Correcoes, alertasDeConteudo: string[]) => Promise<void>;
  /** Mudança de conteúdo feita no desenho vira versão nova da matriz. */
  aoSalvarVersao: (m: Matriz, mensagem: string) => Promise<boolean>;
  aoRevisarProposta: (m: Matriz) => void;
  /** Etapas de subprocesso ligadas a um mapeamento filho: duplo clique abre o filho. */
  filhos: Record<string, { id: string; nome: string } | null>;
}

/** Conteúdo mudado no editor: a matriz lida do desenho e o que difere da atual. */
interface MudancaDeConteudo {
  xml: string;
  matriz: Matriz;
  frases: string[];
  /** As mensagens de erro que o portão vai acusar na matriz nova. */
  erros: string[];
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

// O desenho na cara da marca: tinta sobre papel branco, IBM Plex, raias na linha forte.
// Só muda como o bpmn-js desenha na tela: o XML exportado não ganha cor nenhuma.
const TINTA = '#1c1c1a';
const LINHA_FORTE = '#c3c3ba';
const FONTE_DESENHO = "'IBM Plex Sans Variable', 'IBM Plex Sans', 'Segoe UI', Arial, sans-serif";
const PASSO_GRADE = 24;
const SEM_COR = 'sem-cor';

interface ContextoDesenho {
  element: { type: string };
  gfx: SVGGElement;
  attrs?: object;
}

/**
 * Desenha a piscina e as raias com a linha forte, mais clara que a tinta das etapas.
 * Se a pessoa pintou a borda da raia, vale a cor dela.
 */
function LinhaDasRaias(
  eventBus: { on: (evento: string, prioridade: number, f: (e: unknown, c: ContextoDesenho) => unknown) => void },
  bpmnRenderer: { drawShape: (gfx: SVGGElement, elemento: object, attrs?: object) => SVGElement },
) {
  eventBus.on('render.shape', 1500, (_e, { element, gfx, attrs }) => {
    if (element.type !== 'bpmn:Participant' && element.type !== 'bpmn:Lane') return undefined;
    const visual = bpmnRenderer.drawShape(gfx, element, attrs);
    if (getStrokeColor(element, SEM_COR) === SEM_COR)
      for (const traco of gfx.querySelectorAll<SVGElement>('rect, path, polyline, line')) traco.style.stroke = LINHA_FORTE;
    return visual;
  });
}
LinhaDasRaias.$inject = ['eventBus', 'bpmnRenderer'];
const ModuloRaias = { __init__: ['linhaDasRaias'], linhaDasRaias: ['type', LinhaDasRaias] };

/** A grade do fundo acompanha o zoom e o arrasto do desenho. */
function moverGrade(el: HTMLElement | null, v: Pick<Viewbox, 'x' | 'y' | 'scale'>) {
  if (!el) return;
  const passo = PASSO_GRADE * v.scale;
  el.style.backgroundSize = `${passo}px ${passo}px`;
  el.style.backgroundPosition = `${-v.x * v.scale}px ${-v.y * v.scale}px`;
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
export function VisaoBpmn({ matriz, correcoes, nomeArquivo, estilo, proximaVersao, aoSalvar, aoSalvarVersao, aoRevisarProposta, filhos }: Props) {
  const avisar = useAvisos();
  // Só no que roda a cada render ou clique. Os tratadores do bpmn-js (registrados uma vez) não usam texto;
  // se passarem a usar, leiam com textos() na hora, não este `t`.
  const t = useTextos().desenho;
  const { idioma } = useIdioma();
  const recipiente = useRef<HTMLDivElement>(null);
  const modeler = useRef<Modeler | null>(null);
  const importando = useRef(false);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mudanca, setMudanca] = useState<MudancaDeConteudo | null>(null);
  const filhosAtuais = useRef(filhos);
  filhosAtuais.current = filhos;

  useEffect(() => {
    const m = new Modeler({
      container: recipiente.current!,
      additionalModules: [CorModule, ModuloRaias],
      bpmnRenderer: { defaultFillColor: '#ffffff', defaultStrokeColor: TINTA, defaultLabelColor: TINTA },
      textRenderer: {
        defaultStyle: { fontFamily: FONTE_DESENHO, fontSize: 12, lineHeight: 1.25 },
        externalStyle: { fontFamily: FONTE_DESENHO, fontSize: 11, lineHeight: 1.25 },
      },
    });
    modeler.current = m;
    m.on('canvas.viewbox.changed', (evento: { viewbox: Viewbox }) => moverGrade(recipiente.current, evento.viewbox));
    m.on('commandStack.changed', () => {
      if (!importando.current) setSujo(true);
    });
    // Duplo clique num subprocesso ligado abre o mapeamento filho (em vez de editar o nome).
    m.on('element.dblclick', 1500, (evento: { element: { id: string } }) => {
      const filho = filhosAtuais.current[evento.element.id];
      if (!filho) return;
      window.location.hash = `#/m/${filho.id}`;
      return false;
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
    setMudanca(null);
    // O idioma (rótulos da documentação) não entra nas dependências: trocar de idioma não deve reimportar
    // o desenho e perder o que ainda não foi salvo.
    m.importXML(renderizarBpmn(matriz, { correcoes, idioma }))
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

  const xmlAtual = async () => (await modeler.current!.saveXML({ format: false })).xml ?? '';

  /** Salva a forma. Se o desenho também mudou de conteúdo, mostra o que mudou e deixa escolher. */
  const salvar = async () => {
    if (!modeler.current) return;
    setSalvando(true);
    try {
      const xml = await xmlAtual();
      const lida = await importarBpmn(xml, { idioma });
      const nova = reconciliarComOriginal(matriz, lida.matriz);
      const frases = compararMatrizes(matriz, nova, { idioma, detalhes: false });
      if (frases.length) {
        setMudanca({ xml, matriz: nova, frases, erros: validarMatriz(nova, { idioma }).problemas.filter((p) => p.severidade === 'erro').map((p) => p.mensagem) });
        return;
      }
      await aoSalvar(extrairCorrecoesDoBpmn(xml, matriz).correcoes, []);
    } catch (e) {
      avisar(t.bpmn.naoLeu(e instanceof Error ? e.message : String(e)), 'erro');
    } finally {
      setSalvando(false);
    }
  };

  /** Conteúdo vira versão nova; depois a forma é salva já sobre a matriz nova. */
  const salvarComoVersao = async () => {
    if (!mudanca) return;
    setSalvando(true);
    try {
      const ok = await aoSalvarVersao(mudanca.matriz, t.bpmn.mensagemVersao);
      if (ok) await aoSalvar(extrairCorrecoesDoBpmn(mudanca.xml, mudanca.matriz).correcoes, []);
      setMudanca(null);
    } finally {
      setSalvando(false);
    }
  };

  const soForma = async () => {
    if (!mudanca) return;
    const { correcoes: novas, desconhecidos, ausentes } = extrairCorrecoesDoBpmn(mudanca.xml, matriz);
    const ignorado = [...mudanca.frases];
    if (desconhecidos.length || ausentes.length) ignorado.push(t.bpmn.elementosIgnorados);
    setMudanca(null);
    await aoSalvar(novas, ignorado);
  };

  const aplicarMeuEstilo = async () => {
    if (!estilo.regras.length) {
      avisar(t.acoes.semEstilo, 'info');
      return;
    }
    await aoSalvar(aplicarEstilo(matriz, estilo, correcoes), []);
  };


  const temCorrecao = temCorrecoes(correcoes);

  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">{t.bpmn.dica}</span>
        <div className="barra-visao-acoes">
          {sujo && <span className="selo selo-aviso">{t.bpmn.naoSalvas}</span>}
          <BotoesExportar aoExportar={async (f) => exportarSvg((await modeler.current!.saveSVG()).svg, f, nomeArquivo)} />
          <button className="botao" onClick={() => void aplicarMeuEstilo()} disabled={salvando} title={t.acoes.aplicarEstiloTitulo}>
            {t.acoes.aplicarEstilo}
          </button>
          <button className="botao" onClick={() => void aoSalvar(correcoesVazias(), [])} disabled={salvando || !temCorrecao} title={t.bpmn.voltarAutomaticoTitulo}>
            {t.acoes.voltarAutomatico}
          </button>
          <button className="botao botao-primario" onClick={() => void salvar()} disabled={!sujo || salvando}>
            {salvando ? t.acoes.salvando : t.bpmn.salvar}
          </button>
        </div>
      </div>
      {mudanca && (
        <div className="cartao secao painel-mudanca" role="alertdialog" aria-labelledby="titulo-mudanca">
          <strong id="titulo-mudanca">{t.bpmn.mudanca.titulo}</strong>
          <ul className="pequeno">
            {mudanca.frases.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {mudanca.erros.length > 0 && (
            <div className="pequeno texto-aviso">
              {t.bpmn.mudanca.portao(mudanca.erros.length)}
              <ul>
                {mudanca.erros.slice(0, 3).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="barra-visao-acoes">
            <button className="botao botao-primario" onClick={() => void salvarComoVersao()} disabled={salvando}>
              {t.bpmn.mudanca.salvarComoVersao(proximaVersao)}
            </button>
            <button
              className="botao"
              onClick={() => {
                aoRevisarProposta(mudanca.matriz);
                setMudanca(null);
              }}
            >
              {t.bpmn.mudanca.revisar}
            </button>
            <button className="botao" onClick={() => void soForma()} disabled={salvando} title={t.bpmn.mudanca.soFormaTitulo}>
              {t.bpmn.mudanca.soForma}
            </button>
            <button className="botao botao-fantasma" onClick={() => setMudanca(null)}>
              {t.bpmn.mudanca.continuar}
            </button>
          </div>
        </div>
      )}
      {erro && <p className="faixa-erro">{t.bpmn.naoAbriu(erro)}</p>}
      <div ref={recipiente} className="canvas canvas-bpmn" />
    </div>
  );
}
