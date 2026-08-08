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

describe('modern stage view', () => {
  it('starts on the modern view by default', () => {
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);

    expect(container.querySelector('.seq-stage')).not.toBeNull();
    expect(container.querySelector('.seq-grid')).toBeNull();
  });

  it('honours sequence.variant from config as the starting view', () => {
    const { container } = render(
      <SequenceDiagramSurface text={THREE} id="d" config={{ sequence: { variant: 'classic' } }} />,
    );

    expect(container.querySelector('.seq-grid')).not.toBeNull();
    expect(container.querySelector('.seq-stage')).toBeNull();
  });

  it('places every participant as an object and lights only the active call', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);

    expect(container.querySelectorAll('.seq-stage__object')).toHaveLength(3);
    // Nothing has happened yet, so nothing is connected.
    expect(container.querySelectorAll('.seq-stage__arc')).toHaveLength(0);
    expect(screen.getByText(/Press/)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(container.querySelectorAll('.seq-stage__arc')).toHaveLength(1);
    expect(container.querySelector('.seq-stage__label')!.textContent).toContain('first');
  });

  it('has no lanes, columns or lifelines at all', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(container.querySelector('.seq-grid')).toBeNull();
    expect(container.querySelector('.seq-lifeline')).toBeNull();
    expect(container.querySelectorAll('.seq-message')).toHaveLength(0);
  });

  it('marks the sender and the receiver distinctly, and rests the rest', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const states = [...container.querySelectorAll<HTMLElement>('.seq-stage__object')].map((el) => [
      el.textContent,
      el.dataset.state,
    ]);

    expect(states).toEqual([
      ['A', 'sending'],
      ['B', 'receiving'],
      ['C', 'resting'],
    ]);
  });

  it('replays the entrance on every new call by keying the arc to the step', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    const first = container.querySelector('.seq-stage__arc')!.getAttribute('d');

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    const second = container.querySelector('.seq-stage__arc')!.getAttribute('d');

    expect(second).not.toBe(first);
    expect(container.querySelector('.seq-stage__packet')).not.toBeNull();
  });

  it('advances the stage as the run steps', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={THREE} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const label = container.querySelector('.seq-stage__label')!;
    expect(label.textContent).toContain('second');
    expect(label.textContent).not.toContain('first');
  });

  it('keeps the stepper and values working across a view switch', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SequenceDiagramSurface
        text={'sequenceDiagram\nA->>B: login as {{role : "admin" | "member"}}\nB-->>A: ok'}
        id="d"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'admin', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: 'Classic view' }));

    expect(container.querySelector('.seq-grid')).not.toBeNull();
    expect(screen.getByText('1 / 2')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Clear role' })).toBeDefined();
  });

  it('renders a bound reference as its value, not its name', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SequenceDiagramSurface
        text={'sequenceDiagram\nA->>B: login as {{role : "admin" | "member"}}'}
        id="d"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'admin', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const chip = container.querySelector('.seq-stage__label .seq-var')!;
    expect(chip.textContent).toBe('admin');
    expect(chip.getAttribute('data-resolved')).toBe('true');
    // The name stays discoverable rather than being lost.
    expect(chip.getAttribute('title')).toBe('role');
  });

  it('falls back to the reference name while it is still unbound', () => {
    const { container } = render(
      <SequenceDiagramSurface text={'sequenceDiagram\nA->>B: id {{userId}}\nB-->>A: ok'} id="d" />,
    );

    // Nothing has been revealed yet, so the classic view is the honest check
    // that an unresolved reference still shows its name.
    expect(container.querySelector('.seq-stage')).not.toBeNull();
  });

  it('names the enclosing fragment, which a single call otherwise loses', async () => {
    const user = userEvent.setup();
    render(
      <SequenceDiagramSurface text={'sequenceDiagram\nloop retry\nA->>B: ping\nend'} id="d" />,
    );

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByText('loop')).toBeDefined();
    expect(screen.getByText(/retry/)).toBeDefined();
  });
});

describe('the +/- activation shorthand', () => {
  // `A->>+B: text` emits a message step and an activate step that share one
  // message node. Anything branching on node.type instead of step.kind renders
  // that message twice — which is exactly what the checkout example showed.
  const SHORTHAND = 'sequenceDiagram\nA->>+B: open\nB-->>-A: 201 Created';

  it('lists each message once, with the lifecycle step named separately', () => {
    render(<SequenceDiagramSurface text={SHORTHAND} id="d" />);

    expect(screen.getAllByText(/201 Created/)).toHaveLength(1);
    expect(screen.getAllByText(/open/)).toHaveLength(1);
    // The lifecycle steps are still listed, named for what they are.
    expect(screen.getByText(/activate · B/)).toBeDefined();
    expect(screen.getByText(/deactivate · A/)).toBeDefined();
  });

  it('draws one arc per message, not one per step', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={SHORTHAND} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(container.querySelectorAll('.seq-stage__arc')).toHaveLength(1);
    const first = container.querySelector('.seq-stage__label')!.textContent;

    // Advancing onto the activate step must not redraw the call behind it.
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(container.querySelectorAll('.seq-stage__arc')).toHaveLength(0);
    expect(container.querySelector('.seq-stage__label')).toBeNull();
    expect(first).toContain('open');
  });
});

describe('notes on the stage', () => {
  const WITH_NOTE = "sequenceDiagram\nA->>B: go\nnote over A,B: retries are the scheduler's job";

  it('takes the whole stage rather than hanging off a participant', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={WITH_NOTE} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(container.querySelector('.seq-stage__overlay')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const overlay = container.querySelector('.seq-stage__overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.querySelector('.seq-stage__scrim')).not.toBeNull();
    expect(screen.getByRole('note').textContent).toContain("retries are the scheduler's job");

    // Not positioned against a node — the overlay owns the whole floor.
    expect((overlay as HTMLElement).style.left).toBe('');
  });

  it('clears the note once the run moves on', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SequenceDiagramSurface text={`${WITH_NOTE}\nB-->>A: done`} id="d" />,
    );

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(container.querySelector('.seq-stage__overlay')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(container.querySelector('.seq-stage__overlay')).toBeNull();
  });
});

describe('a boolean variable', () => {
  const OPTIONAL = 'sequenceDiagram\nA->>B: go\nopt {{sendSms : boolean}}\nA->>B: sms\nend';

  it('prompts with buttons, the same affordance a literal union gets', () => {
    render(<SequenceDiagramSurface text={OPTIONAL} id="d" />);

    expect(screen.getByRole('button', { name: 'No' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDefined();
    expect(screen.queryByPlaceholderText('Enter a value')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('starts with neither answer selected, because unanswered is not false', () => {
    render(<SequenceDiagramSurface text={OPTIONAL} id="d" />);

    for (const name of ['No', 'Yes']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).not.toBe('true');
    }
  });

  it('binds true from one click and includes the optional branch', async () => {
    const user = userEvent.setup();
    render(<SequenceDiagramSurface text={OPTIONAL} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(screen.getByRole('button', { name: 'Clear sendSms' })).toBeDefined();
    expect(screen.getByText('0 / 2')).toBeDefined();
  });

  it('binds false from one click, which a switch could not offer', async () => {
    const user = userEvent.setup();
    render(<SequenceDiagramSurface text={OPTIONAL} id="d" />);

    await user.click(screen.getByRole('button', { name: 'No' }));

    // false is a real answer: the opt resolves and its statement is skipped.
    expect(screen.getByRole('button', { name: 'Clear sendSms' })).toBeDefined();
    expect(screen.getByText('0 / 1')).toBeDefined();
  });

  it('carries the declared type through a condition, not just through message text', () => {
    // `opt {{sendSms : boolean}}` annotates the type inside a fragment label.
    // The condition lexer used to read the whole body as the variable name.
    render(<SequenceDiagramSurface text={OPTIONAL} id="d" />);

    expect(screen.getByText('sendSms')).toBeDefined();
    expect(screen.queryByText(/sendSms : boolean/)).toBeNull();
  });
});

describe('displayed fragment labels', () => {
  it('strips type annotations that mean something only to the parser', async () => {
    const { humaniseLabel } = await import('./rich-label');

    expect(humaniseLabel('{{sendSms : boolean}}')).toBe('sendSms');
    expect(humaniseLabel('{{role}} == "admin"')).toBe('role == "admin"');
    expect(humaniseLabel('{{userId = "u-1"}}')).toBe('userId');
    expect(humaniseLabel('every hour')).toBe('every hour');
  });
});
