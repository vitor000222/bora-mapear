# Bora Mapear architecture

**English** · [Português](architecture.pt-BR.md)

## The idea in one sentence

**The process matrix is the source of truth.** Mermaid, React Flow and BPMN are ways to draw the same
matrix. The AI writes matrix rows. No model writes XML, Mermaid code or coordinates.

## Why this way

- A language model writing BPMN XML gets ids, references and geometry wrong. Filling in a table, it makes
  fewer mistakes, and the mistakes can be checked by rules (the **gate**).
- Switching notations becomes a re-render, not a translation.
- The user's visual correction becomes data (position, size, color, by key) and survives a new render of
  the same matrix.

## The flow

```
 Sources (PDF, DOCX, SOP, transcript, transcribed audio)
    │  Reader agent
    ▼
 Numbered evidence (EV-001, EV-002 …) with a word-for-word quote and its origin
    │  Mapper agent
    ▼
 MATRIX ──► Gate (deterministic validation) ──► failed? the errors go back to the Mapper
    │
    │  Renderers (deterministic)
    ▼
 Mermaid · React Flow · BPMN 2.0 (visual in bpmn-js + XML)
    │  The user corrects it in the editor
    ▼
 Corrections (position, size, color, arrow route — by key) + a log of what changed
    │  The Visual agent reads the history
    ▼
 The next render already comes out the way the user usually corrects it
```

## Concepts

| Concept | What it is |
|---|---|
| **Process map** (`mapeamento`) | The document. It has a name, a preferred notation and versions of the matrix. |
| **Matrix** (`matriz`) | One row per process element (event, task, decision). Each row has a stable key. See [matrix.md](matrix.md). |
| **Notation** (`linguagem`) | A way to draw: Mermaid, React Flow or BPMN 2.0. BPMN can be seen two ways: visually (bpmn-js, the same editor as Camunda Modeler) and as code (XML). |
| **View** (`visao`) | A process map drawn in one notation, with its corrections. |
| **Corrections** (`correcoes`) | What the user changed in the layout of the diagram, keyed by the row's key. They do not touch the content. |
| **Correction log** (`registro_correcao`) | The difference between what the renderer generated and what the user left, in sentences ("moved *Check customer credit* 40 px to the right"). It feeds the Visual agent. |
| **Subprocess** | A step of type `subprocesso` can point to another process map (`subprocesso: <id>`). The child is an ordinary process map; the link lives only in the parent's matrix, so changing the link is a new version of the parent. The child finds its parents by looking for who points to it. |

## Two kinds of edit, two paths

| The user… | Becomes | Does the matrix change? |
|---|---|---|
| moves, resizes, recolors, redraws an arrow | a **correction** of the view | No |
| renames, creates or deletes a step, changes the lane, reconnects an arrow | a **new version** of the matrix | Yes |

In the matrix grid, editing content is direct. In the visual editor, the importer (`importarBpmn`) reads the
diagram, `compararMatrizes` says what changed in sentences, and the user chooses: save it as a new version,
review it in the Matrix or save the layout only. What BPMN does not store (confidence, human review) and the
order of the rows come from the original matrix (`reconciliarComOriginal`). In Mermaid, "Bring to the matrix"
does the same with `importarMermaid`.

## Switching notations

The notation is an attribute of the view. Switching means rendering the same matrix in another notation.

- Position corrections carry over between **BPMN and React Flow**: both use the same coordinate system that
  the core layout generates.
- **Mermaid has no positions.** There, the correction is the edited code itself, stored as an override of the
  view. If the matrix changes, the user chooses between keeping their code or regenerating it.
- **Importing from outside** (a `.bpmn` from another tool, pasted Mermaid, the matrix as CSV): the importers
  are deterministic; what they cannot read goes through the Converter agent.

## Export

- **SVG, PNG and PDF** all come from an SVG. In BPMN it is bpmn-js's `saveSVG`; in Mermaid, the SVG it draws
  (with `htmlLabels: false`, no `foreignObject`, so the canvas is not "tainted"); in React Flow, the core's
  `renderizarSvg`, which draws the matrix with the current node positions in plain SVG.
- PNG is the SVG on a `canvas` at 2x, with a white background. PDF is vector (jsPDF + svg2pdf.js, loaded only
  when someone asks for it), the exact size of the diagram, with selectable text.
- **CSV** is the matrix as a spreadsheet (`matrizParaCsv` / `csvParaMatriz`): a BOM so Excel opens accented
  characters correctly, one row per step, `proximos` (next) as `E04: Yes, E10: No`. The separator, the column
  names and the type labels follow the interface language (`,` and English in English; `;` and Portuguese in
  Portuguese); on the way back it accepts both, the type as the code or as the label, and a decimal comma or
  point in the confidence. The Matrix grid
  exports and imports; the list imports as a new process map.

## Agents

| Agent | Receives | Returns | Never |
|---|---|---|---|
| **Reader** | files (PDF, DOCX, TXT, VTT, SRT) | numbered evidence with a word-for-word quote and its origin | summarizes or interprets |
| **Mapper** | evidence | matrix rows, each pointing to its evidence | writes XML or Mermaid; invents a step without evidence |
| **Reviewer** | matrix + evidence | gaps and rows for human review | changes the matrix |
| **Editor** | a request in natural language + matrix | a *patch*: operations on rows | rewrites the whole matrix |
| **Visual** | colors applied across all process maps + correction log | style rules ("manual tasks in orange"), with how many examples each one matches | writes coordinates; changes content |
| **Converter** | code or text from another tool (PlantUML, a list, a table) | a matrix, through the same gate loop | invents a step |

- **The gate is not an agent.** It is code (`validarMatriz`). If it fails, the errors go back to the Mapper
  with text ready for it to fix, for up to N attempts. After that, the matrix is delivered with the rows
  flagged for human review.
- **Orchestration:** each agent is a function with typed input and output validated by a Zod schema
  (`packages/agentes`). The server executes each run in the background, records the progress, tokens and cost
  in the `execucao` (run) table, and the interface follows along. No agent framework.
- **Proposal, not action:** the Mapper and the Editor return a proposed matrix; it becomes a version only when
  the person applies it (author `agente:mapeador` or `agente:editor`). If the matrix changed in the meantime,
  the server warns.
- **Structured output:** the Zod schema becomes a JSON Schema, trimmed to the subset the providers accept, and
  is sent as `response_format` (OpenAI-compatible) or `output_config.format` (Anthropic). A provider without
  this feature falls back on its own to JSON mode and then to plain text; the response is always validated,
  and the error goes back to the model for another try.
- **Clients:** OpenAI-compatible through `fetch` (OpenRouter reports the cost of each call); Anthropic through
  the official SDK, streaming, with server-side *fallback* on recent Claude models.

## The user's API key (BYOK)

- The user adds their own providers: **OpenRouter**, **any endpoint compatible with the OpenAI API** (covers
  Groq, Together, DeepSeek and local models in Ollama or LM Studio), Anthropic and Google.
- Each agent picks a provider and a model: a cheap one for the Reader, a strong one for the Mapper.
- The key is stored encrypted in the database (AES-256-GCM, with the `BORA_SECRET` from `.env`). Once saved,
  it never goes back to the browser and never goes to a log.
- Calls to the model go out from the server, never from the browser.
- The tokens and estimated cost of each run are recorded.

## Database

- **Default: SQLite in a file** (`data/bora.db`), with Node's own `node:sqlite` module: nothing to compile,
  not even on Windows. Clone, install, run.
- **Optional: Postgres** through `DATABASE_URL` — the user's own database or the one from `docker compose`.
- The server talks to the database through a single interface (`Repositorio`, async), with two
  implementations: `RepositorioSqlite` and `RepositorioPostgres` (`pg` driver, JSONB, `SELECT … FOR UPDATE`
  to number versions and evidence without race conditions). Migrations live in the code:
  `PRAGMA user_version` in SQLite, the `bora_esquema` table in Postgres.
- The API tests run twice, once on each database; the Postgres in the tests is PGlite (Postgres in
  WebAssembly, in memory), so running the suite does not need Docker.
- The matrix and the corrections are stored as JSON documents. Matrix versions are immutable.

| Table | Stores |
|---|---|
| `mapeamento` (process map) | name, description, preferred notation, status |
| `versao_matriz` (matrix version) | number, matrix (JSON), author (person or agent), message, date |
| `visao` (view) | process map × notation, corrections (JSON), override code (Mermaid/XML) |
| `registro_correcao` (correction log) | view, before, after, sentences describing what changed |
| `fonte` (source) | uploaded file, type, extracted text (PDF through `unpdf`, DOCX through `mammoth`, cleaned-up captions) |
| `evidencia` (evidence) | source, key `EV-001` (never reused), word-for-word quote, position, whether it was verified |
| `execucao` (run) | agent, status, input, output, tokens, cost, error |
| `provedor` (provider) | type, base URL, encrypted key, last 4 characters |
| `config_agente` (agent settings) | agent → provider + model + parameters |

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | one language in the front end, the back end and the renderers; the renderer runs in the browser and on the server |
| Monorepo | npm workspaces | already comes with Node |
| Core | `packages/core` | matrix, gate, layout, renderers and corrections; no dependency on the interface |
| Front end | Vite + React, hash routing | — |
| Editors | bpmn-js, @xyflow/react, mermaid + CodeMirror, a grid for the matrix | industry standards |
| Server | Hono on Node | lightweight, native TypeScript |
| AI | `fetch` (OpenAI-compatible) + `@anthropic-ai/sdk` | no middle layer; covers OpenRouter, OpenAI, Gemini, Groq, DeepSeek, Ollama and Anthropic |
| Database | SQLite (`node:sqlite`) or Postgres (`pg`) | SQLite with no native dependency; Postgres for those who already have one |
| Export | SVG of the diagram itself; PNG through the canvas; PDF through jsPDF + svg2pdf.js | no rendering server |
| Tests | `node:test` | no dependency |

## Languages

Portuguese and English, chosen in the selector at the top (stored in the browser; the first time, the
browser's language applies). Three layers, each with its own dictionary:

- **Interface** (`apps/web/src/i18n/`): one area per screen in `textos/` (texts), with `pt` as the source and
  `en: typeof pt`, so a missing English key is a compile error. Components use `useTextos()`; what runs outside
  React (api.ts, exportar.ts) or in a handler registered once (bpmn-js) uses `textos()`.
- **Core**: the functions that write text for people to read take an `idioma` (language) argument
  (`validarMatriz`, `compararMatrizes`, `descreverMudanca`, the importers, CSV, `rotulosTipo`, the BPMN and
  Mermaid renderers). Default: Portuguese.
- **Server**: the interface sends `Accept-Language`; the server writes errors, gate results, warnings and
  correction log sentences in that language, and creates the example and the blank process map in it. The
  agents get the language through the model client and write their output in it; evidence quotes stay word
  for word.

User content (names, the matrix, version messages already saved) stays in the language it was written in.

## License

Bora Mapear is AGPL-3.0: anyone who offers a modified version as a service must open its source code. That
is why the interface has the **Source code** link at the top (`CODIGO_FONTE` in `apps/web/src/main.tsx`).

## Third-party licenses that matter

- **bpmn-js** uses the bpmn.io license: free to use, but the bpmn.io logo must stay visible on the canvas.
  Do not remove it.
- **React Flow** and **Mermaid**: MIT.

## Run locally

```bash
git clone https://github.com/vitor000222/bora-mapear && cd bora-mapear
npm install
npm run dev        # opens at http://127.0.0.1:5173, creates data/bora.db on its own
```

With Postgres: `DATABASE_URL=postgres://… npm start`, or `docker compose up -d` (starts Postgres and the app).

## Hosting later (boramapear)

Same code, two modes set by an environment variable: `local` (no login, one user) and `nuvem` (cloud: login,
workspaces, managed Postgres, files in S3-compatible storage). The API key is still the user's, per workspace.
