import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ArticleGenerator from './pages/ArticleGenerator.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ArticleGenerator />
  </StrictMode>
);
