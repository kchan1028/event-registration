import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthRoot } from './auth';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthRoot>
      <App />
    </AuthRoot>
  </StrictMode>,
);
