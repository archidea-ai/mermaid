import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateDiagramSurface } from './surface';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg></svg>' })),
    parse: vi.fn(),
    detectType: vi.fn(() => 'stateDiagram-v2'),
    run: vi.fn(),
    contentLoaded: vi.fn(),
    registerExternalDiagrams: vi.fn(),
    registerIconPacks: vi.fn(),
    registerLayoutLoaders: vi.fn(),
    startOnLoad: false,
    mermaidAPI: {},
  },
}));

const LINE = 'stateDiagram-v2\n[*] --> A\nA --> B: one\nB --> C: two\nC --> D: three';

const current = (container: HTMLElement) =>
  container.querySelector('[data-state="sending"]')?.textContent;

const past = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-state="resting"]')].map((el) => el.textContent);

describe('clicking a history state', () => {
  const walk = async (user: ReturnType<typeof userEvent.setup>, times: number) => {
    for (let i = 0; i < times; i += 1) {
      await user.click(document.querySelector('.state-option') as HTMLElement);
    }
  };

  it('shows where the run has been, to the left of where it is', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={LINE} id="d" />);

    expect(past(container)).toEqual([]);
    await walk(user, 2);

    expect(current(container)).toBe('C');
    expect(past(container)).toEqual(['A', 'B']);
  });

  it('rewinds to a past state when it is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={LINE} id="d" />);
    await walk(user, 3);
    expect(current(container)).toBe('D');

    // A past state is somewhere you can return to, so it is a control.
    await user.click(screen.getByTitle('Go back to A'));

    expect(current(container)).toBe('A');
    // And the history shortens to match: nothing after A has happened yet.
    expect(past(container)).toEqual([]);
  });

  it('rewinds to the middle of the run, not only to the start', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={LINE} id="d" />);
    await walk(user, 3);

    await user.click(screen.getByTitle('Go back to B'));

    expect(current(container)).toBe('B');
    expect(past(container)).toEqual(['A']);
  });
});

// Scrolling is not asserted here on purpose: jsdom defines scrollTo as a no-op
// and implements no layout, so neither the smooth path nor the scrollLeft
// fallback is observable. The browser suite covers it.

describe('connections between history states', () => {
  const LABELLED = 'stateDiagram-v2\n[*] --> A\nA --> B: one\nB --> C: two';

  const click = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(document.querySelector('.state-option') as HTMLElement);

  it('joins each state to the next with the transition that got there', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={LABELLED} id="d" />);

    // Nothing has happened, so there is nothing to join.
    expect(container.querySelectorAll('.state-link')).toHaveLength(0);

    await click(user);
    expect([...container.querySelectorAll('.state-link')].map((el) => el.textContent)).toEqual([
      'one',
    ]);

    await click(user);
    expect([...container.querySelectorAll('.state-link')].map((el) => el.textContent)).toEqual([
      'one',
      'two',
    ]);
  });

  it('draws no line into the state the run began at', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={LABELLED} id="d" />);
    await click(user);

    // One line for one step: the first state was not arrived at.
    expect(container.querySelectorAll('.state-link')).toHaveLength(1);
    expect(container.querySelectorAll('.state-chip')).toHaveLength(2);
  });

  it('leaves the line unlabelled when the transition has nothing to say', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StateDiagramSurface text={'stateDiagram-v2\n[*] --> A\nA --> B'} id="d" />,
    );
    await click(user);

    // The connection is still drawn — it is the label that is absent.
    const links = container.querySelectorAll('.state-link');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('data-labelled')).toBe('false');
    expect(links[0]!.textContent).toBe('');
  });
});

describe('a note on the state you are in', () => {
  const NOTED = 'stateDiagram-v2\n[*] --> A\nA --> B: one\nnote right of A: mind the gap';

  it('shows it under the name, and only while the run is there', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={NOTED} id="d" />);

    expect(container.querySelector('.state-chip__note')?.textContent).toBe('mind the gap');

    // Stepping on turns A into history, and the aside was about being in A.
    await user.click(document.querySelector('.state-option') as HTMLElement);
    expect(container.querySelector('.state-chip__note')).toBeNull();
  });
});

describe('finishing a composite', () => {
  const COMPLETES = [
    'stateDiagram-v2',
    '[*] --> Queued',
    'Queued --> Work: pick up',
    'state Work {',
    '[*] --> Doing',
    'Doing --> [*]: finish',
    '}',
    'Work --> Done',
    'Done --> [*]',
  ].join('\n');

  const click = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(screen.getByRole('button', { name: new RegExp(name) }));

  it('carries the run out of the container without stopping on its end', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={COMPLETES} id="d" />);

    await click(user, 'pick up');
    expect(current(container)).toBe('Doing');

    // `Work --> Done` is unlabelled and the only way out, so finishing Work is
    // the whole move — the container's end is passed through, not stood on.
    await click(user, 'finish');
    expect(current(container)).toBe('Done');
    expect(past(container)).toEqual(['Queued', 'Doing', 'End of Work']);
  });

  it('still offers a labelled escape at a container end rather than firing it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StateDiagramSurface text={`${COMPLETES}\nWork --> Cancelled: abort`} id="d" />,
    );

    await click(user, 'pick up');
    await click(user, 'finish');

    // Two ways out now, so finishing Work decides nothing on its own.
    expect(current(container)).toBe('End of Work');
    // Both leave Work, and both say so.
    expect([...container.querySelectorAll('.state-option')].map((el) => el.textContent)).toEqual([
      'leaves WorkDone',
      'abortleaves WorkCancelled',
    ]);
  });

  it('steps back over the completion, not into the middle of it', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={COMPLETES} id="d" />);

    await click(user, 'pick up');
    await click(user, 'finish');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(current(container)).toBe('Doing');
  });
});
