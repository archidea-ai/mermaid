import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SequenceDiagramSurface } from './surface';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-testid="proxy-svg"></svg>' })),
    parse: vi.fn(),
    detectType: vi.fn(() => 'sequence'),
    run: vi.fn(),
    contentLoaded: vi.fn(),
    registerExternalDiagrams: vi.fn(),
    registerIconPacks: vi.fn(),
    registerLayoutLoaders: vi.fn(),
    startOnLoad: false,
    mermaidAPI: {},
  },
}));

const THREE = 'sequenceDiagram\nA->>B: first\nB->>C: second\nC->>A: third';

const toModern = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Modern view' }));

describe('modern spotlight view', () => {
  it('starts on the classic view, so existing behaviour is unchanged', () => {
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);

    expect(container.querySelector('.seq-grid')).not.toBeNull();
    expect(container.querySelector('.seq-spotlight')).toBeNull();
  });

  it('honours sequence.variant from config as the starting view', () => {
    const { container } = render(
      <SequenceDiagramSurface text={THREE} id="d" config={{ sequence: { variant: 'modern' } }} />,
    );

    expect(container.querySelector('.seq-spotlight')).not.toBeNull();
    expect(container.querySelector('.seq-grid')).toBeNull();
  });

  it('shows every participant but only the active call', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);
    await toModern(user);

    // All three participants stay pinned across the top.
    expect(container.querySelectorAll('.seq-spotlight .seq-participant')).toHaveLength(3);
    // Nothing has happened yet, so no call is drawn.
    expect(container.querySelectorAll('.seq-spotlight .seq-message')).toHaveLength(0);
    expect(screen.getByText(/Press/)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const messages = container.querySelectorAll('.seq-spotlight .seq-message');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.textContent).toContain('first');
  });

  it('recedes the participants not involved in the current step', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);
    await toModern(user);
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const state = [
      ...container.querySelectorAll<HTMLElement>('.seq-spotlight .seq-participant'),
    ].map((el) => [el.textContent, el.dataset.dimmed]);

    expect(state).toEqual([
      ['A', 'false'],
      ['B', 'false'],
      ['C', 'true'],
    ]);
  });

  it('advances the spotlight as the run steps', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);
    await toModern(user);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const message = container.querySelector('.seq-spotlight .seq-message')!;
    expect(message.textContent).toContain('second');
    expect(message.textContent).not.toContain('first');
  });

  it('keeps the stepper and variables working across a view switch', async () => {
    const user = userEvent.setup();
    render(
      <SequenceDiagramSurface
        text={'sequenceDiagram\nA->>B: login as {{role : "admin" | "member"}}\nB-->>A: ok'}
        id="d"
      />,
    );

    // Bind in classic, switch to modern, and the run state survives.
    await user.click(screen.getByRole('button', { name: 'admin', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await toModern(user);

    expect(screen.getByText('1 / 2')).toBeDefined();
    expect(screen.getByText('admin')).toBeDefined();
  });

  it('names the enclosing fragment, which a single call otherwise loses', async () => {
    const user = userEvent.setup();
    render(
      <SequenceDiagramSurface text={'sequenceDiagram\nloop retry\nA->>B: ping\nend'} id="d" />,
    );

    await toModern(user);
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByText('loop')).toBeDefined();
    expect(screen.getByText(/retry/)).toBeDefined();
  });
});
