# Bora Mapear

[English](README.md) · **Português**

**Mapeamento de processos com IA, de código aberto.** Você manda o POP, a transcrição da entrevista ou o
documento do processo; os agentes montam a matriz; o Bora Mapear desenha em BPMN, Mermaid ou React Flow.
Você corrige o desenho, e a correção fica guardada.

> Status: **fase 4 — Postgres, exportar em SVG/PNG/PDF, matriz em CSV, subprocessos e interface em inglês**. Próximo: modo nuvem ([roadmap](docs/roadmap.pt-BR.md)).

## A ideia

```
Documentos ─► Agentes ─► MATRIZ ─► Portão ─► Mermaid · React Flow · BPMN
                            ▲                          │
                            └──── correções ◄──────────┘
```

- **A matriz é a fonte da verdade.** Uma linha por etapa, com chave estável, raia, tipo e as saídas.
- **A IA escreve linhas da matriz, nunca XML.** O desenho sai de um renderizador determinístico.
- **Trocar de linguagem é re-renderizar.** A mesma matriz vira BPMN, Mermaid ou React Flow.
- **A correção visual é dado.** Moveu, pintou, redesenhou uma seta: fica guardado por chave e sobrevive
  à próxima versão da matriz.
- **Sua chave, seu banco.** Você usa a sua chave de API (OpenRouter ou qualquer provedor compatível) e
  roda local, com SQLite, ou no seu Postgres.

Detalhes em [docs/architecture.pt-BR.md](docs/architecture.pt-BR.md) e [docs/matrix.pt-BR.md](docs/matrix.pt-BR.md).

## Rodar local

Precisa de Node 22.18 ou mais novo. Mais nada: o banco é SQLite num arquivo, com o módulo nativo do Node.

```bash
git clone https://github.com/vitor000222/bora-mapear && cd bora-mapear
npm install
npm run dev
```

Abra http://127.0.0.1:5173. O banco fica em `data/bora.db` e é criado sozinho.

Para usar sem modo de desenvolvimento, numa porta só:

```bash
npm run build
npm start          # http://127.0.0.1:3737
```

| Variável | Padrão | Para quê |
|---|---|---|
| `PORTA` | `3737` | porta do servidor |
| `HOST` | `127.0.0.1` | troque para `0.0.0.0` para abrir na rede |
| `BORA_DB` | `data/bora.db` | caminho do arquivo do banco (SQLite) |
| `DATABASE_URL` | (vazio) | `postgres://…`: usa o seu Postgres em vez do SQLite |
| `BORA_SECRET` | (arquivo `data/segredo.key`) | chave-mestra que cifra as chaves de API |

### Com Postgres

O seu banco: `DATABASE_URL=postgres://usuario:senha@host:5432/bora npm start`. As tabelas são criadas na
primeira vez.

Ou tudo em contêiner, Postgres junto:

```bash
cp .env.example .env      # troque BORA_SECRET por um texto longo e aleatório
docker compose up -d      # http://127.0.0.1:3737
```

Guarde a `BORA_SECRET`: sem ela, as chaves de API cadastradas não abrem mais.

### O que dá para fazer

- Criar mapeamentos em branco ou pelo exemplo, escolhendo a linguagem (dá para trocar depois).
- Editar a **matriz** como planilha: raias, etapas, tipo, raia, sistema e próximos. O portão confere enquanto
  você digita e aponta a linha com problema. Cada gravação vira uma **versão**, e qualquer versão pode ser
  restaurada.
- **BPMN**: editar no bpmn-js (arrastar, redimensionar, pintar, redesenhar setas), baixar `.bpmn` e SVG.
- **React Flow**: arrastar e pintar, com as setas traçadas pelo mesmo roteador do BPMN.
- **Mermaid**: ver o desenho e editar o código à mão, com prévia ao vivo.
- **Salvar correções**: só o que você mudou na forma é guardado, por chave, e sobrevive às próximas versões da
  matriz. Cada gravação vira frases no **registro de correções** ("Moveu *Analisar crédito* 60 px para a direita").
- **Exportar** o desenho em SVG, PNG ou PDF (vetorial, com texto selecionável), nas três linguagens.
- **Matriz em planilha**: "Exportar CSV" abre no Excel e no Google Planilhas; edite lá e traga de volta com
  "Importar CSV". O que voltou passa pelo portão e só vira versão quando você salvar.
- **Subprocessos**: numa etapa do tipo subprocesso, "Criar mapeamento filho" abre um mapeamento novo para
  detalhá-la (ou ligue a um que já existe). No desenho, duplo clique na etapa abre o filho; no filho, uma
  faixa mostra de qual processo ele faz parte.
- **Português ou inglês**: o seletor no topo troca a interface inteira, as mensagens do portão, os avisos, o
  registro de correções, o exemplo e o CSV. O conteúdo da matriz é seu e não é traduzido; com a interface em
  inglês, os agentes escrevem o que produzem em inglês.

## Agentes de IA, com a sua chave

Em **Configurações**, cadastre um provedor e escolha o modelo de cada agente (ou só o padrão):

| Provedor | Como |
|---|---|
| OpenRouter, OpenAI, Google Gemini, Groq, DeepSeek | compatível com a API da OpenAI (`/chat/completions`) |
| Anthropic | SDK oficial, com saída estruturada e *fallback* do lado do servidor nos modelos Claude recentes |
| Ollama, LM Studio | local, sem chave e sem custo |

Na aba **IA** de um mapeamento:

1. **Fontes**: envie POPs, documentos e transcrições (PDF, DOCX, TXT, MD, VTT, SRT) ou cole texto.
2. **Leitor**: tira das fontes as **evidências** (EV-001…), trechos copiados literalmente. Cada citação é
   conferida contra o texto original; a que não bate fica marcada como "não conferida".
3. **Mapeador**: escreve a matriz a partir das evidências. O **portão** confere; se reprovar, os erros voltam
   ao agente, até três rodadas. Toda linha aponta a evidência que a sustenta.
4. **Editor**: "depois de analisar o crédito, a gerência aprova acima de R$ 50 mil" vira operações sobre a
   matriz, aplicadas por código.
5. **Revisor**: aponta lacunas, cada uma com a pergunta para fazer ao cliente, e linhas para revisão humana.

Nenhum agente muda a matriz sozinho: cada um devolve uma **proposta**, que você aplica como versão nova ou abre
na Matriz para revisar antes. Cada execução mostra o progresso, os tokens e o custo.

**Sobre a chave:** fica cifrada (AES-256-GCM) no banco local, nunca volta para o navegador e nunca vai para log.
A chave-mestra vem de `BORA_SECRET` ou de `data/segredo.key`, criado na primeira vez. As chamadas saem do
servidor direto para o provedor.

## Ida e volta

- **Importar** (na lista): BPMN 2.0 de qualquer ferramenta (Camunda, bpmn.io, Bizagi), fluxograma Mermaid e a
  matriz em CSV entram direto, sem IA. BPMN exportado pelo próprio Bora Mapear volta com as posições do desenho. Outro formato (PlantUML,
  lista de passos, tabela) passa pelo agente **Conversor**.
- **Do desenho para a matriz:** renomeou, criou ou apagou etapa no bpmn-js? Ao salvar, o app mostra o que mudou e
  oferece salvar como versão nova, revisar na Matriz ou guardar só a forma.
- **Do código para a matriz:** editou o Mermaid à mão? "Trazer para a matriz" lê o código e abre a matriz resultante
  para revisar.
- **Estilo visual:** em Configurações, regras de cor ("tarefas manuais em laranja"). O agente **Visual** aprende as
  regras a partir das cores que você já aplicou nos desenhos; "Aplicar meu estilo" pinta qualquer desenho com elas.
  O agente escreve regras, nunca coordenadas.

**Sem chave, para testar:** `npm run llm-falso` sobe um provedor falso em `http://127.0.0.1:11435/v1`, que
responde como cada agente sem chamar modelo nenhum. Cadastre-o como "Ollama (local)" com essa URL.

## O núcleo sozinho

```bash
npm run exemplo
```

Isso valida e desenha [`exemplos/pedido-de-venda.json`](exemplos/pedido-de-venda.json) em `saida/`:

| Arquivo | O que é |
|---|---|
| `pedido-de-venda.bpmn` | BPMN 2.0 com diagrama. Abre no [bpmn.io](https://demo.bpmn.io) e no Camunda Modeler. |
| `pedido-de-venda.mmd` | Mermaid flowchart, uma raia por subgraph. |
| `pedido-de-venda.reactflow.json` | Nós e arestas para o `@xyflow/react`. |
| `pedido-de-venda.html` | Prévia com BPMN, Mermaid, a matriz e o resultado do portão. |

### A linha de comando

```bash
node packages/core/src/cli.ts validar   exemplos/pedido-de-venda.json
node packages/core/src/cli.ts renderizar exemplos/pedido-de-venda.json --saida saida
node packages/core/src/cli.ts extrair   desenho-editado.bpmn --matriz exemplos/pedido-de-venda.json
node packages/core/src/cli.ts schema
```

`extrair` é o ciclo da correção: abra o `.bpmn` no bpmn.io, mova e pinte o que quiser, exporte, e o
comando devolve só o que você mudou, em JSON e em frases.

### Testes

```bash
npm test
npm run typecheck
```

## Estrutura

```
packages/core/        núcleo: matriz, portão, layout, renderizadores, correções, CLI
  src/matriz.ts       schema da matriz (Zod) e JSON Schema para os agentes
  src/validar.ts      o portão
  src/layout.ts       layout automático em raias e roteador de setas
  src/correcoes.ts    aplicar, extrair, comparar e descrever correções
  src/importar-*.ts   BPMN e Mermaid → matriz
  src/csv.ts          matriz ↔ CSV
  src/idioma.ts       idiomas (pt, en)
  src/renderizadores/ bpmn.ts · mermaid.ts · reactflow.ts · svg.ts
packages/agentes/     Leitor, Mapeador, Revisor, Editor, Conversor e Visual; clientes OpenAI-compatível e Anthropic
apps/server/          API (Hono) sobre SQLite ou Postgres: mapeamentos, versões, visões, fontes, evidências, execuções
apps/web/             interface (Vite + React): lista, matriz, bpmn-js, React Flow, Mermaid, IA, configurações
  src/i18n/           textos da interface, em português e inglês
scripts/dev.ts        sobe API e interface juntas
scripts/llm-falso.ts  provedor falso para testar os agentes sem chave
exemplos/             matrizes de exemplo
docs/                 arquitetura, matriz, roadmap
```

## Licença

[GNU AGPL-3.0](LICENSE). Em resumo:

- Você pode usar, estudar, modificar e redistribuir o Bora Mapear, inclusive para fins comerciais.
- Se distribuir uma versão modificada **ou oferecê-la como serviço pela rede**, tem de disponibilizar o
  código-fonte dela, sob a mesma licença, para quem a usa. No app, o link **Código-fonte** no topo serve para
  isso: num fork hospedado, aponte-o para o seu repositório.
- Usar sem modificar, no seu computador ou na sua empresa, não cria obrigação nenhuma.

O resumo não substitui o texto da licença.
