# @archidea-ai/mermaid

A drop-in replacement for [mermaid](https://github.com/mermaid-js/mermaid) that
renders diagrams with **React**, in the browser — as real HTML, so diagram text
wraps, selects, and reaches screen readers.

Sequence diagrams get a native interactive renderer: step through them one
interaction at a time, supply values as they are needed, and watch branches
resolve themselves. Every other diagram type is proxied to upstream mermaid, so
nothing renders worse than it does today.

**[Live examples →](https://archidea-ai.github.io/mermaid/)**

| Diagram type                                                           | Renderer          | Interaction                                                                        |
| ---------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `sequenceDiagram`                                                      | `sequence-react`  | Step through; classic lanes or the modern grouped stage                            |
| `stateDiagram-v2`                                                      | `state-react`     | Stand in a state, choose the next transition                                       |
| `flowchart`                                                            | `flowchart-react` | One overview; click a node to light its neighbourhood                              |
| `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` | `c4-react`        | Every boundary shut on first paint; expand, pick a relation, or step a dynamic run |
| everything else                                                        | `proxy`           | Rendered by upstream mermaid, unchanged                                            |

## Install

```bash
pnpm add @archidea-ai/mermaid mermaid react react-dom
```

`mermaid` is an _optional_ peer — it is loaded lazily and only needed for diagram
types without a native renderer. `react` and `react-dom` are peers so there is
only ever one React instance.

## Use it as a drop-in

Alias the import, and existing code keeps working:

```jsonc
// package.json
{ "pnpm": { "overrides": { "mermaid": "npm:@archidea-ai/mermaid" } } }
```

```ts
import mermaid from '@archidea-ai/mermaid';

mermaid.initialize({ theme: 'dark' });
const { svg } = await mermaid.render('diagram-1', 'sequenceDiagram\n  A->>B: hi');
```

A parity test asserts the facade exposes a superset of upstream's public API, so
"drop-in" stays true across upstream releases.

## Use it as React

```tsx
import { SequenceDiagram } from '@archidea-ai/mermaid/react';

<SequenceDiagram text={source} onStepController={(controller) => controller?.next()} />;
```

Subpath exports: `@archidea-ai/mermaid` (mermaid-compatible module),
`@archidea-ai/mermaid/react` (components and hooks),
`@archidea-ai/mermaid/registry` (registry and contracts).

## Controlling selection

`<Mermaid>` accepts `selection` and `onSelect` for any renderer whose
capabilities include `events`. Omit `selection` for uncontrolled use — a
renderer tracks its own pick internally and reports it. Pass it — including
`null` — to drive selection from outside instead, which is what lets a search
box or an external list highlight something on the diagram:

```tsx
import { useState } from 'react';
import { Mermaid } from '@archidea-ai/mermaid/react';
import type { DiagramElementRef } from '@archidea-ai/mermaid/registry';

const [selection, setSelection] = useState<DiagramElementRef | null>(null);

<Mermaid text={source} selection={selection} onSelect={(event) => setSelection(event.element)} />;
```

`element` is `null` when a selection is cleared, and `originalEvent` is absent
when the pick did not come from a click — a C4 dynamic run's step and the
controlling prop itself both select without one.

## Interactive sequence diagrams

Two extensions to mermaid syntax, both written inside message text so the same
source still renders in upstream mermaid — it simply shows the braces literally.

| Form               | Meaning                                                       |
| ------------------ | ------------------------------------------------------------- |
| `{{name}}`         | Read. Prompts the viewer if unbound when the step is reached. |
| `{{name = value}}` | Binds a value when the step is reached.                       |
| `{{name : Type}}`  | Declares a type, choosing the prompt input.                   |

`Type` is `string`, `number`, `boolean`, or a literal union like
`"admin" \| "member"` — a union renders as a select rather than a free-text box.

Fragment labels that parse as an expression resolve themselves:

```
sequenceDiagram
    User->>API: POST /login as {{role : "admin" | "member"}}
    API-->>User: {{userId = "u-8842"}}
    alt {{role}} == "admin"
        API->>User: audit log
    else
        API->>User: 200 OK
    end
```

The viewer picks a role once, and the `alt` needs no further input. A condition
referencing an unbound variable prompts for it rather than quietly taking the
`else` branch. Prose labels ("is the user logged in?") stay viewer-chosen, so
ordinary diagrams keep working.

`alt`, `opt`, `par`, `critical`, `loop` and `break` are all resolved rather than
drawn in full, and skipped material is shown as skipped.

### Two views

| View                  | Shows                                                                                  | Good for                                    |
| --------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Classic** (default) | The whole protocol laid out vertically, with lifelines, fragments and notes in place   | Reading the design, seeing structure        |
| **Modern**            | Participants pinned across the top, and only the call happening right now between them | Walking someone through it a step at a time |

Both share the same stepper, values and decisions — switching views mid-run keeps
your place. Set the starting view with `sequence.variant`:

```ts
mermaid.initialize({ sequence: { variant: 'modern' } });
```

## Theming

Every colour resolves through a `--seq-*` custom property scoped to the renderer
root, so a host theme reaches these components and nothing else:

```tsx
<SequenceDiagram text={source} style={{ '--seq-accent': '#7fd1ff' }} />
```

Import the default tokens once: `import '@archidea-ai/mermaid-diagram-sequence/theme.css'`.
Roles are documented in [`docs/art-direction.md`](docs/art-direction.md).

## Compatibility notes

Three documented differences from upstream:

1. **React is required in the host**, including for the `mermaid.run()` over
   `<pre class="mermaid">` path. That is inherent to rendering with React.
2. **`detectType` and `mermaidAPI` need upstream loaded.** They stay synchronous
   like upstream's, but our upstream load is lazy — `await preloadUpstream()`
   first, or call anything that loads it (`render`, `run`, `parse`,
   `contentLoaded`). The thrown error says so.
3. **Diagram type detection currently requires upstream**, even for types a
   native renderer would claim.

Sequence diagram layout is not pixel-identical to upstream — it is a different
renderer with different priorities. The resolved renderer id (`sequence-react`
vs `proxy`) makes the substitution visible rather than pretending otherwise.

**`mermaid.render()` returns upstream's SVG even for natively rendered types.**
The interactive renderers draw HTML, which cannot also be a standalone `<svg>`;
wrapping it in a `<foreignObject>` would render in browsers but break Inkscape,
ImageMagick and every SVG-to-image converter. So the imperative path stays
portable and the React components carry the interactivity. The two have
genuinely different jobs.

## Security

SVG produced on the proxy path comes from upstream mermaid, which sanitises it
with DOMPurify according to its own `securityLevel` config. We add no
sanitisation and no bypass — `securityLevel` still governs. The native sequence
renderer builds React elements and uses no `innerHTML` at all.

## Development

```bash
pnpm install
pnpm nx run-many -t lint test build
pnpm nx dev examples
```

See [`CLAUDE.md`](CLAUDE.md) for architecture and the Nx workflow.

## Licence

MIT
