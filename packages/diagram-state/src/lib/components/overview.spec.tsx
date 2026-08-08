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

const MACHINE = `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Approved: accept
  Review --> Rejected: decline
  Approved --> Live: ship
  Rejected --> Draft: revise`;

const show = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Overview' }));

const columns = (container: HTMLElement) =>
  [...container.querySelectorAll('.state-overview__column')].map((column) => [
    column.querySelector('.state-overview__heading')?.textContent,
    [...column.querySelectorAll('.state-chip')].map((chip) => chip.textContent),
  ]);

describe('the two views', () => {
  it('opens on the interactive journey', () => {
    const { container } = render(<StateDiagramSurface text={MACHINE} id="d" />);

    expect(container.querySelector('.state-track')).not.toBeNull();
    expect(container.querySelector('.state-overview')).toBeNull();
  });

  it('swaps to the overview and back from the toggle', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={MACHINE} id="d" />);

    await show(user);
    expect(container.querySelector('.state-overview')).not.toBeNull();
    expect(container.querySelector('.state-track')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Interactive journey' }));
    expect(container.querySelector('.state-track')).not.toBeNull();
  });
});

describe('<StateOverview />', () => {
  it('opens on the state the machine starts at, with the whole machine around it', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={MACHINE} id="d" />);
    await show(user);

    // Rejected leads back here through `revise` and also follows from Review,
    // so it stands on both sides — each sweep is run without the other.
    expect(columns(container)).toEqual([
      ['2 back', ['Review']],
      ['1 back', ['Rejected']],
      ['Active', ['Draft']],
      ['1 ahead', ['Review']],
      ['2 ahead', ['Approved', 'Rejected']],
      ['3 ahead', ['Live']],
    ]);
  });

  it('re-centres on whichever state is activated', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={MACHINE} id="d" />);
    await show(user);

    // Review stands on both sides here, so either copy is the same state.
    await user.click(screen.getAllByRole('button', { name: 'Review' })[0]!);

    const active = container.querySelector('.state-overview__column[data-role="active"]');
    expect(active?.textContent).toContain('Review');
    // Once active it is at the centre and nowhere else, so it is pressed once.
    expect(screen.getByRole('button', { name: 'Review', pressed: true })).toBeDefined();
  });

  it('draws a line per transition, and names the ones that have a name', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={MACHINE} id="d" />);
    await show(user);

    // jsdom lays nothing out, so the paths' geometry is meaningless here — but
    // their count and their labels prove which transitions the chart drew.
    // The browser suite covers where the lines actually land.
    expect(container.querySelectorAll('.state-line')).toHaveLength(6);
    expect(
      [...container.querySelectorAll('.state-overview__edge-label')].map((el) => el.textContent),
    ).toEqual(['submit', 'accept', 'decline', 'ship', 'revise', 'decline']);
  });

  it('lights the route back to the active state when one is pointed at', async () => {
    const user = userEvent.setup();
    const { container } = render(<StateDiagramSurface text={MACHINE} id="d" />);
    await show(user);

    const lit = () =>
      [...container.querySelectorAll('.state-chip[data-lit="true"]')].map((el) => el.textContent);

    expect(container.querySelector('.state-overview')).toHaveProperty('dataset.tracing', 'false');

    // Live is three columns out. Pointing at it asks how you would get there.
    await user.hover(screen.getByRole('button', { name: 'Live' }));

    expect(container.querySelector('.state-overview')).toHaveProperty('dataset.tracing', 'true');
    expect(lit()).toEqual(['Draft', 'Review', 'Approved', 'Live']);
    expect(container.querySelectorAll('.state-line[data-lit="true"]')).toHaveLength(3);

    await user.unhover(screen.getByRole('button', { name: 'Live' }));
    expect(lit()).toEqual([]);
  });

  it('shows the active state its own note, and no other state theirs', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StateDiagramSurface
        text={`${MACHINE}\n  note right of Draft: not sent yet\n  note right of Review: a human reads it`}
        id="d"
      />,
    );
    await show(user);

    const notes = () =>
      [...container.querySelectorAll('.state-chip__note')].map((el) => el.textContent);

    // Draft is active, and Review is on the chart twice — neither copy shows.
    expect(notes()).toEqual(['not sent yet']);

    await user.click(screen.getAllByRole('button', { name: 'Review' })[0]!);
    expect(notes()).toEqual(['a human reads it']);
  });

  it('keeps a state inside the container it belongs to', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StateDiagramSurface
        text={
          'stateDiagram-v2\n[*] --> Idle\nIdle --> Work: start\nstate Work {\n[*] --> Doing\nDoing --> Checking: check\n}'
        }
        id="d"
      />,
    );
    await show(user);

    const box = container.querySelector('.state-box');
    expect(box?.getAttribute('aria-label')).toBe('Work');
    expect(box?.textContent).toContain('Doing');
  });
});
