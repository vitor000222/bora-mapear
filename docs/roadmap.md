# Roadmap

**English** · [Português](roadmap.pt-BR.md)

## Phase 0 — Core ✅

- [x] Matrix schema (Zod) and JSON Schema for the agents
- [x] Gate: deterministic validation, with messages written for the agent to fix
- [x] Automatic layout in lanes, deterministic: loops go over the top, arrows route around the steps, labels placed right where the arrow leaves
- [x] Renderers: Mermaid, React Flow (nodes and edges) and BPMN 2.0 with diagram (opens in bpmn-js and in Camunda Modeler)
- [x] Corrections: apply them in the render, extract them from the edited BPMN and from React Flow, describe them in sentences
- [x] CLI: `validar`, `renderizar`, `extrair`, `schema`
- [x] Tests with `node:test`

## Phase 1 — Local app ✅

- [x] `apps/server`: Hono + SQLite (Node's built-in module), API for process maps, versions, views and the correction log
- [x] `apps/web`: Vite + React
  - [x] List of process maps; create one by choosing the notation, blank or from the example
  - [x] Matrix grid with the live gate (edit lanes, steps, type, outgoing flows, details)
  - [x] BPMN view (bpmn-js, with color) and XML; React Flow (drag, color, arrows with the core router); Mermaid (diagram, editable code with preview)
  - [x] Save corrections and log in sentences what changed in each save
  - [x] Matrix version history, with restore
- [x] `npm run dev` starts everything; `npm run build` + `npm start` on a single port

Left for later: arrow route corrections in React Flow, moved arrow labels in bpmn-js, and corrections shared
between BPMN and React Flow.

## Phase 2 — Agents ✅

- [x] Provider registry (OpenRouter, OpenAI-compatible, Anthropic, Google, Groq, DeepSeek, Ollama, LM Studio) with encrypted key, connection test and model list
- [x] Model per agent, with a default
- [x] Reader: PDF, DOCX, TXT, MD, VTT/SRT → numbered evidence, each quote checked against the source
- [x] Mapper + gate in a loop (up to three rounds)
- [x] Reviewer: gaps with the question for the client, rows for human review, automatic checks
- [x] Editor: request in Portuguese → operations on the matrix, applied by code
- [x] Runs in the background, with progress, tokens and cost; proposals applied as a version or reviewed first
- [x] Fake provider for testing without a key

Left for later: transcribing audio and video, OCR of scanned PDFs, and canceling a run in progress.

## Phase 3 — Learning from corrections ✅

- [x] Visual agent: learns style rules (color by type, family, lane, review) from the colors applied and the correction log; "Apply my style" in BPMN, React Flow and Mermaid
- [x] BPMN → matrix importer, deterministic: a content edit in bpmn-js becomes a proposed new version, with what changed in sentences
- [x] Mermaid → matrix importer, deterministic; what it does not read goes to the Converter agent
- [x] Import a process from another tool (BPMN, Mermaid, or any text through the Converter)
- [x] Compare two matrices in sentences

Left for later: style for spacing and lane order, and learned positions (today the style is color only).

## Phase 4 — Ready for real use ✅

- [x] Postgres through `DATABASE_URL` (`pg` driver), with the API tests running on SQLite and on Postgres (PGlite)
- [x] `Dockerfile` and `docker compose` with Postgres
- [x] Export SVG, PNG and PDF (vector) in all three notations
- [x] Import and export the matrix as CSV, which opens in Excel and Google Sheets
- [x] Subprocess that opens the child map: create the child from the matrix, link to one that already exists, double-click in the diagram to open it, "Subprocess of" banner in the child
- [x] English interface: selector at the top; screens, gate, importer warnings, correction log, server errors, example and CSV in the chosen language; with the interface in English, the agents write in English
- [x] English README (`README.md`), with the Portuguese version in `README.pt-BR.md`
- [x] English documentation in `docs/` (architecture, matrix, roadmap), with the Portuguese versions in `*.pt-BR.md`
- [x] English command line: English command and option names (`validate`, `render`, `extract`, `--output`…) next to the Portuguese ones; messages, labels in the files and the HTML preview in the chosen language
- [x] Visual identity "Raias": symbol, IBM Plex fonts, colors and components in the interface (technical-drawing look: square corners, white paper, BPMN-style lanes), README header and share image; brand guide in `docs/brand.md`

Left for later: `docker compose` has not been run end to end yet (Postgres itself is covered by the suite on
PGlite); importing XLSX directly, without going through CSV.

## Phase 5 — In the cloud

- [ ] `nuvem` (cloud) mode: login, workspaces, roles
- [ ] Collaboration and comments
- [ ] Custom domain
