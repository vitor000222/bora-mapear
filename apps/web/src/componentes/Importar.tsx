import { useState, type FormEvent, type RefObject } from 'react';
import { apiIa, ErroApi } from '../api.ts';
import { useAvisos } from '../avisos.tsx';

const ACEITOS = '.bpmn,.xml,.mmd,.mermaid,.md,.txt,.puml,.plantuml';

/** Importar um processo de outra ferramenta: BPMN e Mermaid sem IA; o resto, pelo Conversor. */
export function Importar({ dialogo }: { dialogo: RefObject<HTMLDialogElement | null> }) {
  const avisar = useAvisos();
  const [nome, setNome] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ofereceIa, setOfereceIa] = useState<string | null>(null);

  const lerArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setConteudo(await arquivo.text());
    if (!nome.trim()) setNome(arquivo.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    setOfereceIa(null);
  };

  const fechar = () => {
    dialogo.current?.close();
    setOfereceIa(null);
  };

  const importar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await apiIa.importar(nome.trim(), conteudo);
      fechar();
      if (r.avisos.length) avisar('Importado, com avisos:', 'info', r.avisos);
      else avisar('Importado.', 'sucesso');
      window.location.hash = `#/m/${r.mapeamento.id}`;
    } catch (erro) {
      if (erro instanceof ErroApi && erro.extra['podeUsarIa']) setOfereceIa(erro.message);
      else avisar(erro instanceof Error ? erro.message : String(erro), 'erro', erro instanceof ErroApi ? erro.detalhes : undefined);
    } finally {
      setEnviando(false);
    }
  };

  const comIa = async () => {
    setEnviando(true);
    try {
      const r = await apiIa.importarComIa(nome.trim(), conteudo);
      fechar();
      avisar('O Conversor está trabalhando. A proposta aparece na aba IA.', 'info');
      window.location.hash = `#/m/${r.mapeamento.id}/ia`;
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : String(erro), 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <dialog ref={dialogo} className="dialogo" aria-labelledby="titulo-importar">
      <form onSubmit={(e) => void importar(e)}>
        <h2 id="titulo-importar">Importar processo</h2>
        <p className="suave pequeno">
          BPMN 2.0 (Camunda, bpmn.io, Bizagi, o próprio Bora Mapear) e fluxograma Mermaid entram direto, sem IA. Outro formato (PlantUML, lista de passos, tabela) passa
          pelo Conversor.
        </p>
        <label className="campo">
          <span>Arquivo</span>
          <input type="file" accept={ACEITOS} onChange={(e) => void lerArquivo(e.target.files?.[0])} />
        </label>
        <label className="campo">
          <span>Ou cole o conteúdo</span>
          <textarea
            className="entrada mono"
            rows={8}
            value={conteudo}
            onChange={(e) => {
              setConteudo(e.target.value);
              setOfereceIa(null);
            }}
            placeholder={'flowchart LR\n  A([Início]) --> B[Receber pedido] --> C([Fim])'}
          />
        </label>
        <label className="campo">
          <span>Nome do mapeamento</span>
          <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        {ofereceIa && (
          <div className="faixa-info">
            <p>{ofereceIa}</p>
            <button type="button" className="botao botao-primario" onClick={() => void comIa()} disabled={enviando}>
              Converter com IA
            </button>
          </div>
        )}
        <div className="dialogo-acoes">
          <button type="button" className="botao" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="botao botao-primario" disabled={enviando || !nome.trim() || !conteudo.trim()}>
            {enviando ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
