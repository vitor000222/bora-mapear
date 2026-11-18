import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProvedorAvisos } from './avisos.tsx';
import { Lista } from './paginas/Lista.tsx';
import { PaginaMapeamento } from './paginas/PaginaMapeamento.tsx';
import { Configuracoes } from './paginas/Configuracoes.tsx';
import './estilos.css';

// AGPL-3.0, seção 13: quem usa o app pela rede tem direito ao código-fonte da versão que está rodando.
// Num fork hospedado, aponte para o repositório do fork.
const CODIGO_FONTE = 'https://github.com/vitor000222/bora-mapear';

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const aoMudar = () => setHash(window.location.hash);
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return hash;
}

function App() {
  const hash = useHash();
  const rota = hash.match(/^#\/m\/([\w-]+)(?:\/(\w+))?/);
  const id = rota?.[1];
  const aba = rota?.[2];
  return (
    <>
      <header className="topo">
        <a href="#/" className="marca">
          <img src="/icone.svg" alt="" width={24} height={24} />
          <span>Bora Mapear</span>
        </a>
        <span className="topo-lema">Uma matriz, várias linguagens.</span>
        <nav className="topo-nav">
          <a href="#/" aria-current={!id && hash !== '#/config' ? 'page' : undefined}>
            Mapeamentos
          </a>
          <a href="#/config" aria-current={hash === '#/config' ? 'page' : undefined}>
            Configurações
          </a>
          <a href={CODIGO_FONTE} target="_blank" rel="noreferrer" title="Código-fonte (AGPL-3.0)">
            Código-fonte
          </a>
        </nav>
      </header>
      <main className="conteudo">{id ? <PaginaMapeamento key={id} id={id} {...(aba ? { abaInicial: aba } : {})} /> : hash === '#/config' ? <Configuracoes /> : <Lista />}</main>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProvedorAvisos>
      <App />
    </ProvedorAvisos>
  </StrictMode>,
);
