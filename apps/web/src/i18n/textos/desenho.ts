// Textos da área "desenho": BPMN (bpmn-js), React Flow e Mermaid. Ver a regra em comum.ts.

export const pt = {
  // Botões e avisos que as visões BPMN e React Flow têm em comum.
  acoes: {
    aplicarEstilo: 'Aplicar meu estilo',
    aplicarEstiloTitulo: 'Pinta as etapas com as regras do seu estilo (Configurações)',
    semEstilo: 'Você ainda não tem estilo. Defina ou aprenda um em Configurações.',
    voltarAutomatico: 'Voltar ao automático',
    salvando: 'Salvando…',
  },
  bpmn: {
    dica: 'Arraste, redimensione e pinte (clique no elemento → ícone de cor). Renomear, criar ou apagar aqui também vale: ao salvar, o app mostra o que mudou na matriz.',
    naoSalvas: 'Mudanças não salvas',
    voltarAutomaticoTitulo: 'Apaga as correções desta visão e volta ao layout automático',
    salvar: 'Salvar',
    naoLeu: (motivo: string) => `Não deu para ler o desenho: ${motivo}`,
    naoAbriu: (motivo: string) => `O bpmn-js não abriu o desenho: ${motivo}`,
    /** Mensagem da versão nova criada a partir do desenho (aparece no histórico). */
    mensagemVersao: 'Editada no desenho BPMN.',
    elementosIgnorados: 'Elementos criados ou apagados no desenho voltam ao que a matriz diz.',
    mudanca: {
      titulo: 'O desenho mudou o conteúdo da matriz',
      portao: (n: number) => `O portão vai acusar ${n} ${n === 1 ? 'erro' : 'erros'}. Dá para salvar e corrigir na Matriz.`,
      salvarComoVersao: (versao: number) => `Salvar como versão ${versao}`,
      revisar: 'Revisar na Matriz',
      soForma: 'Salvar só a forma',
      soFormaTitulo: 'Guarda só posições e cores; o conteúdo volta ao da matriz',
      continuar: 'Continuar editando',
    },
  },
  reactflow: {
    dica: 'Arraste as etapas; selecione (Shift para várias) e escolha uma cor.',
    naoSalvas: 'Correções não salvas',
    voltarAutomaticoTitulo: 'Apaga as correções desta visão',
    salvarCorrecoes: 'Salvar correções',
    corDe: (n: number) => `Cor de ${n === 1 ? '1 etapa' : `${n} etapas`}`,
    cores: {
      azul: 'Azul',
      verde: 'Verde',
      amarelo: 'Amarelo',
      laranja: 'Laranja',
      vermelho: 'Vermelho',
      roxo: 'Roxo',
    },
    pintarDe: (cor: string) => `Pintar de ${cor.toLowerCase()}`,
    semCor: 'Sem cor',
    tirarCor: 'Tirar a cor',
  },
  mermaid: {
    naoPronto: 'o desenho ainda não está pronto',
    naoLeu: (motivo: string) => `O Mermaid não leu o código: ${motivo}`,
  },
};

export const en: typeof pt = {
  acoes: {
    aplicarEstilo: 'Apply my style',
    aplicarEstiloTitulo: 'Colors the steps with your style rules (Settings)',
    semEstilo: 'You have no style yet. Define or learn one in Settings.',
    voltarAutomatico: 'Reset to automatic',
    salvando: 'Saving…',
  },
  bpmn: {
    dica: 'Drag, resize and color (click an element → color icon). Renaming, creating or deleting here also counts: when you save, the app shows what changed in the matrix.',
    naoSalvas: 'Unsaved changes',
    voltarAutomaticoTitulo: 'Deletes the corrections in this view and goes back to the automatic layout',
    salvar: 'Save',
    naoLeu: (motivo: string) => `Could not read the diagram: ${motivo}`,
    naoAbriu: (motivo: string) => `bpmn-js could not open the diagram: ${motivo}`,
    mensagemVersao: 'Edited in the BPMN diagram.',
    elementosIgnorados: 'Elements created or deleted in the diagram go back to what the matrix says.',
    mudanca: {
      titulo: 'The diagram changed the matrix content',
      portao: (n: number) => `The gate will flag ${n} ${n === 1 ? 'error' : 'errors'}. You can save and fix ${n === 1 ? 'it' : 'them'} in the Matrix.`,
      salvarComoVersao: (versao: number) => `Save as version ${versao}`,
      revisar: 'Review in the Matrix',
      soForma: 'Save layout only',
      soFormaTitulo: 'Keeps only positions and colors; the content goes back to the matrix',
      continuar: 'Keep editing',
    },
  },
  reactflow: {
    dica: 'Drag the steps; select (Shift for several) and pick a color.',
    naoSalvas: 'Unsaved corrections',
    voltarAutomaticoTitulo: 'Deletes the corrections in this view',
    salvarCorrecoes: 'Save corrections',
    corDe: (n: number) => `Color for ${n === 1 ? '1 step' : `${n} steps`}`,
    cores: {
      azul: 'Blue',
      verde: 'Green',
      amarelo: 'Yellow',
      laranja: 'Orange',
      vermelho: 'Red',
      roxo: 'Purple',
    },
    pintarDe: (cor: string) => `Paint ${cor.toLowerCase()}`,
    semCor: 'No color',
    tirarCor: 'Remove the color',
  },
  mermaid: {
    naoPronto: 'the diagram is not ready yet',
    naoLeu: (motivo: string) => `Mermaid could not read the code: ${motivo}`,
  },
};
