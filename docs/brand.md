# Bora Mapear brand

**English** · [Português](brand.pt-BR.md)

Bora Mapear should look like an instrument, not a demo app: white paper, thin lines, nearly square corners and
diagrams drawn the BPMN way. Blue shows up rarely, so it stands out when it does.

## The symbol

Three lanes and a process going down through them at right angles, like the arrows in a BPMN diagram: the start is
hollow, the task in the middle is filled with blue, the end is an ink dot. Lanes are the most recognizable part of a
process map (who does what), and the path is the process crossing them.

| File | Use |
|---|---|
| [`marca/simbolo.svg`](marca/simbolo.svg) | The symbol on light backgrounds. |
| [`marca/simbolo-escuro.svg`](marca/simbolo-escuro.svg) | The symbol on dark backgrounds. |
| [`marca/icone-app.svg`](marca/icone-app.svg) | App icon: the symbol on an ink square. |
| [`marca/favicon.svg`](marca/favicon.svg) | Below 32 px the symbol becomes three bars: blue, light blue and ink. The app uses it as its favicon. |
| [`marca/cabecalho-claro.png`](marca/cabecalho-claro.png), [`marca/cabecalho-escuro.png`](marca/cabecalho-escuro.png) | README header, light and dark. |
| [`marca/compartilhamento.png`](marca/compartilhamento.png), [`marca/compartilhamento-pt.png`](marca/compartilhamento-pt.png) | Share image, 1280 × 640, in English and Portuguese. On GitHub it goes in Settings → Social preview. |

The name is written "Bora Mapear", with capital initials, in IBM Plex Sans weight 600. Keep a clear space around the
logo equal to the height of one lane. Minimum size: 120 px wide for the full logo, 24 px for the symbol; below that,
the three bars.

Avoid: rotating the lanes, changing the path color, curving the path.

## Colors

| Token | Light | Dark | Use |
|---|---|---|---|
| Pen blue | `#1F4ACC` | `#8EA6FF` | primary action, selection, focus, links |
| Ink | `#1C1C1A` | `#ECEBE6` | text, diagram elements, end of the path, toasts |
| Graphite | `#5E5E57` | `#A5A49B` | secondary text |
| Line | `#DCDCD5` | `#34342F` | borders |
| Strong line | `#C3C3BA` | `#4A4A44` | field and button outlines, diagram lanes |
| Paper gray | `#F4F4F1` | `#2A2A27` | table headers, button hover |
| Paper | `#FFFFFF` | `#171716` | page background |
| OK / warning / error | `#1A7A43` / `#8A5A00` / `#C2361F` | `#5FD08A` / `#F0C060` / `#F38B80` | states |

In a screen, almost everything is paper, ink and graphite. The blue is for the main action, the selection and the
focus, nothing else. One blue button per area; the rest are outlined or text buttons. A disabled button turns gray,
never washed-out blue.

## Type

IBM Plex Sans for everything and IBM Plex Mono for keys, code and notation names (`E04`, `EV-002`, `BPMN 2.0`).
Titles use weight 600, with normal letter spacing. Scale: 24 title, 16 subtitle, 14 body, 13 label, 12 caption.

## Shapes

Nearly square corners: 3 px for fields and badges, 4 px for buttons, 6 px for cards. No pills. A badge is a
rectangular tag: the notation badge has an outline and mono type; a state badge has a background tinted with the
state color. Diagrams follow BPMN: a lane is a box with a thin line and its name in a column on the left, tasks have
8 px corners, type icons are line drawings (never emoji), and the background is a grid. The shape says the type
(thin start, thick end, diamond for a decision), and the blue marks only what is selected.

No gradients and no glow. Only floating things (dialogs, toasts, the color palette) get a shadow, and a short one.
Hierarchy comes from lines and font weight.
