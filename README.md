# Bora Mapear

**English** · [Português](README.pt-BR.md)

**Open-source process mapping with AI.** You send the SOP, the interview transcript or the process document; the
agents build the matrix; Bora Mapear draws it in BPMN, Mermaid or React Flow. You fix the diagram, and the fix is
kept.

*Bora mapear* is Brazilian Portuguese for "let's map it".

> Status: **phase 4 — Postgres, SVG/PNG/PDF export, matrix as CSV, subprocesses and an English interface**. Next:
> cloud mode ([roadmap](docs/roadmap.md)).
>
> The interface comes in Portuguese and English: pick one in the selector at the top. The code itself is in
> Portuguese for now.

## The idea

```
Documents ─► Agents ─► MATRIX ─► Gate ─► Mermaid · React Flow · BPMN
                          ▲                        │
                          └──── corrections ◄──────┘
```

- **The matrix is the source of truth.** One row per step, with a stable key, lane, type and outgoing flows.
- **AI writes matrix rows, never XML.** The diagram comes out of a deterministic renderer.
- **Switching notations is just a re-render.** The same matrix becomes BPMN, Mermaid or React Flow.
- **A visual fix is data.** Moved a box, colored it, rerouted an arrow: it is stored by key and survives the next
  version of the matrix.
- **Your key, your database.** You use your own API key (OpenRouter or any compatible provider) and run it
  locally, with SQLite, or on your own Postgres.

Details in [docs/architecture.md](docs/architecture.md) and [docs/matrix.md](docs/matrix.md).

## Run locally

Requires Node 22.18 or newer. Nothing else: the database is SQLite in a file, through Node's built-in module.

```bash
git clone https://github.com/vitor000222/bora-mapear && cd bora-mapear
npm install
npm run dev
```

Open http://127.0.0.1:5173. The database lives in `data/bora.db` and is created on the first run.

To run it without dev mode, on a single port:

```bash
npm run build
npm start          # http://127.0.0.1:3737
```

| Variable | Default | What for |
|---|---|---|
| `PORTA` | `3737` | server port (*porta* is Portuguese for port) |
| `HOST` | `127.0.0.1` | set it to `0.0.0.0` to open the app on your network |
| `BORA_DB` | `data/bora.db` | path of the database file (SQLite) |
| `DATABASE_URL` | (empty) | `postgres://…`: use your Postgres instead of SQLite |
| `BORA_SECRET` | (file `data/segredo.key`) | master key that encrypts the API keys |

### With Postgres

Your own database: `DATABASE_URL=postgres://user:password@host:5432/bora npm start`. The tables are created on
the first run.

Or everything in containers, Postgres included:

```bash
cp .env.example .env      # set BORA_SECRET to a long random string
docker compose up -d      # http://127.0.0.1:3737
```

Keep your `BORA_SECRET` safe: without it, the API keys you registered can no longer be decrypted.

### What you can do

- Create process maps from scratch or from the example, choosing the diagram notation (you can switch later).
- Edit the **matrix** like a spreadsheet: lanes, steps, type, lane, system and next steps. The gate checks it as
  you type and points at the row with the problem. Every save becomes a **version**, and any version can be
  restored.
- **BPMN**: edit in bpmn-js (drag, resize, color, reroute arrows), download the `.bpmn` and an SVG.
- **React Flow**: drag and color, with the arrows routed by the same router as the BPMN.
- **Mermaid**: see the diagram and edit the code by hand, with a live preview.
- **Save corrections**: only what you changed in the layout is stored, by key, and it survives the next versions
  of the matrix. Each save turns into sentences in the **correction log** ("Moved *Check customer credit* 60 px
  to the right").
- **Export** the diagram as SVG, PNG or PDF (vector, with selectable text), in all three notations.
- **Matrix as a spreadsheet**: "Export CSV" opens in Excel and Google Sheets; edit it there and bring it back with
  "Import CSV". What comes back goes through the gate and only becomes a version when you save.
- **Subprocesses**: on a subprocess step, "Create child map" opens a new process map to detail it (or links one
  that already exists). In the diagram, double-click the step to open the child; in the child, a banner shows
  which process it belongs to.
- **Portuguese or English**: the selector at the top switches the whole interface, the gate messages, the
  warnings, the correction log, the example and the CSV. The matrix content is yours and is not translated; with
  the interface in English, the agents write what they produce in English.

## AI agents, with your key

In **Settings**, add a provider and choose the model for each agent (or just a default one):

| Provider | How |
|---|---|
| OpenRouter, OpenAI, Google Gemini, Groq, DeepSeek | OpenAI-compatible API (`/chat/completions`) |
| Anthropic | official SDK, with structured output and server-side fallback on recent Claude models |
| Ollama, LM Studio | local, no key and no cost |

In a process map's **AI** tab:

1. **Sources**: upload SOPs, documents and transcripts (PDF, DOCX, TXT, MD, VTT, SRT) or paste text.
2. **Reader**: pulls the **evidence** out of the sources (EV-001…), passages copied word for word. Each quote is
   checked against the original text; one that doesn't match is flagged as "unverified".
3. **Mapper**: writes the matrix from the evidence. The **gate** checks it; if it fails, the errors go back to the
   agent, for up to three rounds. Every row points to the evidence behind it.
4. **Editor**: "after the credit check, management approves anything above US$ 50k" turns into operations on the
   matrix, applied by code.
5. **Reviewer**: points out gaps, each with the question to ask the client, and the rows that need human review.

No agent changes the matrix on its own: each one returns a **proposal**, which you apply as a new version or open
in the Matrix to review first. Each run shows its progress, tokens and cost.

**About the key:** it is stored encrypted (AES-256-GCM) in the local database, never goes back to the browser and
never goes to a log. The master key comes from `BORA_SECRET` or from `data/segredo.key`, created on the first
run. Calls go from the server straight to the provider.

## Round trip

- **Import** (in the list): BPMN 2.0 from any tool (Camunda, bpmn.io, Bizagi), Mermaid flowcharts and the matrix
  as CSV come in directly, without AI. BPMN exported by Bora Mapear itself comes back with the diagram positions.
  Other formats (PlantUML, a list of steps, a table) go through the **Converter** agent.
- **From the diagram to the matrix:** renamed, created or deleted a step in bpmn-js? When you save, the app shows
  what changed and offers to save it as a new version, review it in the Matrix or save the layout only.
- **From the code to the matrix:** edited the Mermaid by hand? "Bring to the matrix" reads the code and opens the
  resulting matrix for review.
- **Visual style:** in Settings, color rules ("manual tasks in orange"). The **Visual** agent learns the rules from
  the colors you have already applied to your diagrams; "Apply my style" colors any diagram with them. The agent
  writes rules, never coordinates.

**No key, for testing:** `npm run llm-falso` (*falso* means fake) starts a fake provider at
`http://127.0.0.1:11435/v1`, which answers like each agent without calling any model. Register it as
"Ollama (local)" with that URL.

## The core on its own

```bash
npm run exemplo
```

This validates and draws [`exemplos/pedido-de-venda.json`](exemplos/pedido-de-venda.json), a sales order process
in Portuguese, into `saida/` (*saída* means output). The same process in English is
[`exemplos/sales-order.json`](exemplos/sales-order.json):

```bash
node packages/core/src/cli.ts renderizar exemplos/sales-order.json --saida saida
```

| File | What it is |
|---|---|
| `sales-order.bpmn` | BPMN 2.0 with the diagram. Opens in [bpmn.io](https://demo.bpmn.io) and in Camunda Modeler. |
| `sales-order.mmd` | Mermaid flowchart, one subgraph per lane. |
| `sales-order.reactflow.json` | Nodes and edges for `@xyflow/react`. |
| `sales-order.html` | Preview with the BPMN, the Mermaid, the matrix and the gate result. |

### The command line

The command line speaks Portuguese for now: `validar` (validate), `renderizar` (render), `extrair` (extract) and
`schema`, with the options `--saida` (output folder), `--matriz` (matrix file) and `--correcoes` (corrections
file). Its messages and the labels it writes are in Portuguese too.

```bash
node packages/core/src/cli.ts validar   exemplos/sales-order.json
node packages/core/src/cli.ts renderizar exemplos/sales-order.json --saida saida
node packages/core/src/cli.ts extrair   edited-diagram.bpmn --matriz exemplos/sales-order.json
node packages/core/src/cli.ts schema
```

`extrair` is the correction loop: open the `.bpmn` in bpmn.io, move and color whatever you want, export it, and the
command returns only what you changed, as JSON and as sentences.

### Tests

```bash
npm test
npm run typecheck
```

## Structure

File, function and variable names are in Portuguese.

```
packages/core/        core: matrix, gate, layout, renderers, corrections, CLI
  src/matriz.ts       matrix schema (Zod) and JSON Schema for the agents
  src/validar.ts      the gate
  src/layout.ts       automatic lane layout and arrow router
  src/correcoes.ts    apply, extract, compare and describe corrections
  src/importar-*.ts   BPMN and Mermaid → matrix
  src/csv.ts          matrix ↔ CSV
  src/idioma.ts       languages (pt, en)
  src/renderizadores/ bpmn.ts · mermaid.ts · reactflow.ts · svg.ts
packages/agentes/     Reader, Mapper, Reviewer, Editor, Converter and Visual; OpenAI-compatible and Anthropic clients
apps/server/          API (Hono) on SQLite or Postgres: process maps, versions, views, sources, evidence, runs
apps/web/             interface (Vite + React): list, matrix, bpmn-js, React Flow, Mermaid, AI, settings
  src/i18n/           interface texts, in Portuguese and English
scripts/dev.ts        starts the API and the interface together
scripts/llm-falso.ts  fake provider for testing the agents without a key
exemplos/             example matrices
docs/                 architecture, matrix, roadmap
```

## License

[GNU AGPL-3.0](LICENSE). In short:

- You can use, study, modify and redistribute Bora Mapear, including for commercial purposes.
- If you distribute a modified version **or offer it as a service over a network**, you must make its source code
  available, under the same license, to the people who use it. In the app, the **Source code** link at the top is
  there for that: in a hosted fork, point it at your repository.
- Using it unmodified, on your own computer or at your company, creates no obligation.

This summary does not replace the license text.
