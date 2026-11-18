# Roadmap

## Fase 0 — Núcleo ✅

- [x] Schema da matriz (Zod) e JSON Schema para os agentes
- [x] Portão: validação determinística com mensagens para o agente corrigir
- [x] Layout automático em raias, determinístico: laços por cima, setas que desviam das etapas, rótulos encostados na saída
- [x] Renderizadores: Mermaid, React Flow (nós e arestas) e BPMN 2.0 com diagrama (abre no bpmn-js e no Camunda Modeler)
- [x] Correções: aplicar na renderização, extrair do BPMN editado e do React Flow, descrever em frases
- [x] CLI: `validar`, `renderizar`, `extrair`, `schema`
- [x] Testes com `node:test`

## Fase 1 — App local

- [ ] `apps/server`: Hono + SQLite (arquivo), API de mapeamentos, versões e visões
- [ ] `apps/web`: Vite + React
  - [ ] Lista de mapeamentos; criar escolhendo a linguagem
  - [ ] Grade da matriz (editar linha, raia, saídas)
  - [ ] Visão Mermaid (código + prévia), React Flow (arrastar), BPMN (bpmn-js) e XML (código)
  - [ ] Salvar correções e o registro de cada uma
  - [ ] Histórico de versões da matriz
- [ ] `npm run dev` sobe tudo

## Fase 2 — Agentes

- [ ] Cadastro de provedores (OpenRouter, OpenAI-compatível, Anthropic, Google, Ollama) com chave cifrada
- [ ] Modelo por agente
- [ ] Leitor: PDF, DOCX, TXT, VTT/SRT → evidências numeradas
- [ ] Mapeador + portão em laço
- [ ] Revisor: lacunas e linhas para revisão humana
- [ ] Editor: "adiciona uma aprovação do gerente depois do orçamento" → patch na matriz
- [ ] Execuções com progresso ao vivo, tokens e custo

## Fase 3 — Aprender com a correção

- [ ] Agente Visual usa o registro de correções como exemplo
- [ ] Importador BPMN → matriz: edição de conteúdo no editor visual vira proposta de nova versão
- [ ] Conversor Mermaid → matriz

## Fase 4 — Para usar de verdade

- [ ] Postgres via `DATABASE_URL` + `docker compose`
- [ ] Exportar PNG, SVG e PDF
- [ ] Importar e exportar a matriz em CSV / planilha
- [ ] Subprocesso que abre o mapeamento filho
- [ ] Interface em inglês

## Fase 5 — Na nuvem

- [ ] Modo `nuvem`: login, workspaces, papéis
- [ ] Colaboração e comentários
- [ ] Domínio próprio
