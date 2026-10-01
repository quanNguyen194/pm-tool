import React from 'react';
import { createRoot } from 'react-dom/client';
import './harness.css';
import { ThemeProvider } from '../src/context/ThemeContext';
import { MockProvider } from './mockApp';
import { MainLayout } from '../src/App';
import './audit';

const theme = new URLSearchParams(location.search).get('theme');
if (theme) {
  localStorage.setItem('omni_theme_v1', theme);
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <MockProvider>
      <MainLayout />
    </MockProvider>
  </ThemeProvider>
);
