import type { Idioma } from '@bora-mapear/core';
import * as comum from './comum.ts';
import * as lista from './lista.ts';
import * as mapeamento from './mapeamento.ts';
import * as matriz from './matriz.ts';
import * as desenho from './desenho.ts';
import * as ia from './ia.ts';
import * as config from './config.ts';

// Uma área por tela (ou grupo de componentes), cada uma no seu arquivo:
//   comum       topo, conexão, formatos, exportar            (main.tsx, api.ts, exportar.ts, BotoesExportar)
//   lista       lista de mapeamentos, novo, importar         (Lista.tsx, Importar.tsx)
//   mapeamento  página do mapeamento, histórico, aba Código  (PaginaMapeamento.tsx, Historico.tsx, AbaCodigo.tsx)
//   matriz      grade da matriz                             (EditorMatriz.tsx)
//   desenho     BPMN, React Flow e Mermaid                  (VisaoBpmn.tsx, VisaoReactFlow.tsx, DiagramaMermaid.tsx)
//   ia          aba IA                                      (AbaIa.tsx)
//   config      configurações                               (Configuracoes.tsx)
const pt = {
  comum: comum.pt,
  lista: lista.pt,
  mapeamento: mapeamento.pt,
  matriz: matriz.pt,
  desenho: desenho.pt,
  ia: ia.pt,
  config: config.pt,
};

export type Textos = typeof pt;

export const TEXTOS: Record<Idioma, Textos> = {
  pt,
  en: {
    comum: comum.en,
    lista: lista.en,
    mapeamento: mapeamento.en,
    matriz: matriz.en,
    desenho: desenho.en,
    ia: ia.en,
    config: config.en,
  },
};
