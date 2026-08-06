import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SequenceDiagramSurface } from './surface';
import { sequenceRenderer } from '../renderer';

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

const LOGIN = `sequenceDiagram
    actor User
    participant API
    User->>API: POST /login as {{role : "admin" | "member"}}
    API-->>User: {{userId = "u-1"}}
    alt {{role}} == "admin"
      API->>User: audit log
    else
      API->>User: 200 OK
    end`;

describe('sequenceRenderer', () => {
  it('claims the sequence type and declares stepping', () => {
    expect(sequenceRenderer.id).toBe('sequence-react');
    expect(sequenceRenderer.supports('sequence')).toBe(true);
    expect(sequenceRenderer.supports('flowchart-v2')).toBe(false);
    expect(sequenceRenderer.capabilities.step).toBe(true);
    expect(sequenceRenderer.Component).toBe(SequenceDiagramSurface);
  });

  it('renders markup for the imperative path without a browser', async () => {
    const result = await sequenceRenderer.renderToSvg({
      id: 'd',
      text: 'sequenceDiagram\nA->>B: hi',
    });

    expect(result.diagramType).toBe('sequence');
    expect(result.svg).toContain('archidea-sequence');
  });
});

describe('<SequenceDiagramSurface />', () => {
  it('hands back a live step controller whose count matches the timeline', async () => {
    const onStepController = vi.fn();
    render(
      <SequenceDiagramSurface
        text={'sequenceDiagram\nA->>B: x'}
        id="d"
        onStepController={onStepController}
      />,
    );

    await waitFor(() => expect(onStepController).toHaveBeenCalled());
    const controller = onStepController.mock.calls.at(-1)![0];
    expect(controller).not.toBeNull();
    expect(controller.current).toBe(-1);
    expect(typeof controller.next).toBe('function');
  });

  it('renders participants and steps through messages, highlighting as it goes', async () => {
    const user = userEvent.setup();
    render(<SequenceDiagramSurface text={'sequenceDiagram\nA->>B: first\nB->>A: second'} id="d" />);

    expect(screen.getByText('A')).toBeDefined();
    // The label appears on the canvas arrow and again in the sidebar step list.
    expect(screen.getAllByText('first')).toHaveLength(2);
    expect(screen.getByText('0 / 2')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('1 / 2')).toBeDefined();
  });

  it('blocks advancing until an unbound variable is supplied, then continues', async () => {
    const user = userEvent.setup();
    render(<SequenceDiagramSurface text={LOGIN} id="d" />);

    expect(screen.getByRole('button', { name: 'Next step' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Waiting for a value')).toBeDefined();

    await user.selectOptions(screen.getByRole('combobox'), 'admin');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next step' })).toHaveProperty('disabled', false),
    );
  });

  it('resolves the alt branch from the supplied value with no branch prompt', async () => {
    const user = userEvent.setup();
    render(<SequenceDiagramSurface text={LOGIN} id="d" />);

    await user.selectOptions(screen.getByRole('combobox'), 'admin');

    await waitFor(() => expect(screen.getAllByText('audit log').length).toBeGreaterThan(0));
    expect(screen.queryByText('Choose a path')).toBeNull();
    // The else branch was resolved away, so it is skipped rather than rendered.
    expect(screen.queryByText('200 OK')).toBeNull();
  });

  it('shows a bound value in the sidebar once its step is reached', async () => {
    const user = userEvent.setup();
    render(<SequenceDiagramSurface text={LOGIN} id="d" />);

    await user.selectOptions(screen.getByRole('combobox'), 'member');
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    await user.click(screen.getByRole('button', { name: 'Next step' }));

    await waitFor(() => expect(screen.getByText('u-1')).toBeDefined());
  });

  it('asks the viewer to choose when branch labels are prose', async () => {
    render(
      <SequenceDiagramSurface
        text={'sequenceDiagram\nalt logged in\nA->>B: x\nelse anonymous\nA->>B: y\nend'}
        id="d"
      />,
    );

    expect(screen.getByText('Choose a path')).toBeDefined();
    expect(screen.getByRole('button', { name: 'logged in' })).toBeDefined();
  });

  it('falls back to the proxy for a diagram it cannot parse, reporting it as non-fatal', async () => {
    const onError = vi.fn();
    const onStepController = vi.fn();

    render(
      <SequenceDiagramSurface
        text={'sequenceDiagram\nalt unclosed\nA->>B: x'}
        id="d"
        onError={onError}
        onStepController={onStepController}
      />,
    );

    expect(await screen.findByTestId('proxy-svg')).toBeDefined();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'DIAGRAM_PARSE_ERROR' }));
    expect(onStepController).toHaveBeenCalledWith(null);
  });
});
