import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type TipoAviso = 'sucesso' | 'erro' | 'info';
interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
  detalhes?: string[];
}

const Contexto = createContext<(texto: string, tipo?: TipoAviso, detalhes?: string[]) => void>(() => {});

let proximo = 1;

/** Avisos curtos no canto da tela: o que foi salvo, o que deu errado. */
export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: TipoAviso = 'info', detalhes?: string[]) => {
    const id = proximo++;
    setAvisos((atual) => [...atual, detalhes?.length ? { id, tipo, texto, detalhes } : { id, tipo, texto }]);
    setTimeout(() => setAvisos((atual) => atual.filter((a) => a.id !== id)), tipo === 'erro' ? 9000 : 4000);
  }, []);
  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>
            <span>{a.texto}</span>
            {a.detalhes && (
              <ul>
                {a.detalhes.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useAvisos() {
  return useContext(Contexto);
}
