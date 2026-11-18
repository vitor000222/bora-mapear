import { useEffect, useState } from 'react';
import type { Matriz } from '@bora-mapear/core';
import { api, formatarData, NOMES_LINGUAGEM, type CabecalhoVersao, type RegistroCorrecao } from '../api.ts';
import { useAvisos } from '../avisos.tsx';

interface Props {
  id: string;
  versaoAtual: number;
  /** Muda quando algo foi salvo, para recarregar. */
  atualizar: number;
  aoRestaurar: (m: Matriz, numero: number) => Promise<void>;
}

export function Historico({ id, versaoAtual, atualizar, aoRestaurar }: Props) {
  const avisar = useAvisos();
  const [versoes, setVersoes] = useState<CabecalhoVersao[] | null>(null);
  const [registro, setRegistro] = useState<RegistroCorrecao[] | null>(null);

  useEffect(() => {
    Promise.all([api.versoes(id), api.registro(id)])
      .then(([v, r]) => (setVersoes(v), setRegistro(r)))
      .catch((e: unknown) => avisar(e instanceof Error ? e.message : String(e), 'erro'));
  }, [id, atualizar, versaoAtual, avisar]);

  const restaurar = async (numero: number) => {
    if (!window.confirm(`Criar a versão ${versaoAtual + 1} com a matriz da versão ${numero}? As versões entre elas continuam no histórico.`)) return;
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
        <h2>Versões da matriz</h2>
        {!versoes && <p className="suave">Carregando…</p>}
        <ol className="lista-historico">
          {versoes?.map((v) => (
            <li key={v.numero}>
              <div className="historico-cabecalho">
                <strong>v{v.numero}</strong>
                {v.numero === versaoAtual && <span className="selo selo-ok">atual</span>}
                <span className="suave pequeno">
                  {formatarData(v.criadoEm)} · {v.autor === 'pessoa' ? 'você' : v.autor} · {v.etapas} etapas
                </span>
              </div>
              {v.mensagem && <p>{v.mensagem}</p>}
              {v.numero !== versaoAtual && (
                <button className="botao botao-fantasma" onClick={() => void restaurar(v.numero)}>
                  Restaurar esta versão
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
      <div className="cartao secao">
        <h2>Registro de correções</h2>
        <p className="suave pequeno">O que foi corrigido no desenho, em frases. É daqui que o agente visual vai aprender o seu jeito.</p>
        {registro?.length === 0 && <p className="suave">Nenhuma correção salva ainda.</p>}
        <ol className="lista-historico">
          {registro?.map((r) => (
            <li key={r.id}>
              <div className="historico-cabecalho">
                <span className={`selo selo-${r.linguagem}`}>{NOMES_LINGUAGEM[r.linguagem]}</span>
                <span className="suave pequeno">
                  {formatarData(r.criadoEm)} · na v{r.versao}
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
