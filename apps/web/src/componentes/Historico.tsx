import { useEffect, useState } from 'react';
import type { Matriz } from '@bora-mapear/core';
import { api, formatarData, NOMES_LINGUAGEM, type CabecalhoVersao, type RegistroCorrecao } from '../api.ts';
import { useAvisos } from '../avisos.tsx';
import { useTextos } from '../i18n/index.tsx';

interface Props {
  id: string;
  versaoAtual: number;
  /** Muda quando algo foi salvo, para recarregar. */
  atualizar: number;
  aoRestaurar: (m: Matriz, numero: number) => Promise<void>;
}

// O servidor grava o autor como "pessoa" ou "agente:<nome>" (ver apps/server/src/rotas-ia.ts).
const TIPO_DO_AGENTE = { leitor: 'ler', mapeador: 'mapear', revisor: 'revisar', editor: 'editar', conversor: 'converter' } as const;

export function Historico({ id, versaoAtual, atualizar, aoRestaurar }: Props) {
  const avisar = useAvisos();
  const textos = useTextos();
  const t = textos.mapeamento.historico;

  const autorDe = (autor: string): string => {
    if (autor === 'pessoa') return t.voce;
    const nome = autor.match(/^agente:(\w+)$/)?.[1] as keyof typeof TIPO_DO_AGENTE | undefined;
    const tipo = nome && TIPO_DO_AGENTE[nome];
    return tipo ? t.agente(textos.ia.agentes[tipo]) : autor;
  };
  const [versoes, setVersoes] = useState<CabecalhoVersao[] | null>(null);
  const [registro, setRegistro] = useState<RegistroCorrecao[] | null>(null);

  useEffect(() => {
    Promise.all([api.versoes(id), api.registro(id)])
      .then(([v, r]) => (setVersoes(v), setRegistro(r)))
      .catch((e: unknown) => avisar(e instanceof Error ? e.message : String(e), 'erro'));
  }, [id, atualizar, versaoAtual, avisar]);

  const restaurar = async (numero: number) => {
    if (!window.confirm(t.restaurarConfirmar(versaoAtual + 1, numero))) return;
    try {
      const v = await api.versao(id, numero);
      await aoRestaurar(v.matriz, numero);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'erro');
    }
  };

  return (
    <div className="historico">
      <div className="cartao secao">
        <h2>{t.versoes}</h2>
        {!versoes && <p className="suave">{t.carregando}</p>}
        <ol className="lista-historico">
          {versoes?.map((v) => (
            <li key={v.numero}>
              <div className="historico-cabecalho">
                <strong>v{v.numero}</strong>
                {v.numero === versaoAtual && <span className="selo selo-ok">{t.atual}</span>}
                <span className="suave pequeno">
                  {formatarData(v.criadoEm)} · {autorDe(v.autor)} · {t.etapas(v.etapas)}
                </span>
              </div>
              {v.mensagem && <p>{v.mensagem}</p>}
              {v.numero !== versaoAtual && (
                <button className="botao botao-fantasma" onClick={() => void restaurar(v.numero)}>
                  {t.restaurar}
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="cartao secao">
        <h2>{t.registro}</h2>
        <p className="suave pequeno">{t.registroDica}</p>
        {registro?.length === 0 && <p className="suave">{t.nenhumaCorrecao}</p>}
        <ol className="lista-historico">
          {registro?.map((r) => (
            <li key={r.id}>
              <div className="historico-cabecalho">
                <span className={`selo selo-${r.linguagem}`}>{NOMES_LINGUAGEM[r.linguagem]}</span>
                <span className="suave pequeno">
                  {formatarData(r.criadoEm)} · {t.naVersao(r.versao)}
                </span>
              </div>
              <ul>
                {r.frases.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
