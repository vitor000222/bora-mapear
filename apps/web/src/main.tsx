import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IDIOMAS } from '@bora-mapear/core';
import { ProvedorAvisos } from './avisos.tsx';
import { NOMES_IDIOMA, ProvedorIdioma, useIdioma, useTextos, type Idioma } from './i18n/index.tsx';
import { Lista } from './paginas/Lista.tsx';
import { PaginaMapeamento } from './paginas/PaginaMapeamento.tsx';
import { Configuracoes } from './paginas/Configuracoes.tsx';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
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

/**
 * Símbolo: três raias e um processo que desce por elas em ângulo reto, como as setas do BPMN.
 * Início vazado, tarefa cheia, fim em tinta. As cores trocam com o tema pelo CSS.
 */
function Simbolo() {
  return (
    <svg className="simbolo" viewBox="0 0 120 92" width={28} height={22} aria-hidden="true" focusable="false">
      <rect className="simbolo-raia" x="0" y="0" width="120" height="24" rx="3" fill="#E4E4DE" />
      <rect className="simbolo-raia" x="0" y="34" width="120" height="24" rx="3" fill="#E4E4DE" />
      <rect className="simbolo-raia" x="0" y="68" width="120" height="24" rx="3" fill="#E4E4DE" />
      <path className="simbolo-caminho" d="M24 12H42V46H78V80H96" fill="none" stroke="#1F4ACC" strokeWidth="6" strokeLinejoin="miter" />
      <circle className="simbolo-inicio" cx="17" cy="12" r="8" fill="#FFFFFF" stroke="#1F4ACC" strokeWidth="5" />
      <rect className="simbolo-tarefa" x="48" y="36" width="24" height="20" rx="4" fill="#1F4ACC" />
      <circle className="simbolo-fim" cx="103" cy="80" r="9" fill="#1C1C1A" />
    </svg>
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
          <Simbolo />
          <span>Bora Mapear</span>
        </a>
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
