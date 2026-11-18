// Idiomas das mensagens que o núcleo escreve para a pessoa ler: portão, comparação,
// registro de correções, importadores. O conteúdo da matriz é do usuário e não se traduz.

export type Idioma = 'pt' | 'en';

export const IDIOMAS: readonly Idioma[] = ['pt', 'en'];

/** "en", "en-US" ou um Accept-Language que começa por inglês → 'en'. O resto → 'pt'. */
export function lerIdioma(valor: string | null | undefined): Idioma {
  return valor && /^\s*en\b/i.test(valor) ? 'en' : 'pt';
}
