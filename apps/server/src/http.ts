import type { Context } from 'hono';
import type { z } from 'zod';

/** Erro com status HTTP e mensagem para mostrar ao usuário. */
export class ErroHttp extends Error {
  readonly status: 400 | 404 | 409 | 413 | 415 | 422 | 502;
  readonly detalhes: unknown;
  constructor(status: ErroHttp['status'], mensagem: string, detalhes?: unknown) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

/** Lê e valida o corpo JSON da requisição. */
export async function corpo<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let dado: unknown;
  try {
    const texto = await c.req.text();
    dado = texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErroHttp(400, 'O corpo da requisição não é JSON válido.');
  }
  const r = schema.safeParse(dado);
  if (!r.success) {
    throw new ErroHttp(400, 'Dados inválidos.', r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`));
  }
  return r.data;
}
