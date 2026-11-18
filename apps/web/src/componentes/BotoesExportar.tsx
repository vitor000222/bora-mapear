import { useState } from 'react';
import type { FormatoImagem } from '../exportar.ts';
import { useAvisos } from '../avisos.tsx';
import { useTextos } from '../i18n/index.tsx';

/** "Exportar: SVG · PNG · PDF". Quem usa diz como gerar cada formato. */
export function BotoesExportar({ aoExportar, formatos = ['svg', 'png', 'pdf'] }: { aoExportar: (f: FormatoImagem) => Promise<void>; formatos?: FormatoImagem[] }) {
  const avisar = useAvisos();
  const t = useTextos().comum.exportar;
  const [ocupado, setOcupado] = useState<FormatoImagem | null>(null);
  return (
    <div className="grupo-exportar" role="group" aria-label={t.grupo}>
      <span className="suave pequeno">{t.rotulo}</span>
      {formatos.map((f) => (
        <button
          key={f}
          className="botao botao-compacto"
          disabled={ocupado !== null}
          onClick={async () => {
            setOcupado(f);
            try {
              // Nunca deixa os botões presos: depois de 60 s, desiste com aviso.
              await Promise.race([aoExportar(f), new Promise((_, falha) => setTimeout(() => falha(new Error(t.demorou)), 60_000))]);
            } catch (e) {
              avisar(t.falhou(f.toUpperCase(), e instanceof Error ? e.message : String(e)), 'erro');
            } finally {
              setOcupado(null);
            }
          }}
        >
          {ocupado === f ? '…' : f.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
