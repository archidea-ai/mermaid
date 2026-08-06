import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDiagramRender } from './use-diagram-render';
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

describe('useDiagramRender', () => {
  it('renders through the resolved renderer and reports svg mode', async () => {
    const registry = makeFakeRegistry(makeFakeRenderer({ id: 'proxy', svg: '<svg>ok</svg>' }));

    const { result } = renderHook(() =>
      useDiagramRender('sequenceDiagram\n  A ->> B: hi', { id: 'd1', registry }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.mode).toBe('svg');
    expect(result.current.result?.svg).toBe('<svg>ok</svg>');
    expect(result.current.renderer?.id).toBe('proxy');
    expect(result.current.error).toBeNull();
  });

  it('reports native mode without calling renderToSvg when the renderer has a Component', async () => {
    const renderToSvg = vi.fn();
    const base = makeFakeRenderer({ id: 'native', capabilities: { step: true }, Component: () => null });
    const registry = makeFakeRegistry({ ...base, renderToSvg });

    const { result } = renderHook(() => useDiagramRender('sequenceDiagram', { registry }));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.mode).toBe('native');
    expect(result.current.result).toBeNull();
    expect(renderToSvg).not.toHaveBeenCalled();
  });

  it('surfaces a render failure as error status', async () => {
    const registry = makeFakeRegistry(makeFakeRenderer({ failWith: new Error('bad diagram') }));

    const { result } = renderHook(() => useDiagramRender('sequenceDiagram', { registry }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('bad diagram');
    expect(result.current.result).toBeNull();
  });

  it('ignores a slow earlier render so it cannot overwrite a newer one', async () => {
    const registry = makeFakeRegistry(
      makeFakeRenderer({ id: 'slow', svg: '<svg>first</svg>', renderDelayMs: 40 }),
    );

    const { result, rerender } = renderHook(({ text }) => useDiagramRender(text, { registry }), {
      initialProps: { text: 'sequenceDiagram\n  A ->> B: one' },
    });

    registry.register(makeFakeRenderer({ id: 'fast', svg: '<svg>second</svg>' }));
    rerender({ text: 'sequenceDiagram\n  A ->> B: two' });

    await waitFor(() => expect(result.current.result?.svg).toBe('<svg>second</svg>'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(result.current.result?.svg).toBe('<svg>second</svg>');
  });

  it('does not warn about state updates after unmount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registry = makeFakeRegistry(makeFakeRenderer({ renderDelayMs: 30 }));

    const { unmount } = renderHook(() => useDiagramRender('sequenceDiagram', { registry }));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
