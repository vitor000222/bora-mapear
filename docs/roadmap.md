# Roadmap

## Fase 0 — Núcleo ✅

- [x] Schema da matriz (Zod) e JSON Schema para os agentes
- [x] Portão: validação determinística com mensagens para o agente corrigir
- [x] Layout automático em raias, determinístico: laços por cima, setas que desviam das etapas, rótulos encostados na saída
- [x] Renderizadores: Mermaid, React Flow (nós e arestas) e BPMN 2.0 com diagrama (abre no bpmn-js e no Camunda Modeler)
- [x] Correções: aplicar na renderização, extrair do BPMN editado e do React Flow, descrever em frases
- [x] CLI: `validar`, `renderizar`, `extrair`, `schema`
- [x] Testes com `node:test`

## Fase 1 — App local ✅

- [x] `apps/server`: Hono + SQLite (módulo nativo do Node), API de mapeamentos, versões, visões e registro
- [x] `apps/web`: Vite + React
  - [x] Lista de mapeamentos; criar escolhendo a linguagem, em branco ou pelo exemplo
  - [x] Grade da matriz com o portão ao vivo (editar raias, etapas, tipo, saídas, detalhes)
  - [x] Visão BPMN (bpmn-js, com cor) e XML; React Flow (arrastar, pintar, setas com o roteador do núcleo); Mermaid (desenho, código editável com prévia)
  - [x] Salvar correções e registrar em frases o que mudou em cada gravação
  - [x] Histórico de versões da matriz, com restaurar
- [x] `npm run dev` sobe tudo; `npm run build` + `npm start` numa porta só

Ficou para depois: correção de rota de seta no React Flow, rótulo de seta movido no bpmn-js e correções
compartilhadas entre BPMN e React Flow.

## Fase 2 — Agentes ✅

- [x] Cadastro de provedores (OpenRouter, OpenAI-compatível, Anthropic, Google, Groq, DeepSeek, Ollama, LM Studio) com chave cifrada, teste de conexão e lista de modelos
- [x] Modelo por agente, com um padrão
- [x] Leitor: PDF, DOCX, TXT, MD, VTT/SRT → evidências numeradas, cada citação conferida contra a fonte
- [x] Mapeador + portão em laço (até três rodadas)
- [x] Revisor: lacunas com a pergunta para o cliente, linhas para revisão humana, conferências automáticas
- [x] Editor: pedido em português → operações sobre a matriz, aplicadas por código
- [x] Execuções em segundo plano, com progresso, tokens e custo; propostas aplicadas como versão ou revisadas antes
- [x] Provedor falso para testar sem chave

Ficou para depois: transcrever áudio e vídeo, OCR de PDF escaneado, e cancelar uma execução em andamento.

## Fase 3 — Aprender com a correção ✅

- [x] Agente Visual: aprende regras de estilo (cor por tipo, família, raia, revisão) a partir das cores aplicadas e do registro de correções; "Aplicar meu estilo" em BPMN, React Flow e Mermaid
- [x] Importador BPMN → matriz, determinístico: edição de conteúdo no bpmn-js vira proposta de nova versão, com o que mudou em frases
- [x] Importador Mermaid → matriz, determinístico; o que ele não lê vai para o agente Conversor
- [x] Importar processo de outra ferramenta (BPMN, Mermaid, ou qualquer texto pelo Conversor)
- [x] Comparar duas matrizes em frases

Ficou para depois: estilo de espaçamento e de ordem das raias, e posições aprendidas (hoje o estilo é só de cor).

## Fase 4 — Para usar de verdade ✅

- [x] Postgres via `DATABASE_URL` (driver `pg`), com os testes da API rodando em SQLite e em Postgres (PGlite)
- [x] `Dockerfile` e `docker compose` com Postgres
- [x] Exportar SVG, PNG e PDF (vetorial) nas três linguagens
- [x] Importar e exportar a matriz em CSV, que abre no Excel e no Google Planilhas
- [x] Subprocesso que abre o mapeamento filho: criar o filho pela matriz, ligar a um que já existe, duplo clique no desenho para abrir, faixa "Subprocesso de" no filho

Ficou para depois: o `docker compose` ainda não foi rodado de ponta a ponta (o Postgres em si é coberto pela
suíte sobre PGlite); importar XLSX direto, sem passar por CSV; e a **interface em inglês**, que vira uma rodada
própria (extrair os textos para um dicionário antes de traduzir).

## Fase 5 — Na nuvem

- [ ] Modo `nuvem`: login, workspaces, papéis
- [ ] Colaboração e comentários
- [ ] Domínio próprio
