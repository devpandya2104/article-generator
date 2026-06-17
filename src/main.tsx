import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './components/RequireAuth';
import Dashboard from './pages/Dashboard';
import ArticleGenerator from './pages/ArticleGenerator';
import SheetGenerator from './pages/SheetGenerator';
import DocConverter from './pages/DocConverter';
import SheetGeneratorOpenAI from './pages/SheetGeneratorOpenAI';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/article-generator"      element={<RequireAuth><ArticleGenerator /></RequireAuth>} />
          <Route path="/sheet-generator"        element={<RequireAuth><SheetGenerator /></RequireAuth>} />
          <Route path="/doc-converter"          element={<RequireAuth><DocConverter /></RequireAuth>} />
          <Route path="/sheet-generator-openai" element={<RequireAuth><SheetGeneratorOpenAI /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
