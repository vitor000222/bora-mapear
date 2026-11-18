# Arquitetura do Bora Mapear

## A ideia em uma frase

**A matriz do processo é a fonte da verdade.** Mermaid, React Flow e BPMN são formas de desenhar a
mesma matriz. A IA escreve linhas da matriz. Nenhum modelo escreve XML, código Mermaid ou coordenada.

## Por que assim

- Modelo de linguagem escrevendo XML BPMN erra id, referência e geometria. Preenchendo uma tabela, erra
  menos, e o erro é verificável por regra (o **portão**).
- Trocar de linguagem vira re-renderizar, não traduzir.
- A correção visual do usuário vira dado (posição, tamanho, cor por chave) e sobrevive a uma nova
  renderização da mesma matriz.

## O fluxo

```
 Fontes (PDF, DOCX, POP, transcrição, áudio transcrito)
    │  Agente Leitor
    ▼
 Evidências numeradas (EV-001, EV-002 …) com citação literal e origem
    │  Agente Mapeador
    ▼
 MATRIZ ──► Portão (validação determinística) ──► reprovou? erros voltam ao Mapeador
    │
    │  Renderizadores (determinísticos)
    ▼
 Mermaid · React Flow · BPMN 2.0 (visual no bpmn-js + XML)
    │  O usuário corrige no editor
    ▼
 Correções (posição, tamanho, cor, rota da seta — por chave) + registro do que mudou
    │  Agente Visual lê o histórico
    ▼
 A próxima renderização já sai do jeito que o usuário costuma corrigir
```

## Conceitos

| Conceito | O que é |
|---|---|
| **Mapeamento** | O documento. Tem nome, linguagem preferida e versões da matriz. |
| **Matriz** | Uma linha por elemento do processo (evento, tarefa, decisão). Cada linha tem uma chave estável. Ver [matriz.md](matriz.md). |
| **Linguagem** | Uma forma de desenhar: Mermaid, React Flow ou BPMN 2.0. O BPMN tem duas vistas: a visual (bpmn-js, o mesmo editor do Camunda Modeler) e a de código (XML). |
| **Visão** | Um mapeamento desenhado numa linguagem, com as correções dele. |
| **Correções** | O que o usuário mudou na forma do desenho, chaveado pela chave da linha. Não mexem no conteúdo. |
| **Registro de correção** | A diferença entre o que o renderizador gerou e o que o usuário deixou, em frases ("moveu *Analisar crédito* 40 px para a direita"). Alimenta o Agente Visual. |

## Duas edições, dois caminhos

| O usuário… | Vira | A matriz muda? |
|---|---|---|
| move, redimensiona, recolore, redesenha uma seta | **Correção** da visão | Não |
| renomeia, cria ou apaga etapa, troca raia, religa seta | **Nova versão** da matriz | Sim |

Na grade da matriz, editar conteúdo é direto. No editor visual, o importador lê o desenho, compara com a
matriz e **propõe** as mudanças para o usuário aceitar (fase 3). Até lá, o núcleo já devolve, na extração
das correções, a lista de elementos do desenho que não existem na matriz.

## Trocar de linguagem

A linguagem é atributo da visão. Trocar é renderizar a mesma matriz em outra linguagem.

- Correções de posição valem entre **BPMN e React Flow**: os dois usam o mesmo sistema de coordenadas
  que o layout do núcleo gera.
- **Mermaid não tem posição.** Lá a correção é o próprio código editado, guardado como sobreposição da
  visão. Se a matriz muda, o usuário escolhe entre manter o código dele ou regerar.
- **Importar de fora** (um `.bpmn` de outra ferramenta, um Mermaid colado): o importador BPMN é
  determinístico; Mermaid → matriz passa pelo Agente Conversor quando o parser não cobrir.

## Agentes

| Agente | Recebe | Devolve | Nunca |
|---|---|---|---|
| **Leitor** | arquivos (PDF, DOCX, TXT, VTT, SRT) | evidências numeradas com citação literal e origem | resume ou interpreta |
| **Mapeador** | evidências | linhas da matriz, cada uma apontando a evidência | escreve XML ou Mermaid; inventa etapa sem evidência |
| **Revisor** | matriz + evidências | lacunas e linhas para revisão humana | altera a matriz |
| **Editor** | pedido em linguagem natural + matriz | um *patch*: operações sobre linhas | reescreve a matriz inteira |
| **Visual** | layout gerado + histórico de correções do usuário | correções propostas (ordem de raias, posição, cor) | muda conteúdo |
| **Conversor** | código de outra linguagem | matriz | — |

- **O portão não é agente.** É código (`validarMatriz`). Reprovou, os erros voltam ao Mapeador com o
  texto pronto para ele corrigir, até N tentativas. Depois disso, a matriz é entregue com as linhas
  marcadas para revisão humana.
- **Orquestração:** uma máquina de estados simples em TypeScript, uma tabela de execuções no banco e
  progresso por SSE. Sem framework pesado de agentes: cada agente é uma função com entrada tipada e
  saída validada por schema Zod.
- **Saída estruturada:** o schema Zod da matriz vira JSON Schema (`matrizJsonSchema()`) e vai como
  *structured output* para o provedor. Provedor sem esse recurso: modo JSON, validação e nova tentativa.

## Chave de API do usuário (BYOK)

- O usuário cadastra os provedores dele: **OpenRouter**, **qualquer endpoint compatível com a API da
  OpenAI** (cobre Groq, Together, DeepSeek e modelos locais no Ollama ou LM Studio), Anthropic e Google.
- Cada agente escolhe provedor e modelo: barato no Leitor, forte no Mapeador.
- A chave fica cifrada no banco (AES-256-GCM, com a `BORA_SECRET` do `.env`). Depois de salva, nunca
  volta para o navegador e nunca vai para log.
- As chamadas ao modelo saem do servidor, nunca do navegador.
- Tokens e custo estimado de cada execução ficam gravados.

## Banco

- **Padrão: SQLite num arquivo** (`data/bora.db`). Clonou, instalou, rodou.
- **Opcional: Postgres** via `DATABASE_URL` — o banco do próprio usuário ou o do `docker compose`.
- Uma camada de acesso só (Kysely), com migrações para os dois dialetos.
- Matriz e correções gravadas como documento JSON. Versões de matriz são imutáveis.

| Tabela | Guarda |
|---|---|
| `mapeamento` | nome, descrição, linguagem preferida, status |
| `versao_matriz` | número, matriz (JSON), autor (pessoa ou agente), mensagem, data |
| `visao` | mapeamento × linguagem, correções (JSON), código sobreposto (Mermaid/XML) |
| `registro_correcao` | visão, antes, depois, frases do que mudou |
| `fonte` | arquivo enviado, tipo, texto extraído |
| `evidencia` | fonte, chave `EV-001`, citação literal, posição na fonte |
| `execucao` | agente, status, entrada, saída, tokens, custo, erro |
| `provedor` | tipo, URL base, chave cifrada, modelos |
| `config_agente` | agente → provedor + modelo + parâmetros |

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript em tudo | um idioma no front, no back e nos renderizadores; o renderizador roda no navegador e no servidor |
| Monorepo | npm workspaces | já vem com o Node |
| Núcleo | `packages/core` | matriz, portão, layout, renderizadores e correções; sem dependência de interface |
| Front | Vite + React | — |
| Editores | bpmn-js, @xyflow/react, mermaid + CodeMirror, grade para a matriz | padrões de mercado |
| Servidor | Hono sobre Node | leve, TypeScript nativo |
| IA | Vercel AI SDK | um contrato para OpenRouter, OpenAI-compatível, Anthropic, Google e Ollama |
| Banco | SQLite ou Postgres, via Kysely | — |
| Testes | `node:test` | sem dependência |

## Licenças de terceiros que pesam

- **bpmn-js** usa a licença bpmn.io: uso livre, mas o logo do bpmn.io tem de ficar visível no canvas.
  Não remover.
- **React Flow** e **Mermaid**: MIT.

## Rodar local (meta da fase 1)

```bash
git clone https://github.com/<org>/bora-mapear && cd bora-mapear
npm install
npm run dev        # abre em http://localhost:5173, cria data/bora.db sozinho
```

Para Postgres: `DATABASE_URL=postgres://… npm run dev`.

## Hospedar depois (boramapear)

Mesmo código, dois modos por variável de ambiente: `local` (sem login, um usuário) e `nuvem` (login,
workspaces, Postgres gerenciado, arquivos em armazenamento compatível com S3). A chave de API continua
sendo do usuário, por workspace.
