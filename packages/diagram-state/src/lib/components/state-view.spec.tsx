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
      await user.click(screen.getAllByRole('button', { name: /one|two|three/ })[0]!);
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

describe('following the track as it grows', () => {
  it('scrolls to the right end whenever the run moves', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={LINE} id="d" />);

    const track = container.querySelector('.state-view') as HTMLElement;
    // jsdom has no layout, so stand in for a track wider than its viewport.
    Object.defineProperty(track, 'scrollWidth', { value: 2000, configurable: true });
    const scrolled: number[] = [];
    track.scrollTo = ((options: ScrollToOptions) =>
      scrolled.push(options.left ?? 0)) as HTMLElement['scrollTo'];

    await user.click(screen.getAllByRole('button', { name: /one/ })[0]!);
    expect(scrolled.at(-1)).toBe(2000);

    // Going back shortens the run, and its end is what you returned to.
    await user.click(screen.getByTitle('Go back to A'));
    expect(scrolled.at(-1)).toBe(2000);
  });

  it('does not throw where scrollTo is unavailable', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={LINE} id="d" />);
    const track = container.querySelector('.state-view') as HTMLElement;

    // @ts-expect-error deliberately removing the API to prove the fallback runs.
    track.scrollTo = undefined;

    await expect(
      user.click(screen.getAllByRole('button', { name: /one/ })[0]!),
    ).resolves.not.toThrow();
  });
});
