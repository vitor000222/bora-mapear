import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useInternalNode,
  useNodes,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  aplicarEstilo,
  caixaDoRotuloDaSeta,
  correcoesVazias,
  extrairCorrecoesDoReactFlow,
  renderizarReactFlow,
  renderizarSvg,
  rotear,
  temCorrecoes,
  type Caixa,
  type Correcoes,
  type EstiloVisual,
  type Matriz,
  type TipoEtapa,
} from '@bora-mapear/core';
import { useAvisos } from '../avisos.tsx';
import { exportarSvg, type FormatoImagem } from '../exportar.ts';
import { BotoesExportar } from './BotoesExportar.tsx';
import { useTextos, type Textos } from '../i18n/index.tsx';

interface Dados extends Record<string, unknown> {
  rotulo: string;
  tipo?: TipoEtapa;
  corFundo?: string;
  corBorda?: string;
}
type No = Node<Dados>;

// O nome de cada cor vem dos textos (desenho.reactflow.cores).
const PALETA: { cor: keyof Textos['desenho']['reactflow']['cores']; fundo: string; borda: string }[] = [
  { cor: 'azul', fundo: '#e3f2fd', borda: '#1565c0' },
  { cor: 'verde', fundo: '#e8f5e9', borda: '#2e7d32' },
  { cor: 'amarelo', fundo: '#fff8e1', borda: '#f9a825' },
  { cor: 'laranja', fundo: '#fff3e0', borda: '#ef6c00' },
  { cor: 'vermelho', fundo: '#ffebee', borda: '#c62828' },
  { cor: 'roxo', fundo: '#f3e5f5', borda: '#6a1b9a' },
];

const cor = (d: Dados): CSSProperties => ({
  ...(d.corFundo ? { background: d.corFundo } : {}),
  ...(d.corBorda ? { borderColor: d.corBorda } : {}),
});

const alcas = (
  <>
    <Handle type="target" position={Position.Left} className="alca" isConnectable={false} />
    <Handle type="source" position={Position.Right} className="alca" isConnectable={false} />
  </>
);

function NoRaia({ data }: NodeProps<No>) {
  return (
    <div className="rf-raia">
      <span className="rf-raia-nome">{data.rotulo}</span>
    </div>
  );
}

/**
 * Marcas do BPMN em traço, na cor do texto (emoji muda de cor e de desenho conforme o sistema).
 * Caixa de 14 × 14.
 */
function Marca({ tipo }: { tipo: TipoEtapa | undefined }) {
  const traco = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let desenho: ReactNode = null;
  if (tipo === 'tarefa_usuario')
    desenho = (
      <>
        <circle cx="7" cy="4.6" r="2.4" {...traco} />
        <path d="M2.6 12.4c0-2.6 2-4.2 4.4-4.2s4.4 1.6 4.4 4.2" {...traco} />
      </>
    );
  else if (tipo === 'tarefa_manual')
    desenho = <path d="M3.4 8.2V6.4M3.4 8.2c0 2.6 1.4 4.2 3.8 4.2 2.2 0 3.6-1.5 3.6-3.8V5.3M5.2 7.4V3.1M7.1 7.2V2.4M9 7.4V3.3M10.8 6.6V5.3M3.4 6.4c0-.9 1.8-.9 1.8 0M5.2 3.1c0-.9 1.9-.9 1.9 0M7.1 2.4c0-.9 1.9-.9 1.9.1M9 3.3c0-.9 1.8-.9 1.8 0" {...traco} />;
  else if (tipo === 'tarefa_servico')
    desenho = (
      <>
        <circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="1.7 1.68" />
        <circle cx="7" cy="7" r="3.2" {...traco} />
        <circle cx="7" cy="7" r="1.2" {...traco} />
      </>
    );
  else if (tipo === 'tarefa_envio')
    desenho = (
      <>
        <rect x="1.6" y="3.4" width="10.8" height="7.4" rx="0.6" fill="currentColor" />
        <path d="M1.9 3.8 7 7.6l5.1-3.8" fill="none" stroke="var(--cartao)" strokeWidth="1.1" />
      </>
    );
  else if (tipo === 'tarefa_recebimento' || tipo === 'evento_mensagem')
    desenho = (
      <>
        <rect x="1.6" y="3.4" width="10.8" height="7.4" rx="0.6" {...traco} />
        <path d="M1.9 3.8 7 7.6l5.1-3.8" {...traco} />
      </>
    );
  else if (tipo === 'tarefa_regra')
    desenho = (
      <>
        <rect x="1.6" y="2.6" width="10.8" height="8.8" rx="0.4" {...traco} />
        <path d="M1.6 5.2h10.8M1.6 8.3h10.8M4.8 5.2v6.2" {...traco} />
      </>
    );
  else if (tipo === 'evento_timer')
    desenho = (
      <>
        <circle cx="7" cy="7" r="4.6" {...traco} />
        <path d="M7 4.2V7l1.9 1.3" {...traco} />
      </>
    );
  if (!desenho) return null;
  return (
    <svg className="rf-marca" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {desenho}
    </svg>
  );
}

function NoTarefa({ data }: NodeProps<No>) {
  return (
    <div className={`rf-tarefa ${data.tipo === 'subprocesso' ? 'rf-subprocesso' : ''}`} style={cor(data)}>
      <Marca tipo={data.tipo} />
      <span>{data.rotulo}</span>
      {data.tipo === 'subprocesso' && <span className="rf-mais" aria-hidden>+</span>}
      {alcas}
    </div>
  );
}

function NoEvento({ data }: NodeProps<No>) {
  const classe = data.tipo === 'inicio' ? 'rf-inicio' : data.tipo === 'fim' ? 'rf-fim' : 'rf-intermediario';
  return (
    <div className="rf-evento-caixa">
      <div className={`rf-evento ${classe}`} style={cor(data)}>
        <Marca tipo={data.tipo} />
      </div>
      {data.rotulo && <span className="rf-rotulo-externo">{data.rotulo}</span>}
      {alcas}
    </div>
  );
}

function NoGateway({ data }: NodeProps<No>) {
  const marca = data.tipo === 'gateway_paralelo' ? '+' : data.tipo === 'gateway_inclusivo' ? '○' : data.tipo === 'gateway_evento' ? '⬠' : '×';
  return (
    <div className="rf-gateway-caixa">
      <div className="rf-gateway" style={cor(data)} />
      <span className="rf-gateway-marca">{marca}</span>
      {data.rotulo && <span className="rf-rotulo-gateway">{data.rotulo}</span>}
      {alcas}
    </div>
  );
}

const TIPOS_DE_NO = { raia: NoRaia, tarefa: NoTarefa, subprocesso: NoTarefa, evento: NoEvento, gateway: NoGateway };

function caixaDoNo(n: InternalNode<No> | No): Caixa {
  const posicao = 'internals' in n ? n.internals.positionAbsolute : n.position;
  return { x: posicao.x, y: posicao.y, largura: n.measured?.width ?? n.width ?? 0, altura: n.measured?.height ?? n.height ?? 0 };
}

/**
 * Seta com o mesmo roteador do BPMN (núcleo), recalculado com a posição atual dos nós:
 * laço por cima, desvio de etapas, rótulo colado à saída.
 */
function ArestaRoteada({ id, source, target, label, markerEnd }: EdgeProps) {
  const origem = useInternalNode<No>(source);
  const destino = useInternalNode<No>(target);
  const nos = useNodes<No>();
  if (!origem || !destino) return null;
  const s = caixaDoNo(origem);
  const t = caixaDoNo(destino);
  const obstaculos = nos.filter((n) => n.type !== 'raia' && n.id !== source && n.id !== target).map(caixaDoNo);
  const pontos = rotear(s, t, origem.type === 'gateway', [s, t, ...obstaculos]);
  const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const texto = typeof label === 'string' ? label : '';
  const rotulo = texto ? caixaDoRotuloDaSeta(pontos, texto) : null;
  return (
    <>
      <BaseEdge id={id} path={caminho} {...(markerEnd ? { markerEnd } : {})} />
      {rotulo && (
        <EdgeLabelRenderer>
          <div className="rf-rotulo-seta" style={{ transform: `translate(${rotulo.x}px, ${rotulo.y}px)` }}>
            {texto}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const TIPOS_DE_ARESTA = { roteada: ArestaRoteada };

/**
 * Exporta o desenho inteiro como está na tela (posições e cores ainda não salvas incluídas),
 * pelo SVG puro do núcleo: PNG nítido e PDF vetorial. Fica dentro do ReactFlow para usar o hook.
 */
function ExportarReactFlow({ matriz }: { matriz: Matriz }) {
  const { getNodes } = useReactFlow<No>();
  const exportar = async (formato: FormatoImagem) => {
    const nos = getNodes().map((n) => {
      const salvo: Parameters<typeof extrairCorrecoesDoReactFlow>[0][number] = { id: n.id, position: n.position, data: n.data };
      if (n.type) salvo.type = n.type;
      if (n.width !== undefined) salvo.width = n.width;
      if (n.height !== undefined) salvo.height = n.height;
      return salvo;
    });
    const { correcoes } = extrairCorrecoesDoReactFlow(nos, matriz);
    await exportarSvg(renderizarSvg(matriz, { correcoes }), formato, matriz.processo.id);
  };
  return (
    <Panel position="top-left" className="paleta">
      <BotoesExportar aoExportar={exportar} />
    </Panel>
  );
}

interface Props {
  matriz: Matriz;
  correcoes: Correcoes;
  estilo: EstiloVisual;
  aoSalvar: (correcoes: Correcoes) => Promise<void>;
  /** Subprocessos ligados: duplo clique abre o mapeamento filho. */
  filhos: Record<string, { id: string; nome: string } | null>;
}

/** O desenho no React Flow, nas mesmas coordenadas do BPMN. Arrastar e pintar vira correção. */
export function VisaoReactFlow({ matriz, correcoes, estilo, aoSalvar, filhos }: Props) {
  const avisar = useAvisos();
  const t = useTextos().desenho;
  const inicial = useMemo(() => renderizarReactFlow(matriz, { correcoes }), [matriz, correcoes]);
  const [nodes, setNodes, aoMudarNos] = useNodesState<No>(inicial.nodes as No[]);
  const [edges, setEdges, aoMudarArestas] = useEdgesState<Edge>(inicial.edges as Edge[]);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setNodes(inicial.nodes.map((n) => (n.type === 'raia' ? { ...n, className: 'no-raia' } : n)) as No[]);
    setEdges(inicial.edges.map((e) => ({ ...e, type: 'roteada' })) as Edge[]);
    setSujo(false);
  }, [inicial, setNodes, setEdges]);

  const aoMudar = (mudancas: NodeChange<No>[]) => {
    if (mudancas.some((m) => m.type === 'position' && m.dragging)) setSujo(true);
    aoMudarNos(mudancas);
  };

  const selecionados = nodes.filter((n) => n.selected && n.type !== 'raia');
  const pintar = (fundo?: string, borda?: string) => {
    setNodes((atual) =>
      atual.map((n) => {
        if (!n.selected || n.type === 'raia') return n;
        const { corFundo: _f, corBorda: _b, ...resto } = n.data;
        return { ...n, data: fundo && borda ? { ...resto, corFundo: fundo, corBorda: borda } : resto };
      }),
    );
    setSujo(true);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const { correcoes: novas } = extrairCorrecoesDoReactFlow(
        nodes.map((n) => {
          const salvo: Parameters<typeof extrairCorrecoesDoReactFlow>[0][number] = { id: n.id, position: n.position, data: n.data };
          if (n.type) salvo.type = n.type;
          if (n.width !== undefined) salvo.width = n.width;
          if (n.height !== undefined) salvo.height = n.height;
          return salvo;
        }),
        matriz,
      );
      await aoSalvar(novas);
    } finally {
      setSalvando(false);
    }
  };

  // Conta seta, raia e pool também: "Voltar ao automático" apaga tudo, então tem de valer para tudo.
  const temCorrecao = temCorrecoes(correcoes);

  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">{t.reactflow.dica}</span>
        <div className="barra-visao-acoes">
          {sujo && <span className="selo selo-aviso">{t.reactflow.naoSalvas}</span>}
          <button
            className="botao"
            disabled={salvando}
            title={t.acoes.aplicarEstiloTitulo}
            onClick={() => {
              if (!estilo.regras.length) avisar(t.acoes.semEstilo, 'info');
              else void aoSalvar(aplicarEstilo(matriz, estilo, correcoes));
            }}
          >
            {t.acoes.aplicarEstilo}
          </button>
          <button className="botao" onClick={() => void aoSalvar(correcoesVazias())} disabled={salvando || !temCorrecao} title={t.reactflow.voltarAutomaticoTitulo}>
            {t.acoes.voltarAutomatico}
          </button>
          <button className="botao botao-primario" onClick={() => void salvar()} disabled={!sujo || salvando}>
            {salvando ? t.acoes.salvando : t.reactflow.salvarCorrecoes}
          </button>
        </div>
      </div>
      <div className="canvas canvas-rf">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={TIPOS_DE_NO}
          edgeTypes={TIPOS_DE_ARESTA}
          onNodesChange={aoMudar}
          onNodeDoubleClick={(_, no) => {
            const filho = filhos[no.id];
            if (filho) window.location.hash = `#/m/${filho.id}`;
          }}
          onEdgesChange={aoMudarArestas}
          nodesConnectable={false}
          deleteKeyCode={null}
          fitView
          minZoom={0.2}
          // Sem cor fixa, a ponta da seta segue --xy-edge-stroke (a tinta do CSS), como a linha.
          defaultMarkerColor={null}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Lines} gap={24} />
          <ExportarReactFlow matriz={matriz} />
          <Controls showInteractive={false} />
          {/* O canvas é sempre claro, então as cores do minimapa podem ser fixas: raia em papel com linha, etapa em grafite. */}
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => (n.type === 'raia' ? '#ffffff' : '#5e5e57')}
            nodeStrokeColor={(n) => (n.type === 'raia' ? '#c3c3ba' : '#5e5e57')}
            nodeStrokeWidth={3}
            style={{ width: 140, height: 88 }}
          />
          {selecionados.length > 0 && (
            <Panel position="top-right" className="paleta">
              <span className="pequeno">{t.reactflow.corDe(selecionados.length)}</span>
              <div className="paleta-cores">
                {PALETA.map((c) => (
                  <button
                    key={c.cor}
                    className="amostra"
                    style={{ background: c.fundo, borderColor: c.borda }}
                    title={t.reactflow.cores[c.cor]}
                    aria-label={t.reactflow.pintarDe(t.reactflow.cores[c.cor])}
                    onClick={() => pintar(c.fundo, c.borda)}
                  />
                ))}
                <button className="amostra amostra-sem" title={t.reactflow.semCor} aria-label={t.reactflow.tirarCor} onClick={() => pintar()}>
                  ⌀
                </button>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
