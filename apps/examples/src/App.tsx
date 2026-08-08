import { useMemo, useState } from 'react';
import { SequenceDiagram } from '@archidea-ai/mermaid/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@archidea-ai/mermaid-diagram-sequence';
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
        <main>
          <div className="app__row">
            <div className="app-chrome app__row" style={{ margin: 0, gap: 8 }}>
              <span className="app__label" id="load-example-label">
                Load example
              </span>
              <Select
                value={example.id}
                onValueChange={(value: string | null) => value && setExampleId(value)}
              >
                <SelectTrigger aria-labelledby="load-example-label" className="min-w-64">
                  {/* Loading is an action, not a setting: the trigger always
                      reads "Load example" rather than naming what is already
                      on screen, which the heading and source below it say. */}
                  <SelectValue>Load example</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {examples.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ThemeSelector value={theme} onChange={setTheme} />
            <RendererBadge source={source} />
          </div>

          <p style={{ marginTop: 0, color: 'var(--app-muted)', maxWidth: '75ch' }}>
            {example.description}
          </p>

          <div className="app__stack">
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

            {/* The dark variant matches on an ancestor, so no extra prop is needed. */}
            <div className="app__card" data-seq-scheme={theme.scheme}>
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
