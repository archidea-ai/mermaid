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

    // Endpoints come from the DOM, and jsdom measures everything as zero — so
    // this pins that the arc is re-created per step, not where it is drawn.
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    const first = container.querySelector('.seq-stage__label')!.textContent;

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    const second = container.querySelector('.seq-stage__label')!.textContent;

    expect(second).not.toBe(first);
    expect(container.querySelector('.seq-stage__packet')).not.toBeNull();
    expect(container.querySelectorAll('.seq-stage__arc')).toHaveLength(1);
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
  // Three participants with the note over two of them. A note spanning the
  // *whole* cast is a phase banner instead, covered separately below.
  const WITH_NOTE =
    "sequenceDiagram\nA->>B: go\nA->>C: also\nnote over A,B: retries are the scheduler's job";

  it('takes the whole stage rather than hanging off a participant', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={WITH_NOTE} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(container.querySelector('.seq-stage__overlay')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next step' }));
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

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next step' }));
    }
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

describe('a type declared once, prompted elsewhere', () => {
  // The type is annotated in the message; the prompt is raised by the condition,
  // which only reads `{{kind}}`. Without carrying the type across, a two-option
  // choice rendered as a free-text box.
  const SPLIT = `sequenceDiagram
    A->>B: lookup({{kind : "external" | "internal"}})
    alt {{kind}} == "external"
      A->>B: external path
    else
      A->>B: internal path
    end`;

  it('offers the declared options rather than a free-text field', () => {
    render(<SequenceDiagramSurface text={SPLIT} id="d" />);

    expect(screen.getByRole('button', { name: 'external' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'internal' })).toBeDefined();
    expect(screen.queryByPlaceholderText('Enter a value')).toBeNull();
  });

  it('resolves the branch once the option is chosen', async () => {
    const user = userEvent.setup();
    render(<SequenceDiagramSurface text={SPLIT} id="d" />);

    await user.click(screen.getByRole('button', { name: 'external' }));

    expect(screen.queryByText('Choose a path')).toBeNull();
    expect(screen.getByText('0 / 2')).toBeDefined();
  });
});

describe('participants shown in their declared groups', () => {
  const GROUPED = `sequenceDiagram
    box rgb(225, 240, 255) Client side
      actor User
      actor Agent
    end
    box rgb(225, 245, 230) Platform
      participant Portal
      participant Store
    end
    Note over User,Store: Phase 1 - Intake
    User->>Portal: submit()
    Portal->>Store: persist()`;

  it("renders one panel per box, holding that box's members", () => {
    const { container } = render(<SequenceDiagramSurface text={GROUPED} id="d" />);
    const groups = [...container.querySelectorAll('.seq-stage__group')];

    expect(groups).toHaveLength(2);
    expect(groups[0]!.querySelector('.seq-stage__group-title')!.textContent).toBe('Client side');
    expect(
      [...groups[0]!.querySelectorAll('.seq-stage__object')].map((e) => e.textContent),
    ).toEqual(['User', 'Agent']);
    expect(
      [...groups[1]!.querySelectorAll('.seq-stage__object')].map((e) => e.textContent),
    ).toEqual(['Portal', 'Store']);
  });

  it('brings the group holding the current call forward', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={GROUPED} id="d" />);

    // Step past the phase banner onto the first call.
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const active = [...container.querySelectorAll<HTMLElement>('.seq-stage__group')].map(
      (el) => el.dataset.active,
    );
    expect(active).toEqual(['true', 'true']);
  });

  it('renders a note spanning the whole cast as a banner, not an overlay', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={GROUPED} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    const banner = container.querySelector('.seq-stage__banner');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('Phase 1 - Intake');
    // A heading for the run, not a sticky note demanding dismissal.
    expect(container.querySelector('.seq-stage__overlay')).toBeNull();
    expect(banner!.getAttribute('role')).toBe('heading');
  });

  it('groups participants declared outside any box together', () => {
    const { container } = render(
      <SequenceDiagramSurface text={'sequenceDiagram\nA->>B: x'} id="d" />,
    );

    const groups = container.querySelectorAll('.seq-stage__group');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.querySelector('.seq-stage__group-title')).toBeNull();
  });
});

describe('the step list', () => {
  // 30 steps, well past the panel's height.
  const LONG = `sequenceDiagram\n${Array.from({ length: 30 }, (_, i) => `A->>B: step ${i + 1}`).join('\n')}\nopt {{extra : boolean}}\nA->>B: optional\nend`;

  it('scrolls rather than spilling over what follows it', () => {
    const { container } = render(<SequenceDiagramSurface text={LONG} id="d" />);
    const list = container.querySelector('.seq-steps') as HTMLElement;

    expect(list).not.toBeNull();
    // A container with a max height and no overflow rule spills visibly, which
    // is what pushed the step list over the SKIPPED section.
    expect(list.className).toContain('overflow-y-auto');
    expect(list.className).toContain('max-h-64');
  });

  it('keeps the skipped section as a sibling below the scroll container', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={LONG} id="d" />);

    await user.click(screen.getByRole('button', { name: 'No' }));

    const list = container.querySelector('.seq-steps')!;
    const skipped = screen.getByText('Skipped');
    expect(list.contains(skipped)).toBe(false);
    expect(list.compareDocumentPosition(skipped) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('a phase banner', () => {
  const PHASES = `sequenceDiagram
    participant A
    participant B
    Note over A,B: Phase 1 - Intake
    A->>B: one
    B->>A: two
    Note over A,B: Phase 2 - Review
    A->>B: three
    note over A: just A
    A->>B: four`;

  const banner = (container: HTMLElement) =>
    container.querySelector('.seq-stage__banner')?.textContent ?? null;

  const step = async (user: ReturnType<typeof userEvent.setup>, times: number) => {
    for (let i = 0; i < times; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next step' }));
    }
  };

  it('stays up for every step of its phase, not just the step it lands on', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={PHASES} id="d" />);

    expect(banner(container)).toBeNull();

    await step(user, 1); // the phase note itself
    expect(banner(container)).toContain('Phase 1');

    await step(user, 1); // first message of the phase
    expect(banner(container)).toContain('Phase 1');

    await step(user, 1); // second message — still phase 1
    expect(banner(container)).toContain('Phase 1');
  });

  it('is replaced by the next phase, not stacked with it', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={PHASES} id="d" />);

    await step(user, 4); // through to the Phase 2 note
    expect(banner(container)).toContain('Phase 2');
    expect(banner(container)).not.toContain('Phase 1');
    expect(container.querySelectorAll('.seq-stage__banner')).toHaveLength(1);
  });

  it('survives an ordinary note appearing mid-phase', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={PHASES} id="d" />);

    await step(user, 6); // the `note over A` aside inside phase 2

    expect(container.querySelector('.seq-stage__overlay')).not.toBeNull();
    expect(banner(container)).toContain('Phase 2');
  });

  it('clears when the run is restarted', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={PHASES} id="d" />);

    await step(user, 3);
    expect(banner(container)).toContain('Phase 1');

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(banner(container)).toBeNull();
  });
});

describe('attention when the run stops and starts again', () => {
  const ASKS = 'sequenceDiagram\nA->>B: go as {{role : "admin" | "member"}}\nB-->>A: ok';

  it('focuses the field the run is waiting on', () => {
    render(<SequenceDiagramSurface text={ASKS} id="d" />);

    // The run has stopped for this value, so the cursor belongs where the
    // answer goes rather than wherever it happened to be.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'admin' }));
  });

  it('focuses a free-text field the same way', () => {
    render(<SequenceDiagramSurface text={'sequenceDiagram\nA->>B: id {{ref : string}}'} id="d" />);

    expect(document.activeElement).toBe(screen.getByPlaceholderText('Enter a value'));
  });

  it('marks a newly required field so it can announce itself', () => {
    const { container } = render(<SequenceDiagramSurface text={ASKS} id="d" />);

    expect(container.querySelector('.seq-prompt')?.getAttribute('data-fresh')).toBe('true');
  });

  it('flags the next button when answering unblocks the run', async () => {
    const user = userEvent.setup();
    const { container } = render(<SequenceDiagramSurface text={ASKS} id="d" />);

    const next = () => container.querySelector('.seq-next') as HTMLElement;
    expect(next().dataset.unblocked).toBe('false');
    expect(next()).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('button', { name: 'admin' }));

    // Answering un-blocks the run somewhere else on screen; the button says so
    // rather than just quietly stopping being grey.
    expect(next()).toHaveProperty('disabled', false);
    expect(next().dataset.unblocked).toBe('true');
  });

  it('does not flag the button on an ordinary step, only on becoming unblocked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SequenceDiagramSurface text={'sequenceDiagram\nA->>B: one\nB->>A: two'} id="d" />,
    );

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect((container.querySelector('.seq-next') as HTMLElement).dataset.unblocked).toBe('false');
  });
});
