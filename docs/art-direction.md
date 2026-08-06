# Art direction

How diagrams in this repository look, and the rules that keep them coherent as
renderers are added. Written for whoever builds the next diagram type.

## The brief

A diagram here is not a picture of a system — it is a **guided explanation of
one**. The primary viewer is someone without the technical background to read a
dense static diagram: a product manager, a support lead, a new engineer. Every
visual decision serves one question: _what is happening right now, and why?_

That produces three commitments:

1. **One thing is current at a time.** The design has a focal point at every
   moment. A diagram showing everything equally shows nothing.
2. **Nothing is hidden without saying so.** A skipped branch is visibly skipped.
   A viewer must never wonder whether they saw the whole story.
3. **Restraint, not neutrality.** Colour is spent on meaning — current, spent,
   skipped — and withheld everywhere else. Decoration that carries no state is
   removed.

## The emphasis model

Everything the renderer draws sits at exactly one of four levels. This is the
core of the visual language; a new renderer that invents a fifth is wrong.

| Level     | Meaning                                     | Treatment                                            |
| --------- | ------------------------------------------- | ---------------------------------------------------- |
| `current` | Part of the step being shown now            | Accent stroke and fill, heavier weight, bolder label |
| `path`    | A fragment frame enclosing the current step | Accent stroke, normal weight — context, not focus    |
| `spent`   | Already walked                              | Muted stroke, no accent — visible history, receded   |
| `rest`    | Not yet reached                             | Base stroke and text, lowest contrast                |

Emphasis is computed once, in `layout/emphasis.ts`, and passed down. Components
render the level they are given; they never decide it. Two components deciding
independently is how a design language drifts.

## Colour

**No component may hard-code a colour.** Every value resolves through a
`--seq-*` custom property. The single exception is mermaid's own
`rect rgb(...)` fragment colour, which comes from the diagram source and is
passed through as an inline style — it is content, not chrome.

Tokens are defined on `.archidea-sequence`, the renderer root. Scoping there is
what lets a host application theme our components without touching its own page,
and stops our tokens leaking outward. Theme overrides are applied inline on that
same element, because an ancestor cannot win against the root's own class rule.

### Token roles

| Token                                        | Role                                          |
| -------------------------------------------- | --------------------------------------------- |
| `--seq-surface`                              | Canvas and panel background                   |
| `--seq-surface-raised`                       | Sidebar panels, buttons at rest               |
| `--seq-surface-sunken`                       | Hover and pressed states                      |
| `--seq-border`                               | Panel and control borders                     |
| `--seq-text-strong`                          | Participant names, bound values, headings     |
| `--seq-text`                                 | Message labels, body copy                     |
| `--seq-text-muted`                           | Panel headings, metadata, counts              |
| `--seq-lifeline`                             | Participant lifelines at rest                 |
| `--seq-lifeline-current`                     | Lifeline of a participant in the current step |
| `--seq-participant-fill` / `-stroke`         | Participant heads at rest                     |
| `--seq-participant-current-fill` / `-stroke` | Participant heads in the current step         |
| `--seq-message` / `-text`                    | Arrows and labels at rest                     |
| `--seq-message-current`                      | The current step's arrow and label            |
| `--seq-message-spent`                        | Arrows already walked                         |
| `--seq-fragment-stroke`                      | Fragment frames at rest                       |
| `--seq-fragment-path-stroke`                 | Fragment frames enclosing the current step    |
| `--seq-fragment-label-fill`                  | The kind tab on a fragment frame              |
| `--seq-activation-fill` / `-current-fill`    | Activation bars                               |
| `--seq-note-fill` / `-stroke` / `-text`      | Notes                                         |
| `--seq-accent` / `-contrast`                 | The one accent, and text placed on it         |
| `--seq-skipped`                              | Skipped branches in the step list             |

**One accent.** `--seq-accent` marks _current_ and nothing else. A second accent
competing for attention breaks commitment 1.

**Both schemes are first-class.** Every theme defines the full token set. The
renderer never assumes a light background, and dark is not a filter over light.

**Contrast.** Text tokens must clear WCAG AA (4.5:1 for body, 3:1 for ≥18px)
against the surface they sit on, in every theme. Emphasis is carried by weight
and stroke as well as hue, so the model survives colour-blind viewing and
greyscale printing.

## Typography

One family (`--seq-font`) for prose, one mono (`--seq-font-mono`) for values and
identifiers — a bound variable is data and should look like it.

| Use                     | Size | Weight                          |
| ----------------------- | ---- | ------------------------------- |
| Participant name        | 12px | 500, 600 when current           |
| Message label           | 11px | 400, 600 when current           |
| Fragment kind and label | 10px | 400                             |
| Note body               | 11px | 400                             |
| Panel heading           | 11px | 400, uppercase, 0.06em tracking |
| Body and controls       | 13px | 400                             |

Weight, not size, signals the current step. Resizing text on state change moves
the layout and costs the viewer their place.

## Spacing and rhythm

A 4px base unit. Row height 52px (44px for note rows), column gap 48px, canvas
padding 24px, fragment inset 12px per nesting depth. Nested fragments inset
geometrically so depth reads without needing colour.

Radii: 8px panels, 6px participant boxes, 4px notes and tabs, 16px actor heads —
the rounder shape is what distinguishes an actor from a participant at a glance.

## Motion

**Purposeful motion only: it conveys state, never decoration.** Transitions run
`180ms` on `cubic-bezier(0.2, 0, 0, 1)` — long enough to be followed, short
enough not to gate the next step.

Only emphasis changes animate. Layout does not: the diagram must not reflow as
you step, or the viewer loses their place. `prefers-reduced-motion: reduce` zeroes
every duration globally, in one rule rather than per component.

## Components

Controls are shadcn/ui primitives from preset `buFywKm` — style `base-lyra`,
built on `@base-ui/react`, lucide icons — vendored into the renderer package so it
themes as one piece.

**No shadcn default palette ships.** Its semantic variables (`--background`,
`--primary`, `--border`, …) are declared _inside_ `.archidea-sequence` purely in
terms of `--seq-*` tokens, and its neutral `:root` palette is never imported. A
utility like `bg-primary` therefore resolves to `--seq-accent` inside our
renderer and to nothing at all outside it.

**Tailwind ships without preflight.** Preflight is a global reset, and this is a
library that mounts inside someone else's page. `theme.css` imports the theme and
utility layers only. `shadcn-cli.css` exists solely to satisfy the shadcn CLI's
validator, which demands a literal `@import "tailwindcss"`; it is never built.

A literal-union variable prompt renders as a visible `ToggleGroup` rather than a
dropdown: the options _are_ part of the explanation, and a viewer being walked
through should not have to open a popup to discover what the choices are.

Any control the active renderer cannot support is **disabled and visible**, never
hidden. `useRendererCapabilities` reports what the resolved renderer can do, and
the chrome reflects it. Hiding a control makes a capability difference look like
a missing feature.

## Writing

Sentence case everywhere. Buttons are verbs from the viewer's perspective —
"Next step", "Restart", not "Advance cursor". Nothing in the UI names an
implementation concept the viewer did not put there: they see values and paths,
not bindings and decisions.

## Checklist for a new renderer

- [ ] Every colour is a `--seq-*` token; `grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(' src` is clean
- [ ] Emphasis comes from the shared emphasis map, not local state
- [ ] Both light and dark themes define the full token set
- [ ] Skipped content is shown as skipped, with a way back to the decision
- [ ] Layout is stable across steps; only emphasis animates
- [ ] `prefers-reduced-motion` is honoured
- [ ] Unsupported controls are disabled, not hidden
- [ ] Text contrast clears AA in every shipped theme
