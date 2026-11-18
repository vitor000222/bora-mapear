# The process matrix

**English** · [Português](matrix.pt-BR.md)

The matrix is what Bora Mapear stores. Every diagram comes from it. The official schema is in
[`packages/core/src/matriz.ts`](../packages/core/src/matriz.ts); the JSON Schema comes out with
`npm run schema`. The field names and type values are in Portuguese, because that is the real format; each
one is explained in English below.

## Shape

```json
{
  "versaoSchema": 1,
  "processo": { "id": "sales-order", "nome": "Sales order" },
  "raias": [
    { "id": "vendas", "nome": "Sales" },
    { "id": "financeiro", "nome": "Finance" }
  ],
  "etapas": [
    { "chave": "E01", "tipo": "inicio", "nome": "Order received", "raia": "vendas",
      "proximos": [{ "para": "E02" }] },
    { "chave": "E02", "tipo": "gateway_exclusivo", "nome": "Credit approved?", "raia": "financeiro",
      "proximos": [{ "para": "E03", "rotulo": "Yes" }, { "para": "E04", "rotulo": "No" }] }
  ]
}
```

`versaoSchema` is the schema version (always `1`); `processo` (process) has an `id`, a `nome` (name) and an
optional `descricao` (description); `raias` are the lanes, each with an `id` and a `nome`; `etapas` are the
steps, one row each.

- **The order of the lanes** is the order in which they appear, from top to bottom.
- **The order of the steps** is the reading order. It breaks ties in the layout; what defines the flow is
  `proximos`.

## The row (`etapa`, step)

| Field | Required | What it is |
|---|---|---|
| `chave` (key) | yes | Stable and never reused (`E01`, `ASIS-001`). Starts with a letter; letters, digits, `_` and `-`. It is the element id in BPMN and in React Flow, and it is what the corrections attach to. |
| `tipo` (type) | yes | See the table below. |
| `nome` (name) | yes | Verb + object, in the words of whoever does the work ("Issue invoice"). It can be empty only on events and parallel gateways. |
| `raia` (lane) | yes | The `id` of a lane. A lane is a **role**, not a person. |
| `proximos` (next) | yes | The outgoing flows: `{ "para": "<chave>", "rotulo": "Yes" }`, where `para` (to) is the target key and `rotulo` (label) is the arrow text. **This is what draws the flow.** |
| `descricao` (description) | no | 1 to 2 sentences. Becomes the element's documentation. |
| `ator` (actor) | no | Who does it, when different from the lane. |
| `sistema` (system) | no | Tool used (ERP, spreadsheet, WhatsApp). |
| `entrada` / `saida` (input / output) | no | What goes into the step and what comes out of it. |
| `regra` (rule) | no | Approval limit, policy, criterion. |
| `evidencias` (evidence) | no | Keys of the evidence that supports the row (`EV-001`). The Mapper always fills it in. |
| `confianca` (confidence) | no | 0 to 1, the agent's self-assessment. |
| `revisarHumano` (needs human review) | no | `true` when the agent asks for review. |
| `subprocesso` (subprocess) | no | Only on a step of type `subprocesso`: the id of the child map that details it. On any other type, the gate warns (`SUBPROCESSO_EM_ETAPA_COMUM`). |

## As CSV

The same matrix becomes a spreadsheet (one row per step) and comes back. The export follows the interface
language:

| | English interface | Portuguese interface |
|---|---|---|
| Separator | `,` | `;` |
| Columns | English names: `key`, `type`, `next`, `human_review`… | the field names above: `chave`, `tipo`, `proximos`, `revisar_humano`… |
| Type | English label ("Decision (one path)") | Portuguese label ("Decisão (um caminho)") |
| Confidence | decimal point (`0.8`) | decimal comma (`0,8`) |
| Lanes without steps | comment line at the end: `# lanes without steps: …` | `# raias sem etapa: …` |

`proximos` (next) is written as `E04: Yes, E10: No`; the labels are matrix content and are not translated. The
import accepts all of it, whatever the interface language: either separator, column names in either language,
the type as the code (`gateway_exclusivo`) or as the label in either language, and a decimal comma or point.

## Types

| Type | BPMN | Use when |
|---|---|---|
| `inicio` (start) | startEvent | the process starts. One origin, one start. |
| `fim` (end) | endEvent | the process ends. |
| `evento_intermediario` (intermediate milestone) | intermediateThrowEvent | a milestone along the way. |
| `evento_timer` (timer wait) | intermediateCatchEvent + timer | the process **waits for a deadline**. |
| `evento_mensagem` (message wait) | intermediateCatchEvent + message | the process **waits for a third party**. |
| `tarefa` (task) | task | the type is not known yet. |
| `tarefa_usuario` (system task) | userTask | a person **with** a system. The common case. |
| `tarefa_manual` (manual task) | manualTask | a person **without** a system. A string of them is rework showing up. |
| `tarefa_servico` (automated task) | serviceTask | the system alone, already automated. |
| `tarefa_envio` (send) | sendTask | sends and does not wait. |
| `tarefa_recebimento` (receive) | receiveTask | stays put, waiting to receive. |
| `tarefa_regra` (business rule) | businessRuleTask | applies a business rule. |
| `subprocesso` (subprocess) | subProcess (collapsed) | a block detailed in another process map. |
| `gateway_exclusivo` (decision, one path) | exclusiveGateway | decision: only one path. The name is the question; the labels are the answers. |
| `gateway_paralelo` (parallel) | parallelGateway | opens or joins simultaneous paths. |
| `gateway_inclusivo` (decision, one or more) | inclusiveGateway | one or more paths. |
| `gateway_evento` (event-based decision) | eventBasedGateway | the path depends on which event arrives first. |

## The gate

`validarMatriz(matriz)` returns `{ ok, problemas }` (problems). `ok` is false if there is any **error**. The
messages are written so the Mapper agent can fix them on its own.

| Code | Severity | When |
|---|---|---|
| `CHAVE_REPETIDA` | error | two rows with the same key |
| `RAIA_REPETIDA` | error | two lanes with the same id |
| `RAIA_INEXISTENTE` | error | the row points to a lane that does not exist |
| `DESTINO_INEXISTENTE` | error | a `proximos.para` points to a key that does not exist |
| `AUTO_LIGACAO` | error | the step points to itself |
| `SEM_INICIO` / `SEM_FIM` | error | the matrix has no start or no end |
| `INICIO_COM_ENTRADA` | error | something points to a start |
| `FIM_COM_SAIDA` | error | an end has an outgoing flow |
| `BECO_SEM_SAIDA` | error | a step that is not an end and has no outgoing flow |
| `SAIDA_SEM_ROTULO` | error | an exclusive or inclusive gateway with more than one outgoing flow and one of them without a label |
| `NOME_VAZIO` | error | a task, subprocess or decision gateway without a name |
| `INALCANCAVEL` | error | there is no path from any start to the step |
| `SAIDA_REPETIDA` | warning | two outgoing flows to the same target |
| `SAIDA_MULTIPLA_SEM_GATEWAY` | warning | a task with more than one outgoing flow (implicit parallel) |
| `GATEWAY_INUTIL` | warning | a gateway with one incoming and one outgoing flow |
| `RAIA_VAZIA` | warning | a lane with no steps |

## The corrections

What the user changes in the layout of the diagram stays **outside** the matrix, keyed by the row's key:

```json
{
  "versao": 1,
  "nos":     { "E04": { "x": 520, "y": 300, "corFundo": "#fff3e0", "corBorda": "#ef6c00" } },
  "arestas": { "Fluxo_E03_E04": { "pontos": [{ "x": 400, "y": 205 }, { "x": 520, "y": 340 }] } },
  "raias":   { "financeiro": { "altura": 260 } },
  "pool":    {}
}
```

`versao` is the format version; `nos` are the nodes (steps), `arestas` the edges (arrows) and `raias` the
lanes. `corFundo` and `corBorda` are the fill and border colors, `pontos` the points of an arrow, `altura` a
height.

- Only what **differs** from the automatic layout goes in. The rest stays automatic and rearranges itself when
  the matrix changes.
- `extrairCorrecoesDoBpmn(xml, matriz)` reads the XML that bpmn-js exports after editing;
  `extrairCorrecoesDoReactFlow(nodes, matriz)` does the same with the React Flow nodes.
- `descreverCorrecoes(matriz, correcoes)` returns the correction log sentences
  ("Moved *Check customer credit* (E04) 40 px to the right"), which the Visual agent uses as examples of the
  user's taste.
- The id of each arrow is `Fluxo_<de>_<para>` (flow from/to; with `_2`, `_3` if there are two identical
  arrows). The id of each lane is `Raia_<id>`.
