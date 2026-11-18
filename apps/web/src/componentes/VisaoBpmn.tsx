import { useEffect, useRef, useState } from 'react';
import Modeler from 'bpmn-js/lib/Modeler';
import CorModule from 'bpmn-js-color-picker';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import 'bpmn-js-color-picker/colors/color-picker.css';
import {
  aplicarEstilo,
  compararMatrizes,
  correcoesVazias,
  extrairCorrecoesDoBpmn,
  importarBpmn,
  reconciliarComOriginal,
  renderizarBpmn,
  validarMatriz,
  type Correcoes,
  type EstiloVisual,
  type Matriz,
} from '@bora-mapear/core';
import { exportarSvg } from '../exportar.ts';
import { BotoesExportar } from './BotoesExportar.tsx';
import { useAvisos } from '../avisos.tsx';

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
    const m = new Modeler({ container: recipiente.current!, additionalModules: [CorModule] });
    modeler.current = m;
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

  const xmlAtual = async () => (await modeler.current!.saveXML({ format: false })).xml ?? '';

  /** Salva a forma. Se o desenho também mudou de conteúdo, mostra o que mudou e deixa escolher. */
  const salvar = async () => {
    if (!modeler.current) return;
    setSalvando(true);
    try {
      const xml = await xmlAtual();
      const lida = await importarBpmn(xml);
      const nova = reconciliarComOriginal(matriz, lida.matriz);
      const frases = compararMatrizes(matriz, nova).filter((f) => !/^Detalhes de/.test(f));
      if (frases.length) {
        setMudanca({ xml, matriz: nova, frases, erros: validarMatriz(nova).problemas.filter((p) => p.severidade === 'erro').map((p) => p.mensagem) });
        return;
      }
      await aoSalvar(extrairCorrecoesDoBpmn(xml, matriz).correcoes, []);
    } catch (e) {
      avisar(`Não deu para ler o desenho: ${e instanceof Error ? e.message : String(e)}`, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  /** Conteúdo vira versão nova; depois a forma é salva já sobre a matriz nova. */
  const salvarComoVersao = async () => {
    if (!mudanca) return;
    setSalvando(true);
    try {
      const ok = await aoSalvarVersao(mudanca.matriz, 'Editada no desenho BPMN.');
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
    if (desconhecidos.length || ausentes.length) ignorado.push('Elementos criados ou apagados no desenho voltam ao que a matriz diz.');
    setMudanca(null);
    await aoSalvar(novas, ignorado);
  };

  const aplicarMeuEstilo = async () => {
    if (!estilo.regras.length) {
      avisar('Você ainda não tem estilo. Defina ou aprenda um em Configurações.', 'info');
      return;
    }
    await aoSalvar(aplicarEstilo(matriz, estilo, correcoes), []);
  };


  const temCorrecao = Object.keys(correcoes.nos).length > 0 || Object.keys(correcoes.arestas).length > 0 || Object.keys(correcoes.raias).length > 0 || Boolean(correcoes.pool);

  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">
          Arraste, redimensione e pinte (clique no elemento → ícone de cor). Renomear, criar ou apagar aqui também vale: ao salvar, o app mostra o que mudou na matriz.
        </span>
        <div className="barra-visao-acoes">
          {sujo && <span className="selo selo-aviso">Mudanças não salvas</span>}
          <BotoesExportar aoExportar={async (f) => exportarSvg((await modeler.current!.saveSVG()).svg, f, nomeArquivo)} />
          <button className="botao" onClick={() => void aplicarMeuEstilo()} disabled={salvando} title="Pinta as etapas com as regras do seu estilo (Configurações)">
            Aplicar meu estilo
          </button>
          <button className="botao" onClick={() => void aoSalvar(correcoesVazias(), [])} disabled={salvando || !temCorrecao} title="Apaga as correções desta visão e volta ao layout automático">
            Voltar ao automático
          </button>
          <button className="botao botao-primario" onClick={() => void salvar()} disabled={!sujo || salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
      {mudanca && (
        <div className="cartao secao painel-mudanca" role="alertdialog" aria-labelledby="titulo-mudanca">
          <strong id="titulo-mudanca">O desenho mudou o conteúdo da matriz</strong>
          <ul className="pequeno">
            {mudanca.frases.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {mudanca.erros.length > 0 && (
            <div className="pequeno texto-aviso">
              O portão vai acusar {mudanca.erros.length} {mudanca.erros.length === 1 ? 'erro' : 'erros'}. Dá para salvar e corrigir na Matriz.
              <ul>
                {mudanca.erros.slice(0, 3).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="barra-visao-acoes">
            <button className="botao botao-primario" onClick={() => void salvarComoVersao()} disabled={salvando}>
              Salvar como versão {proximaVersao}
            </button>
            <button
              className="botao"
              onClick={() => {
                aoRevisarProposta(mudanca.matriz);
                setMudanca(null);
              }}
            >
              Revisar na Matriz
            </button>
            <button className="botao" onClick={() => void soForma()} disabled={salvando} title="Guarda só posições e cores; o conteúdo volta ao da matriz">
              Salvar só a forma
            </button>
            <button className="botao botao-fantasma" onClick={() => setMudanca(null)}>
              Continuar editando
            </button>
          </div>
        </div>
      )}
      {erro && <p className="faixa-erro">O bpmn-js não abriu o desenho: {erro}</p>}
      <div ref={recipiente} className="canvas canvas-bpmn" />
    </div>
  );
}
