import { ErroAgente, ErroProvedor, somarUso, USO_ZERO, type Uso } from '@bora-mapear/agentes';
import type { Idioma } from '@bora-mapear/core';
import type { Execucao, Repositorio, TipoExecucao } from './repositorio.ts';

export interface ContextoExecucao {
  progresso(mensagem: string): void;
  uso(u: Uso): void;
}

/**
 * Roda um agente em segundo plano. A execução é gravada na hora, com status "rodando";
 * o progresso, o uso de tokens e o resultado vão sendo gravados enquanto ele trabalha.
 */
export class Executor {
  private readonly emCurso = new Map<string, Promise<void>>();
  private readonly repo: Repositorio;

  constructor(repo: Repositorio) {
    this.repo = repo;
  }

  async iniciar(
    mapeamentoId: string,
    tipo: TipoExecucao,
    entrada: unknown,
    trabalho: (ctx: ContextoExecucao) => Promise<unknown>,
    idioma: Idioma = 'pt',
  ): Promise<Execucao> {
    const execucao = await this.repo.criarExecucao(mapeamentoId, tipo, entrada);
    const log: string[] = [];
    let uso: Uso = USO_ZERO;
    let gravando = Promise.resolve();
    const gravar = () => {
      gravando = gravando.then(() =>
        this.repo.atualizarExecucao(execucao.id, { log: [...log], tokensEntrada: uso.tokensEntrada, tokensSaida: uso.tokensSaida, custo: uso.custo ?? null }),
      );
    };
    const ctx: ContextoExecucao = {
      progresso: (m) => {
        log.push(m);
        gravar();
      },
      uso: (u) => {
        uso = somarUso(uso, u);
        gravar();
      },
    };
    const promessa = (async () => {
      try {
        const saida = await trabalho(ctx);
        await gravando;
        await this.repo.atualizarExecucao(execucao.id, {
          status: 'concluida',
          saida,
          log,
          tokensEntrada: uso.tokensEntrada,
          tokensSaida: uso.tokensSaida,
          custo: uso.custo ?? null,
          concluidoEm: new Date().toISOString(),
        });
      } catch (erro) {
        await gravando;
        const conhecido = erro instanceof ErroProvedor || erro instanceof ErroAgente;
        if (!conhecido) console.error(`Execução ${execucao.id} falhou:`, erro);
        await this.repo.atualizarExecucao(execucao.id, {
          status: 'falhou',
          erro: conhecido ? erro.message : `${idioma === 'en' ? 'Unexpected error' : 'Erro inesperado'}: ${erro instanceof Error ? erro.message : String(erro)}`,
          log,
          tokensEntrada: uso.tokensEntrada,
          tokensSaida: uso.tokensSaida,
          custo: uso.custo ?? null,
          concluidoEm: new Date().toISOString(),
        });
      } finally {
        this.emCurso.delete(execucao.id);
      }
    })();
    this.emCurso.set(execucao.id, promessa);
    return execucao;
  }

  /** Para testes e para desligar o servidor com calma. */
  async aguardar(id?: string): Promise<void> {
    if (id) await this.emCurso.get(id);
    else await Promise.all(this.emCurso.values());
  }
}
