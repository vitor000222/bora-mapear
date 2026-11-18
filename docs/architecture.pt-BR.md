# Arquitetura do Bora Mapear

[English](architecture.md) · **Português**

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
| **Matriz** | Uma linha por elemento do processo (evento, tarefa, decisão). Cada linha tem uma chave estável. Ver [matrix.pt-BR.md](matrix.pt-BR.md). |
| **Linguagem** | Uma forma de desenhar: Mermaid, React Flow ou BPMN 2.0. O BPMN tem duas vistas: a visual (bpmn-js, o mesmo editor do Camunda Modeler) e a de código (XML). |
| **Visão** | Um mapeamento desenhado numa linguagem, com as correções dele. |
| **Correções** | O que o usuário mudou na forma do desenho, chaveado pela chave da linha. Não mexem no conteúdo. |
| **Registro de correção** | A diferença entre o que o renderizador gerou e o que o usuário deixou, em frases ("moveu *Analisar crédito* 40 px para a direita"). Alimenta o Agente Visual. |
| **Subprocesso** | Uma etapa do tipo `subprocesso` pode apontar para outro mapeamento (`subprocesso: <id>`). O filho é um mapeamento comum; o vínculo mora só na matriz do pai, então mudar o vínculo é versão nova do pai. O filho descobre os pais procurando quem aponta para ele. |

## Duas edições, dois caminhos

| O usuário… | Vira | A matriz muda? |
|---|---|---|
| move, redimensiona, recolore, redesenha uma seta | **Correção** da visão | Não |
| renomeia, cria ou apaga etapa, troca raia, religa seta | **Nova versão** da matriz | Sim |

Na grade da matriz, editar conteúdo é direto. No editor visual, o importador (`importarBpmn`) lê o desenho,
`compararMatrizes` diz o que mudou em frases, e o usuário escolhe: salvar como versão nova, revisar na Matriz
ou guardar só a forma. O que o BPMN não guarda (confiança, revisão humana) e a ordem das linhas vêm da matriz
original (`reconciliarComOriginal`). No Mermaid, "Trazer para a matriz" faz o mesmo com `importarMermaid`.

## Trocar de linguagem

A linguagem é atributo da visão. Trocar é renderizar a mesma matriz em outra linguagem.

- Correções de posição valem entre **BPMN e React Flow**: os dois usam o mesmo sistema de coordenadas
  que o layout do núcleo gera.
- **Mermaid não tem posição.** Lá a correção é o próprio código editado, guardado como sobreposição da
  visão. Se a matriz muda, o usuário escolhe entre manter o código dele ou regerar.
- **Importar de fora** (um `.bpmn` de outra ferramenta, um Mermaid colado, a matriz em CSV): os
  importadores são determinísticos; o que eles não leem passa pelo Agente Conversor.

## Exportar

- **SVG, PNG e PDF** saem de um SVG. No BPMN é o `saveSVG` do bpmn-js; no Mermaid, o SVG que ele desenha
  (com `htmlLabels: false`, sem `foreignObject`, para o canvas não ficar "sujo"); no React Flow, o
  `renderizarSvg` do núcleo, que desenha a matriz com as posições atuais dos nós em SVG puro.
- PNG é o SVG num `canvas` a 2x, fundo branco. PDF é vetorial (jsPDF + svg2pdf.js, carregados só quando
  alguém pede), do tamanho exato do desenho, com o texto selecionável.
- **CSV** é a matriz em planilha (`matrizParaCsv` / `csvParaMatriz`): BOM para o Excel abrir com acento,
  uma linha por etapa, `proximos` como `E04: Sim, E10: Não`. Separador, nomes das colunas e rótulos dos tipos
  seguem o idioma da interface (`;` e português em português; `,` e inglês em inglês); na volta aceita os dois,
  o tipo pelo código ou pelo rótulo, e vírgula ou ponto decimal na confiança. A grade da Matriz exporta e importa; a lista
  importa como mapeamento novo.

## Agentes

| Agente | Recebe | Devolve | Nunca |
|---|---|---|---|
| **Leitor** | arquivos (PDF, DOCX, TXT, VTT, SRT) | evidências numeradas com citação literal e origem | resume ou interpreta |
| **Mapeador** | evidências | linhas da matriz, cada uma apontando a evidência | escreve XML ou Mermaid; inventa etapa sem evidência |
| **Revisor** | matriz + evidências | lacunas e linhas para revisão humana | altera a matriz |
| **Editor** | pedido em linguagem natural + matriz | um *patch*: operações sobre linhas | reescreve a matriz inteira |
| **Visual** | cores aplicadas em todos os mapeamentos + registro de correções | regras de estilo ("tarefas manuais em laranja"), com quantos exemplos cada uma acerta | escreve coordenada; muda conteúdo |
| **Conversor** | código ou texto de outra ferramenta (PlantUML, lista, tabela) | matriz, pelo mesmo laço do portão | inventa etapa |

- **O portão não é agente.** É código (`validarMatriz`). Reprovou, os erros voltam ao Mapeador com o
  texto pronto para ele corrigir, até N tentativas. Depois disso, a matriz é entregue com as linhas
  marcadas para revisão humana.
- **Orquestração:** cada agente é uma função com entrada tipada e saída validada por schema Zod
  (`packages/agentes`). O servidor roda a execução em segundo plano, grava o progresso, os tokens e o custo
  na tabela `execucao`, e a interface acompanha. Sem framework de agentes.
- **Proposta, não ação:** Mapeador e Editor devolvem uma matriz proposta; ela vira versão só quando a pessoa
  aplica (autor `agente:mapeador` ou `agente:editor`). Se a matriz mudou nesse meio-tempo, o servidor avisa.
- **Saída estruturada:** o schema Zod vira JSON Schema, limpo para o subconjunto que os provedores aceitam,
  e vai como `response_format` (compatível com OpenAI) ou `output_config.format` (Anthropic). Provedor sem
  esse recurso cai sozinho para modo JSON e depois para texto; a resposta é sempre validada, e o erro volta
  ao modelo para nova tentativa.
- **Clientes:** compatível com OpenAI por `fetch` (OpenRouter informa o custo de cada chamada); Anthropic pelo
  SDK oficial, em streaming, com *fallback* do lado do servidor nos modelos Claude recentes.

## Chave de API do usuário (BYOK)

- O usuário cadastra os provedores dele: **OpenRouter**, **qualquer endpoint compatível com a API da
  OpenAI** (cobre Groq, Together, DeepSeek e modelos locais no Ollama ou LM Studio), Anthropic e Google.
- Cada agente escolhe provedor e modelo: barato no Leitor, forte no Mapeador.
- A chave fica cifrada no banco (AES-256-GCM, com a `BORA_SECRET` do `.env`). Depois de salva, nunca
  volta para o navegador e nunca vai para log.
- As chamadas ao modelo saem do servidor, nunca do navegador.
- Tokens e custo estimado de cada execução ficam gravados.

## Banco

- **Padrão: SQLite num arquivo** (`data/bora.db`), com o módulo `node:sqlite` do próprio Node: nada para
  compilar, nem no Windows. Clonou, instalou, rodou.
- **Opcional: Postgres** via `DATABASE_URL` — o banco do próprio usuário ou o do `docker compose`.
- O servidor fala com o banco por uma interface só (`Repositorio`, assíncrona), com duas implementações:
  `RepositorioSqlite` e `RepositorioPostgres` (driver `pg`, JSONB, `SELECT … FOR UPDATE` para numerar
  versões e evidências sem corrida). As migrações vivem no código: `PRAGMA user_version` no SQLite, a
  tabela `bora_esquema` no Postgres.
- Os testes da API rodam duas vezes, uma em cada banco; o Postgres dos testes é o PGlite (Postgres em
  WebAssembly, em memória), então não precisa de Docker para rodar a suíte.
- Matriz e correções gravadas como documento JSON. Versões de matriz são imutáveis.

| Tabela | Guarda |
|---|---|
| `mapeamento` | nome, descrição, linguagem preferida, status |
| `versao_matriz` | número, matriz (JSON), autor (pessoa ou agente), mensagem, data |
| `visao` | mapeamento × linguagem, correções (JSON), código sobreposto (Mermaid/XML) |
| `registro_correcao` | visão, antes, depois, frases do que mudou |
| `fonte` | arquivo enviado, tipo, texto extraído (PDF por `unpdf`, DOCX por `mammoth`, legenda limpa) |
| `evidencia` | fonte, chave `EV-001` (nunca reaproveitada), citação literal, posição, se foi conferida |
| `execucao` | agente, status, entrada, saída, tokens, custo, erro |
| `provedor` | tipo, URL base, chave cifrada, últimos 4 caracteres |
| `config_agente` | agente → provedor + modelo + parâmetros |

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript em tudo | um idioma no front, no back e nos renderizadores; o renderizador roda no navegador e no servidor |
| Monorepo | npm workspaces | já vem com o Node |
| Núcleo | `packages/core` | matriz, portão, layout, renderizadores e correções; sem dependência de interface |
| Front | Vite + React, roteamento por hash | — |
| Editores | bpmn-js, @xyflow/react, mermaid + CodeMirror, grade para a matriz | padrões de mercado |
| Servidor | Hono sobre Node | leve, TypeScript nativo |
| IA | `fetch` (compatível com OpenAI) + `@anthropic-ai/sdk` | sem camada intermediária; cobre OpenRouter, OpenAI, Gemini, Groq, DeepSeek, Ollama e Anthropic |
| Banco | SQLite (`node:sqlite`) ou Postgres (`pg`) | SQLite sem dependência nativa; Postgres para quem já tem um |
| Exportar | SVG do próprio desenho; PNG pelo canvas; PDF por jsPDF + svg2pdf.js | sem servidor de renderização |
| Testes | `node:test` | sem dependência |

## Idiomas

Português e inglês, escolhidos no seletor do topo (guardado no navegador; na primeira vez, vale o idioma do
navegador). Três camadas, cada uma com o seu dicionário:

- **Interface** (`apps/web/src/i18n/`): uma área por tela em `textos/`, com `pt` como fonte e `en: typeof pt`,
  então faltar uma chave em inglês é erro de compilação. Componentes usam `useTextos()`; o que roda fora do
  React (api.ts, exportar.ts) ou em tratador registrado uma vez (bpmn-js) usa `textos()`.
- **Núcleo**: as funções que escrevem para a pessoa ler recebem `idioma` (`validarMatriz`, `compararMatrizes`,
  `descreverMudanca`, importadores, CSV, `rotulosTipo`, os renderizadores BPMN e Mermaid). Padrão: português.
- **Servidor**: a interface manda `Accept-Language`; o servidor responde erros, portão, avisos e frases do
  registro nesse idioma, e cria o exemplo e o mapeamento em branco nele. Os agentes recebem o idioma pelo
  cliente do modelo e escrevem a saída nele; as citações das evidências continuam literais.

O que é conteúdo do usuário (nomes, matriz, mensagens de versão já gravadas) fica no idioma em que foi escrito.

## Licença

O Bora Mapear é AGPL-3.0: quem oferecer uma versão modificada como serviço precisa abrir o código dela. Por
isso a interface tem o link **Código-fonte** no topo (`CODIGO_FONTE` em `apps/web/src/main.tsx`).

## Licenças de terceiros que pesam

- **bpmn-js** usa a licença bpmn.io: uso livre, mas o logo do bpmn.io tem de ficar visível no canvas.
  Não remover.
- **React Flow** e **Mermaid**: MIT.

## Rodar local

```bash
git clone https://github.com/vitor000222/bora-mapear && cd bora-mapear
npm install
npm run dev        # abre em http://127.0.0.1:5173, cria data/bora.db sozinho
```

Com Postgres: `DATABASE_URL=postgres://… npm start`, ou `docker compose up -d` (sobe Postgres e o app).

## Hospedar depois (boramapear)

Mesmo código, dois modos por variável de ambiente: `local` (sem login, um usuário) e `nuvem` (login,
workspaces, Postgres gerenciado, arquivos em armazenamento compatível com S3). A chave de API continua
sendo do usuário, por workspace.
