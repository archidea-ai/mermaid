import { useEffect, useMemo, useState } from 'react';
import { SequenceDiagram } from '@archidea-ai/mermaid/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@archidea-ai/mermaid-diagram-sequence';
import { examples } from './examples';
import { loadTheme, saveTheme } from './themes';
import { encodeSource, selectionFromHash } from './share-link';
import { RendererBadge } from './components/RendererBadge';
import { ThemeSelector } from './components/ThemeSelector';
import { CopyLinkButton } from './components/CopyLinkButton';
import type { CSSProperties } from 'react';
import type { Theme } from './themes';

export function App() {
  // Read once. We own the fragment from here on, so reacting to it as well
  // would mean reacting to our own writes.
  const [initial] = useState(() => selectionFromHash(window.location.hash));
  const [exampleId, setExampleId] = useState(initial.exampleId);
  const [edits, setEdits] = useState<Record<string, string>>(initial.edits);
  const [theme, setThemeState] = useState(loadTheme);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    saveTheme(next);
  };

  const example = examples.find((entry) => entry.id === exampleId) ?? examples[0]!;
  const source = edits[example.id] ?? example.source;
  const edited = source !== example.source;

  // Debounced because Safari throttles replaceState and throws once a burst of
  // keystrokes outruns it; replaced rather than pushed because thirty
  // keystrokes should not cost thirty presses of the back button.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.history.replaceState(null, '', `#${encodeSource(source)}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [source]);

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

            <span className="app__spacer" />
            <CopyLinkButton source={source} />
          </div>

          {/* An example's blurb describes the example. Once the source has been
              edited it describes something that is no longer on screen, so the
              line says what is true of the chart in front of you instead. */}
          <p style={{ marginTop: 0, color: 'var(--app-muted)', maxWidth: '75ch' }}>
            {edited
              ? 'Edited — the address bar carries this chart. Copy the link to share exactly what you see.'
              : example.description}
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
