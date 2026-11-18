import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IDIOMAS } from '@bora-mapear/core';
import { ProvedorAvisos } from './avisos.tsx';
import { NOMES_IDIOMA, ProvedorIdioma, useIdioma, useTextos, type Idioma } from './i18n/index.tsx';
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

function SeletorIdioma() {
  const { idioma, mudar } = useIdioma();
  const t = useTextos();
  return (
    <select className="seletor-idioma" value={idioma} onChange={(e) => mudar(e.target.value as Idioma)} aria-label={t.comum.topo.idioma} title={t.comum.topo.idioma}>
      {IDIOMAS.map((i) => (
        <option key={i} value={i}>
          {NOMES_IDIOMA[i]}
        </option>
      ))}
    </select>
  );
}

function App() {
  const hash = useHash();
  const t = useTextos().comum.topo;
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
        <span className="topo-lema">{t.lema}</span>
        <nav className="topo-nav">
          <a href="#/" aria-current={!id && hash !== '#/config' ? 'page' : undefined}>
            {t.mapeamentos}
          </a>
          <a href="#/config" aria-current={hash === '#/config' ? 'page' : undefined}>
            {t.configuracoes}
          </a>
          <a href={CODIGO_FONTE} target="_blank" rel="noreferrer" title={t.codigoFonteTitulo}>
            {t.codigoFonte}
          </a>
          <SeletorIdioma />
        </nav>
      </header>
      <main className="conteudo">{id ? <PaginaMapeamento key={id} id={id} {...(aba ? { abaInicial: aba } : {})} /> : hash === '#/config' ? <Configuracoes /> : <Lista />}</main>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <ProvedorIdioma>
      <ProvedorAvisos>
        <App />
      </ProvedorAvisos>
    </ProvedorIdioma>
  </StrictMode>,
);
