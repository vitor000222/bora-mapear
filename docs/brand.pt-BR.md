# A marca do Bora Mapear

[English](brand.md) · **Português**

O Bora Mapear tem cara de instrumento, não de app de demonstração: papel branco, linha fina, cantos quase retos e o
desenho no padrão do BPMN. O azul aparece pouco, e por isso chama a atenção quando aparece.

## O símbolo

Três raias e um processo que desce por elas em ângulo reto, como as setas de um diagrama BPMN: o início é vazado,
a tarefa do meio é cheia de azul, o fim é um ponto de tinta. As raias são o desenho mais característico de um
mapeamento (quem faz o quê), e o caminho é o processo passando por elas.

| Arquivo | Uso |
|---|---|
| [`marca/simbolo.svg`](marca/simbolo.svg) | O símbolo em fundo claro. |
| [`marca/simbolo-escuro.svg`](marca/simbolo-escuro.svg) | O símbolo em fundo escuro. |
| [`marca/icone-app.svg`](marca/icone-app.svg) | Ícone do app: o símbolo num quadrado de tinta. |
| [`marca/favicon.svg`](marca/favicon.svg) | Abaixo de 32 px, o símbolo vira três barras: azul, azul claro e tinta. É o favicon do app. |
| [`marca/cabecalho-claro.png`](marca/cabecalho-claro.png), [`marca/cabecalho-escuro.png`](marca/cabecalho-escuro.png) | Cabeçalho do README, claro e escuro. |
| [`marca/compartilhamento.png`](marca/compartilhamento.png), [`marca/compartilhamento-pt.png`](marca/compartilhamento-pt.png) | Imagem de compartilhamento, 1280 × 640, em inglês e em português. No GitHub, vai em Settings → Social preview. |

O nome se escreve "Bora Mapear", com as iniciais maiúsculas, em IBM Plex Sans peso 600. Deixe em volta da marca uma
área livre da altura de uma raia. Tamanho mínimo: 120 px de largura para a marca completa, 24 px para o símbolo;
abaixo disso, as três barras.

Evite: girar as raias, trocar a cor do caminho, arredondar o caminho em curva.

## Cores

| Cor | Claro | Escuro | Uso |
|---|---|---|---|
| Azul caneta | `#1F4ACC` | `#8EA6FF` | ação principal, seleção, foco, links |
| Tinta | `#1C1C1A` | `#ECEBE6` | texto, elementos do desenho, fim do caminho, avisos |
| Grafite | `#5E5E57` | `#A5A49B` | texto secundário |
| Linha | `#DCDCD5` | `#34342F` | bordas |
| Linha forte | `#C3C3BA` | `#4A4A44` | contorno de campos e botões, raias do desenho |
| Cinza papel | `#F4F4F1` | `#2A2A27` | cabeçalho de tabela, botão sob o mouse |
| Papel | `#FFFFFF` | `#171716` | fundo da página |
| Ok / aviso / erro | `#1A7A43` / `#8A5A00` / `#C2361F` | `#5FD08A` / `#F0C060` / `#F38B80` | estados |

Numa tela, quase tudo é papel, tinta e grafite. O azul é para a ação principal, a seleção e o foco, e só. Um botão
azul por área; os outros são de contorno ou de texto. Botão desligado fica cinza, nunca azul desbotado.

## Tipos

IBM Plex Sans para tudo e IBM Plex Mono para chaves, código e nome de linguagem (`E04`, `EV-002`, `BPMN 2.0`).
Títulos em peso 600, sem apertar as letras. Escala: 24 título, 16 subtítulo, 14 corpo, 13 rótulo, 12 legenda.

## Formas

Cantos quase retos: 3 px nos campos e selos, 4 px nos botões, 6 px nos cartões. Nada de pílula. Selo é uma etiqueta
retangular: o de linguagem tem contorno e letra mono; o de estado tem fundo tingido da cor do estado. O desenho
segue o BPMN: raia em caixa com linha fina e o nome numa coluna à esquerda, tarefa com canto de 8 px, ícones de tipo
em traço (nunca emoji), fundo quadriculado. A forma diz o tipo (início fino, fim grosso, losango na decisão), e o
azul marca só o que está selecionado.

As três visões seguem essas regras: React Flow, BPMN (bpmn-js) e Mermaid desenham em tinta sobre papel branco, com as
raias na linha forte, IBM Plex nos rótulos e o canvas claro nos dois temas. No Mermaid, as setas são retas. O XML do
BPMN exportado não leva cor própria, só as que alguém pintou.

Sem degradê e sem brilho. Sombra só no que flutua (diálogo, aviso, paleta de cor), e curta. A hierarquia vem da
linha e do peso da letra.
