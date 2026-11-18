import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProvedorAvisos } from './avisos.tsx';
import { Lista } from './paginas/Lista.tsx';
import { PaginaMapeamento } from './paginas/PaginaMapeamento.tsx';
import { Configuracoes } from './paginas/Configuracoes.tsx';
import './estilos.css';

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
  const id = hash.match(/^#\/m\/([\w-]+)/)?.[1];
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
        </nav>
      </header>
      <main className="conteudo">{id ? <PaginaMapeamento key={id} id={id} /> : hash === '#/config' ? <Configuracoes /> : <Lista />}</main>
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
