# CLAUDE.md

Working notes for this repository. Read before changing anything.

## What this is

`@archidea-ai/mermaid` is a **drop-in replacement for the `mermaid` package**
that renders diagrams with React in the browser. Sequence diagrams get a native
interactive renderer you can step through; every other diagram type is proxied
to upstream mermaid unchanged.

The long-term goal is one native React renderer per diagram type, added one at a
time. The registry is the seam that makes that additive.

## Package graph

| Package                                 | Role                                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@archidea-ai/mermaid-core`             | Framework-free. Renderer registry, lazy loader for the optional `mermaid` peer, proxy renderer, config store, interaction contracts. **No runtime React import.** |
| `@archidea-ai/mermaid-react`            | `<Mermaid>` host, `<SequenceDiagram>`, hooks.                                                                                                                     |
| `@archidea-ai/mermaid-diagram-sequence` | Native interactive sequence renderer: parser, timeline, layout, components.                                                                                       |
| `@archidea-ai/mermaid`                  | Drop-in facade. Mirrors upstream's module shape, registers the native renderers.                                                                                  |
| `apps/examples`                         | Not published. Consumes the facade as an end user would; deploys to GitHub Pages.                                                                                 |

### Key architectural facts

- **Strategy registry.** `defaultRegistry.resolve(type)` returns a renderer. The
  proxy is the terminal fallback and supports every type, so resolution never
  fails. Adding a diagram type is one `register()` call — never a change to the
  facade or the host component.
- **Sequence has two views**, `classic` (CSS Grid lanes, `canvas.tsx` +
  `layout/grid.ts`) and `modern` (free placement on a stage, `stage.tsx` +
  `layout/stage.ts`). They share the run controller, tokens and emphasis
  vocabulary but deliberately not their layout. Modern is the default.
- **`layout/stage.ts` is pure and takes a measured size**, so it stays testable
  under `node`; `use-stage-size.ts` does the measuring. It falls back to a fixed
  size when unmeasured — without that, the first paint stacks every object at
  the origin, and nothing renders under jsdom at all.
- **A prompt has three states: true, false, and unanswered.** Booleans and
  literal unions both render as toggle _buttons_, never a switch — a switch in
  its off position claims `false` was chosen when the run is actually blocked
  waiting, and it cannot offer `false` in one click. (base-ui's Switch also
  emits an `aria-labelledby` pointing at an element it never renders, which
  leaves the control with no accessible name.)
- **A declared type belongs to the variable, not to one mention of it.**
  `collectDeclaredTypes(ast)` gathers every annotation so a prompt raised by a
  fragment condition (which usually just reads `{{name}}`) gets the same input
  as one raised by the message that declared it.
- **Branch on `step.kind`, never `step.node.type`.** The `+`/`-` activation
  shorthand emits a message step _and_ a lifecycle step that share one message
  node, so keying off the node renders the same message twice.
- **Renderers draw HTML, not SVG.** The sequence canvas is a CSS Grid of real
  elements: text wraps, is selectable and findable, screen readers get content
  rather than `<text>` nodes, and shadcn primitives can live _on_ the diagram.
  Graph-shaped types (state, flowchart, class, C4) will add one absolutely
  positioned SVG overlay for diagonal edges only — nodes stay HTML.
- **Layout computes grid indices, not pixels.** `layout/grid.ts` is pure and
  unit-testable under `node` because the browser does the sizing. There is no
  `TextMeasurer` any more — if you find yourself measuring text, the layout is
  fighting CSS.
- **`DiagramRenderer` has two render paths.** The optional `Component` serves the
  React tree; `renderToSvg` serves the imperative API. **Native renderers
  delegate `renderToSvg` to `proxyRenderer`** — an HTML component cannot also be
  a standalone `<svg>`, and a `<foreignObject>` wrapper breaks every
  SVG-to-image converter. So `mermaid.render()` keeps returning portable
  upstream SVG and drop-in parity stays exactly true. **Consumers branch on
  `capabilities`, never on which fields are present.**
- **Registration is a shared side-effect module.** `packages/mermaid/src/lib/register-defaults.ts`
  is imported by _every_ entry point (`index`, `/react`, `/registry`). Registering
  from one entry only means a consumer importing a different subpath silently
  gets the proxy.
- **The timeline is a pure projection.** `buildTimeline(ast, decisions, bindings)`
  — picking a branch or entering a value re-derives it rather than patching state.
  Variable effects are applied by replay, so stepping backwards is correct and
  `goTo(n)` is path-independent.
- **Parse failure is never fatal.** The sequence renderer falls back to the proxy
  and reports a non-fatal notice, so this package never renders worse than upstream.

## Working with Nx

Nx 23 with pnpm workspaces.

- **`@nx/vite/plugin` infers `build`, `dev`, `preview`, `typecheck`. It does NOT
  infer `test` in this version** — `@nx/vitest` ships executors, not inference.
  Every project therefore declares an explicit `test` target in its own
  `project.json` running `vitest run --config vitest.config.ts`. If you add a
  package, copy that block or it will have no tests wired.
- **`vite.config.ts` builds; `vitest.config.ts` tests.** Keep them separate — a
  `test` block inside `vite.config.ts` is not picked up.
- Commands: `pnpm nx run-many -t lint test build`, `pnpm nx affected -t lint test build`,
  `pnpm nx test <project>`, `pnpm nx dev examples`.
- **After changing `nx.json`, plugins, or project config, run `pnpm nx reset`.**
  The project graph is cached and will otherwise report stale targets.
- Add `--skip-nx-cache` when a run _should_ have changed and did not.

### Before committing

```bash
pnpm format && pnpm nx run-many -t lint test build
```

All four must pass. Commit messages are Conventional Commits — `nx release`
derives versions from them.

### Dependency rules

- **`mermaid` is an optional peer everywhere**, loaded only via `import('mermaid')`
  and always in `rollupOptions.external`. Never a regular dependency.
- **`react` / `react-dom` are peers everywhere.** A second React copy breaks hooks
  and context.
- In-repo references use `workspace:*`.
- **Vitest configs alias workspace packages to source.** Without the alias they
  resolve to stale `dist` and you will debug a build you did not make.
- **TypeScript is pinned to `5.9.3`, not 7.x** — `typescript-eslint@8` declares
  `typescript: ">=4.8.4 <6.1.0"`.

### Testing constraints

- **jsdom has no SVG layout** (`getBBox`, `getComputedTextLength` are absent), so
  real upstream mermaid cannot render in unit tests. Always `vi.mock('mermaid', …)`
  and assert _delegation_. Importing real mermaid into a jsdom worker will OOM.
- Layout is pure and takes an injected `TextMeasurer`; tests use
  `createEstimateMeasurer()` so geometry is deterministic.
- **Real-browser checks live in `apps/examples/e2e`** (`pnpm nx e2e examples`).
  They exist because unit tests have two blind spots that have each already
  shipped a bug: jsdom implements no CSS Grid layout, so geometry is invisible
  to it; and specs alias workspace packages to source, so the bundled artefact
  is never exercised. Anything about _placement_ or _the build_ belongs there.
- **Tailwind preflight is not imported, so the renderer carries its own scoped
  reset** in `@layer base`. It must stay in that layer — unlayered CSS outranks
  every Tailwind utility and silently strips shadcn's backgrounds and borders.

## Art direction

Full rules in **`docs/art-direction.md`**. The parts you cannot skip:

- **No component hard-codes a colour.** Every value is a `--seq-*` custom
  property. The one exception is mermaid's own `rect rgb(...)`, which is content.
- Tokens are scoped to `.archidea-sequence`, the renderer root, so a host theme
  reaches our components and nothing else. Theme overrides go inline on that same
  element — an ancestor cannot beat the root's own class rule.
- **Four emphasis levels only**: `current`, `path`, `spent`, `rest`. Computed once
  in `layout/emphasis.ts` and passed down; components never decide their own.
- One accent, marking _current_ and nothing else.
- Motion conveys state, never decoration. Layout must not shift between steps.
- Controls the active renderer cannot support are **disabled and visible**, never
  hidden.
- shadcn/ui preset `buFywKm` (style `base-lyra`, on `@base-ui/react`), vendored
  into `packages/diagram-sequence/src/lib/ui/`.
- **Tailwind is imported without preflight** — a global reset would leak into the
  host page. `theme.css` takes the theme and utility layers only.
  `shadcn-cli.css` exists only to satisfy the shadcn CLI's validator and is never
  built.
- **After `shadcn add`, rewrite the generated `@/lib/ui/...` imports to relative
  ones.** The `@` alias resolves only inside this package, and the facade and
  examples app consume it by source — alias imports break their builds.
- shadcn's semantic variables are declared inside `.archidea-sequence` in terms of
  `--seq-*`; its default palette is never imported.

Run the `impeccable` skill when doing substantial visual work.

## Extending: adding a diagram type

1. New package `packages/diagram-<type>/`, exporting a `DiagramRenderer` with a
   `Component` and the capabilities it _genuinely_ supports.
2. Derive `renderToSvg` from the Component via `renderToStaticMarkup`.
3. Fall back to `proxyRenderer` when parsing fails.
4. Register it from `packages/mermaid/src/lib/register-defaults.ts`.
5. Implement the relevant contracts from `core/src/lib/interaction.ts`.

No change to the facade, the host component, or consumer call sites is needed.

## Repository conventions

- **Specs and plans live in `docs/superpowers/` and are gitignored** by project
  convention. They are working documents, not repository content.
  `docs/art-direction.md` is committed and is the exception.
- Test files are `*.spec.ts(x)`, colocated in `src/`.
- Node ids in the sequence AST derive from source position and must be stable
  across re-renders — never an array index.
