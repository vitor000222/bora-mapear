import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  BaseEdge,
  Background,
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
  type Caixa,
  type Correcoes,
  type EstiloVisual,
  type Matriz,
  type TipoEtapa,
} from '@bora-mapear/core';
import { useAvisos } from '../avisos.tsx';
import { exportarSvg, type FormatoImagem } from '../exportar.ts';
import { BotoesExportar } from './BotoesExportar.tsx';

interface Dados extends Record<string, unknown> {
  rotulo: string;
  tipo?: TipoEtapa;
  corFundo?: string;
  corBorda?: string;
}
type No = Node<Dados>;

const PALETA = [
  { nome: 'Azul', fundo: '#e3f2fd', borda: '#1565c0' },
  { nome: 'Verde', fundo: '#e8f5e9', borda: '#2e7d32' },
  { nome: 'Amarelo', fundo: '#fff8e1', borda: '#f9a825' },
  { nome: 'Laranja', fundo: '#fff3e0', borda: '#ef6c00' },
  { nome: 'Vermelho', fundo: '#ffebee', borda: '#c62828' },
  { nome: 'Roxo', fundo: '#f3e5f5', borda: '#6a1b9a' },
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

function NoTarefa({ data }: NodeProps<No>) {
  const marca = data.tipo === 'tarefa_manual' ? '✋' : data.tipo === 'tarefa_servico' ? '⚙' : data.tipo === 'tarefa_envio' ? '✉' : data.tipo === 'tarefa_recebimento' ? '⧗' : data.tipo === 'tarefa_regra' ? '▤' : data.tipo === 'tarefa_usuario' ? '👤' : '';
  return (
    <div className={`rf-tarefa ${data.tipo === 'subprocesso' ? 'rf-subprocesso' : ''}`} style={cor(data)}>
      {marca && <span className="rf-marca" aria-hidden>{marca}</span>}
      <span>{data.rotulo}</span>
      {data.tipo === 'subprocesso' && <span className="rf-mais" aria-hidden>+</span>}
      {alcas}
    </div>
  );
}

function NoEvento({ data }: NodeProps<No>) {
  const classe = data.tipo === 'inicio' ? 'rf-inicio' : data.tipo === 'fim' ? 'rf-fim' : 'rf-intermediario';
  const marca = data.tipo === 'evento_timer' ? '◷' : data.tipo === 'evento_mensagem' ? '✉' : '';
  return (
    <div className="rf-evento-caixa">
      <div className={`rf-evento ${classe}`} style={cor(data)}>
        {marca}
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

  const temCorrecao = Object.keys(correcoes.nos).length > 0;

  return (
    <div className="visao">
      <div className="barra-visao">
        <span className="suave pequeno">Arraste as etapas; selecione (Shift para várias) e escolha uma cor.</span>
        <div className="barra-visao-acoes">
          {sujo && <span className="selo selo-aviso">Correções não salvas</span>}
          <button
            className="botao"
            disabled={salvando}
            title="Pinta as etapas com as regras do seu estilo (Configurações)"
            onClick={() => {
              if (!estilo.regras.length) avisar('Você ainda não tem estilo. Defina ou aprenda um em Configurações.', 'info');
              else void aoSalvar(aplicarEstilo(matriz, estilo, correcoes));
            }}
          >
            Aplicar meu estilo
          </button>
          <button className="botao" onClick={() => void aoSalvar(correcoesVazias())} disabled={salvando || !temCorrecao} title="Apaga as correções desta visão">
            Voltar ao automático
          </button>
          <button className="botao botao-primario" onClick={() => void salvar()} disabled={!sujo || salvando}>
            {salvando ? 'Salvando…' : 'Salvar correções'}
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
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={20} />
          <ExportarReactFlow matriz={matriz} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeStrokeWidth={2} style={{ width: 160, height: 100 }} />
          {selecionados.length > 0 && (
            <Panel position="top-right" className="paleta">
              <span className="pequeno">Cor de {selecionados.length === 1 ? '1 etapa' : `${selecionados.length} etapas`}</span>
              <div className="paleta-cores">
                {PALETA.map((c) => (
                  <button
                    key={c.nome}
                    className="amostra"
                    style={{ background: c.fundo, borderColor: c.borda }}
                    title={c.nome}
                    aria-label={`Pintar de ${c.nome.toLowerCase()}`}
                    onClick={() => pintar(c.fundo, c.borda)}
                  />
                ))}
                <button className="amostra amostra-sem" title="Sem cor" aria-label="Tirar a cor" onClick={() => pintar()}>
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
