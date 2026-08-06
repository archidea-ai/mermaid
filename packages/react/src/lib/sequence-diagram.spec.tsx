import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SequenceDiagram } from './sequence-diagram';
import { makeFakeRegistry, makeFakeRenderer } from './test-support';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
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

const SOURCE = 'sequenceDiagram\n  Alice ->> Bob: hi\n  Bob ->> Alice: hey';

describe('<SequenceDiagram />', () => {
  it('renders the diagram through the resolved renderer', async () => {
    const registry = makeFakeRegistry(
      makeFakeRenderer({ svg: '<svg data-testid="diagram"></svg>' }),
    );

    render(<SequenceDiagram text={SOURCE} registry={registry} />);

    expect(await screen.findByTestId('diagram')).toBeDefined();
  });

  it('hands back a null step controller while the proxy is active, never a silent stub', async () => {
    const onStepController = vi.fn();
    const registry = makeFakeRegistry(makeFakeRenderer({ id: 'proxy', svg: '<svg></svg>' }));

    render(
      <SequenceDiagram text={SOURCE} registry={registry} onStepController={onStepController} />,
    );

    await waitFor(() => expect(onStepController).toHaveBeenCalledWith(null));
    expect(onStepController).toHaveBeenCalledTimes(1);
  });

  it('hands back the live controller once a step-capable renderer takes over', async () => {
    const onStepController = vi.fn();
    const controller = {
      stepCount: 2,
      current: -1,
      goTo: vi.fn(),
      next: vi.fn(),
      prev: vi.fn(),
      reset: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const registry = makeFakeRegistry(
      makeFakeRenderer({
        id: 'native-sequence',
        capabilities: { step: true },
        Component: ({ onStepController: emit }) => {
          emit?.(controller);
          return <p data-testid="native" />;
        },
      }),
    );

    render(
      <SequenceDiagram text={SOURCE} registry={registry} onStepController={onStepController} />,
    );

    await screen.findByTestId('native');
    expect(onStepController).toHaveBeenCalledWith(controller);
  });
});
