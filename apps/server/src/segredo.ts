import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Cifra das chaves de API (AES-256-GCM). A chave-mestra vem de BORA_SECRET; sem ela, é gerada uma vez
 * e guardada em data/segredo.key, ao lado do banco. Assim, quem copiar só o banco não lê as chaves.
 */
export class Cofre {
  private readonly chaveMestra: Buffer;

  constructor(chaveMestra: Buffer) {
    if (chaveMestra.length !== 32) throw new Error('A chave-mestra precisa de 32 bytes.');
    this.chaveMestra = chaveMestra;
  }

  static deSegredo(segredo: string): Cofre {
    return new Cofre(createHash('sha256').update(segredo, 'utf8').digest());
  }

  /** BORA_SECRET, se houver; senão o arquivo, criado na primeira vez. */
  static carregar(caminhoArquivo: string, segredoDoAmbiente?: string): Cofre {
    if (segredoDoAmbiente) return Cofre.deSegredo(segredoDoAmbiente);
    if (!existsSync(caminhoArquivo)) {
      writeFileSync(caminhoArquivo, randomBytes(32).toString('base64'), { encoding: 'utf8', mode: 0o600 });
      try {
        chmodSync(caminhoArquivo, 0o600);
      } catch {
        // No Windows o chmod não se aplica.
      }
    }
    return new Cofre(Buffer.from(readFileSync(caminhoArquivo, 'utf8').trim(), 'base64'));
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cifra = createCipheriv('aes-256-gcm', this.chaveMestra, iv);
    const dados = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
    return `v1:${Buffer.concat([iv, cifra.getAuthTag(), dados]).toString('base64')}`;
  }

  decifrar(guardado: string): string {
    if (!guardado.startsWith('v1:')) throw new Error('Formato de chave cifrada desconhecido.');
    const bruto = Buffer.from(guardado.slice(3), 'base64');
    const decifra = createDecipheriv('aes-256-gcm', this.chaveMestra, bruto.subarray(0, 12));
    decifra.setAuthTag(bruto.subarray(12, 28));
    try {
      return Buffer.concat([decifra.update(bruto.subarray(28)), decifra.final()]).toString('utf8');
    } catch {
      throw new Error('Não deu para decifrar a chave: a BORA_SECRET ou o arquivo segredo.key mudou. Cadastre a chave de novo.');
    }
  }
}

/** Só os últimos 4 caracteres, para a pessoa reconhecer qual chave é. */
export function finalDaChave(chave: string): string {
  return chave.length > 8 ? chave.slice(-4) : '';
}
