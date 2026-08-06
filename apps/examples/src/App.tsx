import { useMemo, useState } from 'react';
import { SequenceDiagram } from '@archidea-ai/mermaid/react';
import { examples } from './examples';
import { themes } from './themes';
import { RendererBadge } from './components/RendererBadge';
import { ThemeSelector } from './components/ThemeSelector';
import type { CSSProperties } from 'react';

export function App() {
  const [exampleId, setExampleId] = useState(examples[0]!.id);
  const [theme, setTheme] = useState(themes[0]!);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const example = examples.find((entry) => entry.id === exampleId) ?? examples[0]!;
  const source = edits[example.id] ?? example.source;

  // Tokens land on the renderer's own element, so nothing else on the page moves.
  const themeStyle = useMemo(() => theme.tokens as CSSProperties, [theme]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>@archidea-ai/mermaid</h1>
        <p>
          A drop-in replacement for mermaid that renders with React. Sequence diagrams get a native
          interactive renderer — step through them, supply values as they are needed, and watch
          branches resolve themselves. Every other diagram type proxies to upstream mermaid.
        </p>
      </header>

      <div className="app__layout">
        <nav className="app__card app__nav" aria-label="Examples">
          {examples.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-current={entry.id === example.id}
              onClick={() => setExampleId(entry.id)}
            >
              {entry.title}
            </button>
          ))}
        </nav>

        <main>
          <div className="app__row">
            <ThemeSelector value={theme} onChange={setTheme} />
            <RendererBadge source={source} />
          </div>

          <p style={{ marginTop: 0, color: 'var(--app-muted)', maxWidth: '75ch' }}>
            {example.description}
          </p>

          <div className="app__split">
            <div className="app__card">
              <label className="app__label" htmlFor="source">
                Diagram source
              </label>
              <textarea
                id="source"
                className="app__source"
                value={source}
                spellCheck={false}
                onChange={(event) =>
                  setEdits((previous) => ({ ...previous, [example.id]: event.target.value }))
                }
              />
            </div>

            <div className="app__card">
              <SequenceDiagram
                key={`${example.id}-${theme.id}`}
                text={source}
                style={themeStyle}
                errorFallback={(error) => (
                  <p role="alert" style={{ color: 'var(--app-muted)' }}>
                    {error.message}
                  </p>
                )}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
