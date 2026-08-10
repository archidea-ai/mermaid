import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlowchartSurface } from './surface';
import { flowchartRenderer } from '../renderer';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-testid="proxy-svg"></svg>' })),
    parse: vi.fn(),
    detectType: vi.fn(() => 'flowchart-v2'),
    run: vi.fn(),
    contentLoaded: vi.fn(),
    registerExternalDiagrams: vi.fn(),
    registerIconPacks: vi.fn(),
    registerLayoutLoaders: vi.fn(),
    startOnLoad: false,
    mermaidAPI: {},
  },
}));

const PIPELINE = `flowchart LR
  Commit([Commit pushed]) --> Lint[Lint and typecheck]
  Lint --> Unit[Unit tests]
  subgraph gates [Quality gates]
    Unit --> Coverage{Coverage ok?}
    Coverage -- no --> Fail[Report and stop]
    Coverage -- yes --> Bundle[Build bundle]
  end
  Bundle --> Ship[(Publish)]`;

const lit = (container: HTMLElement) =>
  [...container.querySelectorAll('.flow-node[data-lit="true"]')].map((el) => el.textContent);

describe('flowchartRenderer', () => {
  it('claims the flowchart type under each of its spellings', () => {
    expect(flowchartRenderer.id).toBe('flowchart-react');
    expect(flowchartRenderer.supports('flowchart')).toBe(true);
    expect(flowchartRenderer.supports('flowchart-v2')).toBe(true);
    expect(flowchartRenderer.supports('graph')).toBe(true);
    expect(flowchartRenderer.supports('sequence')).toBe(false);
  });

  it('claims no stepping, because a chart is a map rather than a run', () => {
    expect(flowchartRenderer.capabilities).toEqual({ events: true, viewport: false, step: false });
  });

  it('delegates the imperative path to upstream, keeping render() portable', async () => {
    const result = await flowchartRenderer.renderToSvg({ id: 'd', text: 'flowchart LR\nA --> B' });
    expect(result.svg).toBe('<svg data-testid="proxy-svg"></svg>');
  });
});

describe('<FlowchartSurface />', () => {
  it('draws the chart in columns, with no view selector to choose between', () => {
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);

    expect(container.querySelectorAll('.flow-column').length).toBeGreaterThan(1);
    // One view means nothing to switch: a chooser with a single option is chrome.
    expect(screen.queryByRole('button', { name: /Overview/ })).toBeNull();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('hands back no step controller, since there is nothing to step', async () => {
    const onStepController = vi.fn();
    render(<FlowchartSurface text={PIPELINE} id="d" onStepController={onStepController} />);

    await waitFor(() => expect(onStepController).toHaveBeenCalledWith(null));
  });

  it('keeps the shape the author drew, because it carries the meaning', () => {
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);
    const shapes = [...container.querySelectorAll('.flow-node')].map((el) =>
      el.getAttribute('data-shape'),
    );

    expect(shapes).toEqual(['stadium', 'rect', 'rect', 'diamond', 'rect', 'rect', 'cylinder']);
  });

  it('keeps a node inside the subgraph that declared it', () => {
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);
    const box = container.querySelector('.flow-group');

    expect(box?.getAttribute('aria-label')).toBe('Quality gates');
    expect(box?.textContent).toContain('Coverage ok?');
  });

  it('lights a node and its neighbours when it is clicked, and nothing before', async () => {
    const user = userEvent.setup();
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);

    expect(container.querySelector('.flow-chart')).toHaveProperty('dataset.selecting', 'false');
    expect(lit(container)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Coverage ok?' }));

    expect(container.querySelector('.flow-chart')).toHaveProperty('dataset.selecting', 'true');
    expect(lit(container)).toEqual([
      'Unit tests',
      'Coverage ok?',
      'Report and stop',
      'Build bundle',
    ]);
  });

  it('lights the edges to those neighbours, and only those', async () => {
    const user = userEvent.setup();
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);
    await user.click(screen.getByRole('button', { name: 'Coverage ok?' }));

    // Three edges touch Coverage; the chart has six in all.
    expect(container.querySelectorAll('.flow-edge')).toHaveLength(6);
    expect(container.querySelectorAll('.flow-edge[data-lit="true"]')).toHaveLength(3);

    // A lit edge's label is lit with it, or the highlight says nothing.
    expect(
      [...container.querySelectorAll('.flow-edge__label[data-lit="true"]')].map(
        (el) => el.textContent,
      ),
    ).toEqual(['no', 'yes']);
  });

  it('clears the selection when the chosen node is clicked again', async () => {
    const user = userEvent.setup();
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Coverage ok?' }));
    await user.click(screen.getByRole('button', { name: 'Coverage ok?' }));

    expect(container.querySelector('.flow-chart')).toHaveProperty('dataset.selecting', 'false');
    expect(lit(container)).toEqual([]);
  });

  it('marks the chosen node apart from the neighbours it lit up', async () => {
    const user = userEvent.setup();
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);
    await user.click(screen.getByRole('button', { name: 'Coverage ok?' }));

    const chosen = container.querySelectorAll('.flow-node[data-selected="true"]');
    expect(chosen).toHaveLength(1);
    expect(chosen[0]!.textContent).toBe('Coverage ok?');
  });

  it('caps every edge with the head its arrow was drawn with', () => {
    const { container } = render(
      <FlowchartSurface text={'flowchart LR\nA --> B\nB --o C\nC --x D\nD --- E'} id="d" />,
    );
    const edges = [...container.querySelectorAll('.flow-edge')];

    expect(edges.map((edge) => edge.getAttribute('data-head'))).toEqual([
      'arrow',
      'circle',
      'cross',
      'none',
    ]);

    // A head is a marker on the path; an undirected link is capped with nothing.
    expect(edges.map((edge) => edge.getAttribute('marker-end'))).toEqual([
      'url(#flow-d-arrow)',
      'url(#flow-d-circle)',
      'url(#flow-d-cross)',
      null,
    ]);
    expect(container.querySelectorAll('marker')).toHaveLength(3);
  });

  it('scopes its markers to the diagram, so two charts on a page do not share them', () => {
    const { container } = render(<FlowchartSurface text={'flowchart LR\nA --> B'} id="second" />);
    expect(container.querySelector('marker')!.id).toBe('flow-second-arrow');
  });

  it('lays a chart out the way it was written', () => {
    const across = render(<FlowchartSurface text={'flowchart LR\nA --> B'} id="a" />);
    expect(across.container.querySelector('.flow-chart')).toHaveProperty('dataset.direction', 'LR');

    // `flowchart TD` is the commonest form there is, and drawing it left to
    // right contradicts the source it was written from.
    const down = render(<FlowchartSurface text={'flowchart TD\nA --> B'} id="b" />);
    expect(down.container.querySelector('.flow-chart')).toHaveProperty('dataset.direction', 'TB');
  });

  it('clears the selection on Escape, without hunting for the node again', async () => {
    const user = userEvent.setup();
    const { container } = render(<FlowchartSurface text={PIPELINE} id="d" />);

    await user.click(screen.getByRole('button', { name: 'Coverage ok?' }));
    expect(container.querySelector('.flow-chart')).toHaveProperty('dataset.selecting', 'true');

    await user.keyboard('{Escape}');
    expect(container.querySelector('.flow-chart')).toHaveProperty('dataset.selecting', 'false');
  });

  it('falls back to the proxy for a chart it cannot parse, reporting it as non-fatal', async () => {
    const onError = vi.fn();
    render(
      <FlowchartSurface
        text={'flowchart LR\nsubgraph never closed\nA --> B'}
        id="d"
        onError={onError}
      />,
    );

    expect(await screen.findByTestId('proxy-svg')).toBeDefined();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'DIAGRAM_PARSE_ERROR' }));
  });
});
