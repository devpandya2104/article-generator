import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ArticleGenerator from './pages/ArticleGenerator.tsx';
import './index.css';

function Router() {
  const [page, setPage] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const onHash = () => setPage(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (page === '#/articles') return <ArticleGenerator />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>
);
