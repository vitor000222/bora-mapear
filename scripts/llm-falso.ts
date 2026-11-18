// Provedor falso, compatível com a API da OpenAI, para testar a interface sem chave e sem custo.
// Responde como cada agente do Bora Mapear, com respostas montadas a partir do próprio pedido.
// Uso: npm run llm-falso  →  cadastre em Configurações um provedor "Outro" com URL http://127.0.0.1:11435/v1
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORTA = Number(process.env['PORTA_FALSO'] ?? 11435);

interface Mensagem {
  role: string;
  content: string;
}

function json(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(corpo));
}

function ler(req: IncomingMessage): Promise<string> {
  return new Promise((ok) => {
    let dados = '';
    req.on('data', (p) => (dados += p));
    req.on('end', () => ok(dados));
  });
}

const frasesDe = (texto: string) =>
  texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.split(/\s+/).length >= 4 && !/^\[\d/.test(f));

function leitor(usuario: string) {
  const trecho = /<<<\n([\s\S]*?)\n>>>/.exec(usuario)?.[1] ?? usuario;
  const linhas = trecho.split('\n').map((l) => l.replace(/^\[[\d:]+\]\s*([^:]{1,40}:\s*)?/, '').trim());
  const frases = frasesDe(linhas.join('\n')).slice(0, 10);
  return { evidencias: frases.map((citacao) => ({ citacao, sobre: /\?|se |decide|aprova/i.test(citacao) ? 'decisao' : 'etapa' })) };
}

function nomeDaTarefa(citacao: string) {
  const palavras = citacao.replace(/[".,;:]/g, '').split(/\s+/).slice(0, 6);
  return palavras.join(' ').replace(/^./, (c) => c.toUpperCase());
}

function mapeador(mensagens: Mensagem[]) {
  const primeira = mensagens.find((m) => m.role === 'user')?.content ?? '';
  const evidencias = [...primeira.matchAll(/^(EV-\d+) \[[^\]]*\] \((\w+)\) "(.*)"/gm)].slice(0, 8);
  const corrigindo = mensagens.at(-1)?.content.includes('O portão reprovou') ?? false;
  const etapas: Array<Record<string, unknown>> = [
    { chave: 'E01', tipo: 'inicio', nome: 'Demanda recebida', raia: 'equipe', proximos: [{ para: 'E02' }], evidencias: [evidencias[0]?.[1] ?? 'EV-001'] },
  ];
  evidencias.forEach((ev, i) => {
    const chave = `E${String(i + 2).padStart(2, '0')}`;
    const proxima = `E${String(i + 3).padStart(2, '0')}`;
    etapas.push({ chave, tipo: 'tarefa_usuario', nome: nomeDaTarefa(ev[3]!), raia: i % 2 ? 'apoio' : 'equipe', proximos: [{ para: proxima }], evidencias: [ev[1]] });
  });
  const fim = `E${String(evidencias.length + 2).padStart(2, '0')}`;
  etapas.push({ chave: fim, tipo: 'fim', nome: 'Demanda atendida', raia: 'equipe', proximos: [] });
  // Primeira rodada com um erro de propósito, para mostrar o portão devolvendo ao agente.
  if (!corrigindo && etapas.length > 3) (etapas[1]!['proximos'] as Array<{ para: string }>)[0]!.para = 'E99';
  return {
    versaoSchema: 1,
    processo: { id: 'processo', nome: 'Processo' },
    raias: [
      { id: 'equipe', nome: 'Equipe' },
      { id: 'apoio', nome: 'Apoio' },
    ],
    etapas,
  };
}

function editor(usuario: string) {
  const matriz = JSON.parse(/Matriz atual:\n(\{[\s\S]*\})\n\nPedido:/.exec(usuario)?.[1] ?? '{"etapas":[]}') as { etapas: Array<{ chave: string; tipo: string; raia: string; proximos: Array<{ para: string }> }> };
  const pedido = /Pedido: (.*)$/s.exec(usuario)?.[1]?.trim() ?? 'nova etapa';
  const alvo = matriz.etapas.find((e) => e.tipo.startsWith('tarefa')) ?? matriz.etapas[0];
  if (!alvo) return { resumo: 'Nada a fazer', operacoes: [] };
  const maior = Math.max(...matriz.etapas.map((e) => Number(/\d+/.exec(e.chave)?.[0] ?? 0)));
  const chave = `E${String(maior + 1).padStart(2, '0')}`;
  return {
    resumo: `Inclui "${nomeDaTarefa(pedido)}" depois de ${alvo.chave}`,
    operacoes: [
      { op: 'adicionar_etapa', depoisDe: alvo.chave, etapa: { chave, tipo: 'tarefa_usuario', nome: nomeDaTarefa(pedido), raia: alvo.raia, proximos: alvo.proximos } },
      { op: 'alterar_etapa', chave: alvo.chave, campos: { proximos: [{ para: chave }] } },
    ],
  };
}

function revisor() {
  return {
    resumo: 'Mapeamento de demonstração, feito pelo provedor falso. O fluxo fecha, mas falta saber o que acontece quando algo dá errado.',
    lacunas: [{ descricao: 'Não há caminho de exceção.', pergunta: 'O que acontece quando a demanda chega incompleta?', chaves: ['E02'] }],
    revisar: [{ chave: 'E02', motivo: 'Nome tirado direto da citação; reescreva como verbo + objeto.' }],
  };
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url?.endsWith('/models')) return json(res, 200, { data: [{ id: 'falso/agente-demo' }] });
  if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) return json(res, 404, { error: { message: 'rota desconhecida' } });
  const corpo = JSON.parse(await ler(req)) as { messages: Mensagem[] };
  const sistema = corpo.messages.find((m) => m.role === 'system')?.content ?? '';
  const usuario = corpo.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
  let resposta: unknown;
  if (sistema.startsWith('Você é o Leitor')) resposta = leitor(usuario);
  else if (sistema.startsWith('Você é o Mapeador')) resposta = mapeador(corpo.messages);
  else if (sistema.startsWith('Você é o Editor')) resposta = editor(corpo.messages.find((m) => m.role === 'user')?.content ?? '');
  else if (sistema.startsWith('Você é o Revisor')) resposta = revisor();
  else resposta = { ok: true };
  await new Promise((ok) => setTimeout(ok, 600));
  json(res, 200, {
    choices: [{ message: { role: 'assistant', content: JSON.stringify(resposta) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: Math.round(JSON.stringify(corpo).length / 4), completion_tokens: Math.round(JSON.stringify(resposta).length / 4) },
  });
}).listen(PORTA, '127.0.0.1', () => console.log(`Provedor falso em http://127.0.0.1:${PORTA}/v1 (não chama modelo nenhum)`));
