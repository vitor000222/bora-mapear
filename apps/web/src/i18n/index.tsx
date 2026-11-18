import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Idioma } from '@bora-mapear/core';
import { TEXTOS, type Textos } from './textos/index.ts';

export type { Idioma, Textos };

/** Cada idioma escrito nele mesmo, para o seletor. */
export const NOMES_IDIOMA: Record<Idioma, string> = { pt: 'Português', en: 'English' };

const CHAVE = 'bora-mapear.idioma';

function inicial(): Idioma {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === 'pt' || salvo === 'en') return salvo;
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): decide pelo navegador.
  }
  return /^pt\b/i.test(navigator.language) ? 'pt' : 'en';
}

function aplicarNoDocumento(idioma: Idioma): void {
  document.documentElement.lang = idioma === 'en' ? 'en' : 'pt-BR';
}

// O idioma também fica num módulo, para o que roda fora do React (api.ts, exportar.ts) e para
// tratadores de evento registrados uma vez só (bpmn-js), que guardariam o `t` antigo.
let atual: Idioma = inicial();
aplicarNoDocumento(atual);

export function idiomaAtual(): Idioma {
  return atual;
}

/** Os textos do idioma atual, para usar fora de componente. Dentro de componente, use `useTextos`. */
export function textos(): Textos {
  return TEXTOS[atual];
}

/** Locale do Intl para datas e números: 'pt-BR' ou 'en-US'. */
export function localDoIdioma(idioma: Idioma = atual): string {
  return idioma === 'en' ? 'en-US' : 'pt-BR';
}

const Contexto = createContext<{ idioma: Idioma; mudar: (idioma: Idioma) => void }>({ idioma: atual, mudar: () => {} });

export function ProvedorIdioma({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState(atual);
  const mudar = useCallback((novo: Idioma) => {
    atual = novo;
    aplicarNoDocumento(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem armazenamento: vale só até recarregar.
    }
    setIdioma(novo);
  }, []);
  const valor = useMemo(() => ({ idioma, mudar }), [idioma, mudar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** O idioma atual e como trocar. */
export function useIdioma() {
  return useContext(Contexto);
}

/** Os textos do idioma atual. Trocar o idioma redesenha quem usa. */
export function useTextos(): Textos {
  return TEXTOS[useContext(Contexto).idioma];
}
