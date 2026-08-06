import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Mermaid } from './mermaid';
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

const SOURCE = 'sequenceDiagram\n  Alice ->> Bob: hi';

describe('<Mermaid />', () => {
  it('injects the proxied svg', async () => {
    const registry = makeFakeRegistry(
      makeFakeRenderer({ svg: '<svg data-testid="diagram"></svg>' }),
    );

    render(<Mermaid text={SOURCE} registry={registry} />);

    expect(await screen.findByTestId('diagram')).toBeDefined();
  });

  it('runs bindFunctions against the committed host element', async () => {
    const bindFunctions = vi.fn();
    const registry = makeFakeRegistry(
      makeFakeRenderer({ svg: '<svg data-testid="diagram"></svg>', bindFunctions }),
    );

    render(<Mermaid text={SOURCE} registry={registry} />);

    await waitFor(() => expect(bindFunctions).toHaveBeenCalledTimes(1));
    const host = bindFunctions.mock.calls[0]![0] as Element;
    expect(host.querySelector('[data-testid="diagram"]')).not.toBeNull();
  });

  it('shows the fallback while rendering, then the diagram', async () => {
    const registry = makeFakeRegistry(
      makeFakeRenderer({ svg: '<svg data-testid="diagram"></svg>', renderDelayMs: 20 }),
    );

    render(<Mermaid text={SOURCE} registry={registry} fallback={<p>Rendering</p>} />);

    expect(screen.getByText('Rendering')).toBeDefined();
    expect(await screen.findByTestId('diagram')).toBeDefined();
  });

  it('reports a render failure through onError and errorFallback without throwing', async () => {
    const onError = vi.fn();
    const registry = makeFakeRegistry(makeFakeRenderer({ failWith: new Error('bad diagram') }));

    render(
      <Mermaid
        text={SOURCE}
        registry={registry}
        onError={onError}
        errorFallback={(error) => <p role="alert">{error.message}</p>}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'bad diagram');
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad diagram' })),
    );
  });

  it('calls onRender with the result', async () => {
    const onRender = vi.fn();
    const registry = makeFakeRegistry(makeFakeRenderer({ svg: '<svg></svg>' }));

    render(<Mermaid text={SOURCE} registry={registry} onRender={onRender} />);

    await waitFor(() =>
      expect(onRender).toHaveBeenCalledWith(
        expect.objectContaining({ svg: '<svg></svg>', diagramType: 'sequence' }),
      ),
    );
  });

  it('renders a native renderer Component instead of injecting html', async () => {
    const registry = makeFakeRegistry(
      makeFakeRenderer({
        id: 'native',
        capabilities: { step: true, events: true, viewport: true },
        Component: ({ text }) => <p data-testid="native">{text.length} chars</p>,
      }),
    );

    render(<Mermaid text={SOURCE} registry={registry} />);

    expect(await screen.findByTestId('native')).toHaveProperty(
      'textContent',
      `${SOURCE.length} chars`,
    );
  });

  it('emits null controllers on the svg path, because the proxy supports neither', async () => {
    const onStepController = vi.fn();
    const onViewportController = vi.fn();
    const registry = makeFakeRegistry(makeFakeRenderer({ svg: '<svg></svg>' }));

    render(
      <Mermaid
        text={SOURCE}
        registry={registry}
        onStepController={onStepController}
        onViewportController={onViewportController}
      />,
    );

    await waitFor(() => expect(onStepController).toHaveBeenCalledWith(null));
    expect(onViewportController).toHaveBeenCalledWith(null);
  });

  it('forwards controller callbacks to a native Component rather than emitting null', async () => {
    const onStepController = vi.fn();
    const controller = {
      stepCount: 2,
      current: -1,
      goTo: () => undefined,
      next: () => undefined,
      prev: () => undefined,
      reset: () => undefined,
      subscribe: () => () => undefined,
    };
    const registry = makeFakeRegistry(
      makeFakeRenderer({
        id: 'native',
        capabilities: { step: true },
        Component: ({ onStepController: emit }) => {
          emit?.(controller);
          return <p data-testid="native" />;
        },
      }),
    );

    render(<Mermaid text={SOURCE} registry={registry} onStepController={onStepController} />);

    await screen.findByTestId('native');
    expect(onStepController).toHaveBeenCalledWith(controller);
    expect(onStepController).not.toHaveBeenCalledWith(null);
  });
});
