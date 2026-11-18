# A matriz do processo

[English](matrix.md) · **Português**

A matriz é o que o Bora Mapear guarda. Todo desenho sai dela. O schema oficial está em
[`packages/core/src/matriz.ts`](../packages/core/src/matriz.ts); o JSON Schema sai com
`npm run schema`.

## Forma

```json
{
  "versaoSchema": 1,
  "processo": { "id": "pedido-de-venda", "nome": "Pedido de venda" },
  "raias": [
    { "id": "vendas", "nome": "Vendas" },
    { "id": "financeiro", "nome": "Financeiro" }
  ],
  "etapas": [
    { "chave": "E01", "tipo": "inicio", "nome": "Pedido recebido", "raia": "vendas",
      "proximos": [{ "para": "E02" }] },
    { "chave": "E02", "tipo": "gateway_exclusivo", "nome": "Crédito aprovado?", "raia": "financeiro",
      "proximos": [{ "para": "E03", "rotulo": "Sim" }, { "para": "E04", "rotulo": "Não" }] }
  ]
}
```

- **A ordem das raias** é a ordem em que elas aparecem de cima para baixo.
- **A ordem das etapas** é a ordem de leitura. Ela desempata o layout; quem define o fluxo são os
  `proximos`.

## A linha (etapa)

| Campo | Obrigatório | O que é |
|---|---|---|
| `chave` | sim | Estável e nunca reaproveitada (`E01`, `ASIS-001`). Começa com letra; letras, números, `_` e `-`. É o id do elemento no BPMN e no React Flow, e é por ela que as correções se prendem. |
| `tipo` | sim | Ver a tabela abaixo. |
| `nome` | sim | Verbo no infinitivo + objeto, no vocabulário de quem faz ("Emitir nota fiscal"). Pode ficar vazio só em evento e gateway paralelo. |
| `raia` | sim | O `id` de uma raia. Raia é **função**, não pessoa. |
| `proximos` | sim | As saídas: `{ "para": "<chave>", "rotulo": "Sim" }`. **É isto que desenha o fluxo.** |
| `descricao` | não | 1 a 2 frases. Vira a documentação do elemento. |
| `ator` | não | Quem executa, quando difere da raia. |
| `sistema` | não | Ferramenta usada (ERP, planilha, WhatsApp). |
| `entrada` / `saida` | não | O que entra e o que sai da etapa. |
| `regra` | não | Alçada, política, critério. |
| `evidencias` | não | Chaves das evidências que sustentam a linha (`EV-001`). O Mapeador sempre preenche. |
| `confianca` | não | 0 a 1, autoavaliação do agente. |
| `revisarHumano` | não | `true` quando o agente pede revisão. |
| `subprocesso` | não | Só em etapa do tipo `subprocesso`: o id do mapeamento filho que a detalha. Em outro tipo, o portão avisa (`SUBPROCESSO_EM_ETAPA_COMUM`). |

## Em CSV

A mesma matriz vira planilha (uma linha por etapa) e volta. A exportação segue o idioma da interface:

| | Interface em português | Interface em inglês |
|---|---|---|
| Separador | `;` | `,` |
| Colunas | os nomes dos campos acima: `chave`, `tipo`, `proximos`, `revisar_humano`… | em inglês: `key`, `type`, `next`, `human_review`… |
| Tipo | rótulo em português ("Decisão (um caminho)") | rótulo em inglês ("Decision (one path)") |
| Confiança | vírgula decimal (`0,8`) | ponto decimal (`0.8`) |
| Raias sem etapa | linha de comentário no fim: `# raias sem etapa: …` | `# lanes without steps: …` |

`proximos` fica como `E04: Sim, E10: Não`; os rótulos são conteúdo da matriz e não são traduzidos. A importação
aceita tudo isso, qualquer que seja o idioma da interface: os dois separadores, colunas nos dois idiomas, o tipo
pelo código (`gateway_exclusivo`) ou pelo rótulo nos dois idiomas, e vírgula ou ponto decimal.

## Tipos

| Tipo | BPMN | Use quando |
|---|---|---|
| `inicio` | startEvent | o processo começa. Uma origem, um início. |
| `fim` | endEvent | o processo termina. |
| `evento_intermediario` | intermediateThrowEvent | um marco no meio do caminho. |
| `evento_timer` | intermediateCatchEvent + timer | o processo **espera um prazo**. |
| `evento_mensagem` | intermediateCatchEvent + message | o processo **espera um terceiro**. |
| `tarefa` | task | ainda não se sabe o tipo. |
| `tarefa_usuario` | userTask | pessoa **com** sistema. O caso comum. |
| `tarefa_manual` | manualTask | pessoa **sem** sistema. Uma fileira delas é retrabalho aparecendo. |
| `tarefa_servico` | serviceTask | sistema sozinho, já automático. |
| `tarefa_envio` | sendTask | envia e não espera. |
| `tarefa_recebimento` | receiveTask | fica parado esperando receber. |
| `tarefa_regra` | businessRuleTask | aplica uma regra de negócio. |
| `subprocesso` | subProcess (recolhido) | um bloco detalhado em outro mapeamento. |
| `gateway_exclusivo` | exclusiveGateway | decisão: só um caminho. Nome é a pergunta; rótulos são as respostas. |
| `gateway_paralelo` | parallelGateway | abre ou junta caminhos simultâneos. |
| `gateway_inclusivo` | inclusiveGateway | um ou mais caminhos. |
| `gateway_evento` | eventBasedGateway | o caminho depende de qual evento chega primeiro. |

## O portão

`validarMatriz(matriz)` devolve `{ ok, problemas }`. `ok` é falso se houver qualquer **erro**. As
mensagens são escritas para o agente Mapeador conseguir corrigir sozinho.

| Código | Severidade | Quando |
|---|---|---|
| `CHAVE_REPETIDA` | erro | duas linhas com a mesma chave |
| `RAIA_REPETIDA` | erro | duas raias com o mesmo id |
| `RAIA_INEXISTENTE` | erro | a linha aponta uma raia que não existe |
| `DESTINO_INEXISTENTE` | erro | um `proximos.para` aponta uma chave que não existe |
| `AUTO_LIGACAO` | erro | a etapa aponta para ela mesma |
| `SEM_INICIO` / `SEM_FIM` | erro | a matriz não tem início ou não tem fim |
| `INICIO_COM_ENTRADA` | erro | alguém aponta para um início |
| `FIM_COM_SAIDA` | erro | um fim tem saída |
| `BECO_SEM_SAIDA` | erro | etapa que não é fim e não tem saída |
| `SAIDA_SEM_ROTULO` | erro | gateway exclusivo ou inclusivo com mais de uma saída e alguma sem rótulo |
| `NOME_VAZIO` | erro | tarefa, subprocesso ou gateway de decisão sem nome |
| `INALCANCAVEL` | erro | não há caminho de nenhum início até a etapa |
| `SAIDA_REPETIDA` | aviso | duas saídas para o mesmo destino |
| `SAIDA_MULTIPLA_SEM_GATEWAY` | aviso | tarefa com mais de uma saída (paralelo implícito) |
| `GATEWAY_INUTIL` | aviso | gateway com uma entrada e uma saída |
| `RAIA_VAZIA` | aviso | raia sem nenhuma etapa |

## As correções

O que o usuário muda na forma do desenho fica **fora** da matriz, chaveado pela chave da linha:

```json
{
  "versao": 1,
  "nos":     { "E04": { "x": 520, "y": 300, "corFundo": "#fff3e0", "corBorda": "#ef6c00" } },
  "arestas": { "Fluxo_E03_E04": { "pontos": [{ "x": 400, "y": 205 }, { "x": 520, "y": 340 }] } },
  "raias":   { "financeiro": { "altura": 260 } },
  "pool":    {}
}
```

- Só entra o que **difere** do layout automático. O resto continua automático e se reorganiza quando a
  matriz muda.
- `extrairCorrecoesDoBpmn(xml, matriz)` lê o XML que o bpmn-js exporta depois da edição;
  `extrairCorrecoesDoReactFlow(nodes, matriz)` faz o mesmo com os nós do React Flow.
- `descreverCorrecoes(matriz, correcoes)` devolve as frases do registro ("Moveu *Analisar crédito*
  (E04) 40 px para a direita"), que o Agente Visual usa como exemplo do gosto do usuário.
- O id de cada seta é `Fluxo_<de>_<para>` (com `_2`, `_3` se houver duas setas iguais). O de cada raia
  é `Raia_<id>`.
