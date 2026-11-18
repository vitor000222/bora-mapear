import type { Idioma } from './idioma.ts';
import { rotulosTipo, type Matriz } from './matriz.ts';
import type { ResultadoValidacao } from './validar.ts';
import { escaparXml } from './renderizadores/bpmn.ts';

export interface EntradaPrevia {
  matriz: Matriz;
  validacao: ResultadoValidacao;
  bpmn: string;
  mermaid: string;
  /** Idioma da página. Padrão: português. */
  idioma?: Idioma;
}

const TEXTOS = {
  pt: {
    lang: 'pt-BR',
    semProblemas: 'Sem erros nem avisos.',
    resumo: (etapas: number, raias: number, ok: boolean) =>
      `${etapas} etapas · ${raias} raias · portão: <strong>${ok ? 'aprovada' : 'reprovada'}</strong>`,
    abas: { matriz: 'Matriz', portao: 'Portão' },
    codigo: 'Código',
    colunas: ['Chave', 'Raia', 'Tipo', 'Nome', 'Sistema', 'Próximos'],
    bpmnFalhou: 'O bpmn-js não abriu o XML: ',
    avisosBpmn: 'Avisos do bpmn-js:',
    mermaidFalhou: 'O Mermaid não leu o código: ',
  },
  en: {
    lang: 'en',
    semProblemas: 'No errors or warnings.',
    resumo: (etapas: number, raias: number, ok: boolean) =>
      `${etapas} steps · ${raias} lanes · gate: <strong>${ok ? 'passed' : 'failed'}</strong>`,
    abas: { matriz: 'Matrix', portao: 'Gate' },
    codigo: 'Code',
    colunas: ['Key', 'Lane', 'Type', 'Name', 'System', 'Next'],
    bpmnFalhou: 'bpmn-js could not open the XML: ',
    avisosBpmn: 'bpmn-js warnings:',
    mermaidFalhou: 'Mermaid could not read the code: ',
  },
} satisfies Record<Idioma, unknown>;

/**
 * Uma página HTML só, para conferir as três linguagens lado a lado sem subir o app.
 * Carrega bpmn-js e mermaid de CDN.
 */
export function gerarPrevia({ matriz, validacao, bpmn, mermaid, idioma = 'pt' }: EntradaPrevia): string {
  const t = TEXTOS[idioma];
  const tipos = rotulosTipo(idioma);
  const textos = { bpmnFalhou: t.bpmnFalhou, avisosBpmn: t.avisosBpmn, mermaidFalhou: t.mermaidFalhou };
  const dados = JSON.stringify({ bpmn, mermaid, textos }).replace(/</g, '\\u003c');
  const h = escaparXml;
  const problemas = validacao.problemas.length
    ? `<ul>${validacao.problemas.map((p) => `<li class="${p.severidade}"><code>${p.codigo}</code> ${h(p.mensagem)}</li>`).join('')}</ul>`
    : `<p>${t.semProblemas}</p>`;
  const raias = new Map(matriz.raias.map((r) => [r.id, r.nome]));
  const linhas = matriz.etapas
    .map(
      (e) =>
        `<tr><td><code>${h(e.chave)}</code></td><td>${h(raias.get(e.raia) ?? e.raia)}</td><td>${h(tipos[e.tipo])}</td>` +
        `<td>${h(e.nome)}</td><td>${h(e.sistema ?? '')}</td>` +
        `<td>${e.proximos.map((s) => `${h(s.para)}${s.rotulo ? ` <em>(${h(s.rotulo)})</em>` : ''}`).join('<br>')}</td></tr>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(matriz.processo.nome)} · Bora Mapear</title>
<link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.11.1/dist/assets/diagram-js.css">
<link rel="stylesheet" href="https://unpkg.com/bpmn-js@17.11.1/dist/assets/bpmn-js.css">
<style>
  :root { --fundo:#f7f7f8; --cartao:#fff; --texto:#1f2328; --suave:#59636e; --linha:#d8dee4; --erro:#b42318; --aviso:#9a6700; --marca:#4f46e5; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background:var(--fundo); color:var(--texto); }
  header { padding:20px 24px 8px; }
  header h1 { margin:0; font-size:22px; }
  header p { margin:4px 0 0; color:var(--suave); }
  nav { display:flex; gap:4px; padding:0 24px; border-bottom:1px solid var(--linha); }
  nav button { border:0; background:none; padding:10px 14px; font:inherit; color:var(--suave); cursor:pointer; border-bottom:2px solid transparent; }
  nav button[aria-selected="true"] { color:var(--texto); border-bottom-color:var(--marca); font-weight:600; }
  section { display:none; padding:16px 24px 32px; }
  section.ativa { display:block; }
  .cartao { background:var(--cartao); border:1px solid var(--linha); border-radius:8px; overflow:auto; }
  #canvas { height:72vh; }
  #mermaid { padding:16px; min-height:40vh; }
  table { border-collapse:collapse; width:100%; font-size:14px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--linha); vertical-align:top; }
  th { background:#f0f1f3; position:sticky; top:0; }
  li.erro { color:var(--erro); } li.aviso { color:var(--aviso); }
  pre { margin:0; padding:16px; font-size:13px; white-space:pre; }
</style>
</head>
<body>
<header>
  <h1>${h(matriz.processo.nome)}</h1>
  <p>${t.resumo(matriz.etapas.length, matriz.raias.length, validacao.ok)}</p>
</header>
<nav role="tablist">
  <button role="tab" aria-selected="true" data-aba="bpmn">BPMN</button>
  <button role="tab" aria-selected="false" data-aba="mermaid-aba">Mermaid</button>
  <button role="tab" aria-selected="false" data-aba="matriz">${t.abas.matriz}</button>
  <button role="tab" aria-selected="false" data-aba="portao">${t.abas.portao}</button>
</nav>
<section id="bpmn" class="ativa"><div id="canvas" class="cartao"></div></section>
<section id="mermaid-aba"><div id="mermaid" class="cartao"></div><details style="margin-top:12px"><summary>${t.codigo}</summary><pre class="cartao" id="mermaid-codigo"></pre></details></section>
<section id="matriz"><div class="cartao"><table><thead><tr>${t.colunas.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
${linhas}
</tbody></table></div></section>
<section id="portao"><div class="cartao" style="padding:8px 16px">${problemas}</div></section>
<script type="application/json" id="dados">${dados}</script>
<script src="https://unpkg.com/bpmn-js@17.11.1/dist/bpmn-navigated-viewer.production.min.js"></script>
<script type="module">
  const dados = JSON.parse(document.getElementById('dados').textContent);
  for (const botao of document.querySelectorAll('nav button')) {
    botao.addEventListener('click', () => {
      for (const b of document.querySelectorAll('nav button')) b.setAttribute('aria-selected', String(b === botao));
      for (const s of document.querySelectorAll('section')) s.classList.toggle('ativa', s.id === botao.dataset.aba);
    });
  }
  const visor = new BpmnJS({ container: '#canvas' });
  window.visor = visor;
  try {
    const { warnings } = await visor.importXML(dados.bpmn);
    visor.get('canvas').zoom('fit-viewport');
    if (warnings.length) console.warn(dados.textos.avisosBpmn, warnings);
    window.avisosBpmn = warnings.length;
  } catch (erro) {
    document.getElementById('canvas').textContent = dados.textos.bpmnFalhou + erro.message;
    window.avisosBpmn = -1;
  }
  document.getElementById('mermaid-codigo').textContent = dados.mermaid;
  const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: true } });
  try {
    const { svg } = await mermaid.render('grafico', dados.mermaid);
    document.getElementById('mermaid').innerHTML = svg;
    window.mermaidOk = true;
  } catch (erro) {
    document.getElementById('mermaid').textContent = dados.textos.mermaidFalhou + erro.message;
    window.mermaidOk = false;
  }
</script>
</body>
</html>
`;
}
