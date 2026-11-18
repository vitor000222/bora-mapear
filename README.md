# Bora Mapear

**Mapeamento de processos com IA, de código aberto.** Você manda o POP, a transcrição da entrevista ou o
documento do processo; os agentes montam a matriz; o Bora Mapear desenha em BPMN, Mermaid ou React Flow.
Você corrige o desenho, e a correção fica guardada.

> Status: **fase 0 — núcleo pronto**. A interface web e os agentes vêm nas próximas fases
> ([roadmap](docs/roadmap.md)).

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

Detalhes em [docs/arquitetura.md](docs/arquitetura.md) e [docs/matriz.md](docs/matriz.md).

## Experimente o núcleo

Precisa de Node 22.18 ou mais novo (roda TypeScript direto, sem build).

```bash
npm install
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
  src/layout.ts       layout automático em raias
  src/correcoes.ts    aplicar, extrair e descrever correções
  src/renderizadores/ bpmn.ts · mermaid.ts · reactflow.ts
exemplos/             matrizes de exemplo
docs/                 arquitetura, matriz, roadmap
```

## Licença

A definir.
