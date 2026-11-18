import type { Context } from 'hono';
import type { z } from 'zod';
import { lerIdioma, type Idioma } from '@bora-mapear/core';

/** Texto para a pessoa ler, nos dois idiomas da interface. */
export type Texto = string | Record<Idioma, string>;

export function emIdioma(texto: Texto, idioma: Idioma): string {
  return typeof texto === 'string' ? texto : texto[idioma];
}

/** O idioma de quem pediu, pelo Accept-Language que a interface manda. Sem ele, português. */
export function idiomaDe(c: Context): Idioma {
  return lerIdioma(c.req.header('Accept-Language'));
}

/** Erro com status HTTP e mensagem para mostrar ao usuário. */
export class ErroHttp extends Error {
  readonly status: 400 | 404 | 409 | 413 | 415 | 422 | 502;
  readonly detalhes: unknown;
  readonly texto: Texto;
  constructor(status: ErroHttp['status'], mensagem: Texto, detalhes?: unknown) {
    super(emIdioma(mensagem, 'pt'));
    this.status = status;
    this.detalhes = detalhes;
    this.texto = mensagem;
  }
  mensagemEm(idioma: Idioma): string {
    return emIdioma(this.texto, idioma);
  }
}

/** Lê e valida o corpo JSON da requisição. */
export async function corpo<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let dado: unknown;
  try {
    const texto = await c.req.text();
    dado = texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErroHttp(400, { pt: 'O corpo da requisição não é JSON válido.', en: 'The request body is not valid JSON.' });
  }
  const r = schema.safeParse(dado);
  if (!r.success) {
    throw new ErroHttp(
      400,
      { pt: 'Dados inválidos.', en: 'Invalid data.' },
      r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`),
    );
  }
  return r.data;
}
