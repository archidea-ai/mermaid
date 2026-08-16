import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@archidea-ai/mermaid-diagram-sequence/theme.css';
import '@archidea-ai/mermaid-diagram-state/state.css';
import '@archidea-ai/mermaid-diagram-flowchart/flowchart.css';
import '@archidea-ai/mermaid-diagram-c4/c4.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
