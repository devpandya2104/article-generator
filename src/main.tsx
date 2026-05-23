import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ArticleGenerator from './pages/ArticleGenerator';
import SheetGenerator from './pages/SheetGenerator';
import DocConverter from './pages/DocConverter';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"                    element={<Dashboard />} />
        <Route path="/article-generator"   element={<ArticleGenerator />} />
        <Route path="/sheet-generator"     element={<SheetGenerator />} />
        <Route path="/doc-converter"       element={<DocConverter />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
