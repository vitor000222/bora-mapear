// Textos comuns: topo, seletor de idioma, conexão com o servidor, formatos e exportar.
// Regra de todos os arquivos desta pasta: `pt` é a fonte; `en` tem o tipo de `pt`, então o
// TypeScript reclama de qualquer chave faltando. Texto com valor variável vira função.

export const pt = {
  topo: {
    lema: 'Uma matriz, várias linguagens.',
    mapeamentos: 'Mapeamentos',
    configuracoes: 'Configurações',
    codigoFonte: 'Código-fonte',
    codigoFonteTitulo: 'Código-fonte (AGPL-3.0)',
    idioma: 'Idioma',
  },
  conexao: {
    semServidor: 'Sem conexão com o servidor do Bora Mapear. Ele está rodando?',
    erroStatus: (status: number) => `Erro ${status}`,
    arquivosRecusados: 'Alguns arquivos não foram aceitos.',
  },
  formatos: {
    custoMinimo: '< US$ 0,01',
    milTokens: 'mil',
  },
  linguagens: {
    bpmn: 'Raias, eventos e gateways. Edita no bpmn-js e exporta o XML que o Camunda abre.',
    mermaid: 'Código de texto. Bom para documentação, Markdown e wiki.',
    reactflow: 'Canvas livre: arrastar, pintar e organizar.',
  },
  exportar: {
    rotulo: 'Exportar',
    grupo: 'Exportar o desenho',
    falhou: (formato: string, motivo: string) => `Não deu para exportar em ${formato}: ${motivo}`,
    demorou: 'demorou demais',
    svgFalhou: 'O navegador não conseguiu desenhar o SVG.',
    pngFalhou: 'Falha ao gerar o PNG.',
  },
};

export const en: typeof pt = {
  topo: {
    lema: 'One matrix, many notations.',
    mapeamentos: 'Process maps',
    configuracoes: 'Settings',
    codigoFonte: 'Source code',
    codigoFonteTitulo: 'Source code (AGPL-3.0)',
    idioma: 'Language',
  },
  conexao: {
    semServidor: 'Cannot reach the Bora Mapear server. Is it running?',
    erroStatus: (status: number) => `Error ${status}`,
    arquivosRecusados: 'Some files were not accepted.',
  },
  formatos: {
    custoMinimo: '< US$ 0.01',
    milTokens: 'k',
  },
  linguagens: {
    bpmn: 'Lanes, events and gateways. Edit in bpmn-js and export XML that Camunda opens.',
    mermaid: 'Plain-text code. Good for docs, Markdown and wikis.',
    reactflow: 'Free canvas: drag, color and arrange.',
  },
  exportar: {
    rotulo: 'Export',
    grupo: 'Export the drawing',
    falhou: (formato: string, motivo: string) => `Could not export as ${formato}: ${motivo}`,
    demorou: 'took too long',
    svgFalhou: 'The browser could not draw the SVG.',
    pngFalhou: 'Could not create the PNG.',
  },
};
