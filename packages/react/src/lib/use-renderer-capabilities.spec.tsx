import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRendererCapabilities } from './use-renderer-capabilities';
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

describe('useRendererCapabilities', () => {
  it('starts empty then reports the resolved proxy renderer', async () => {
    const registry = makeFakeRegistry(makeFakeRenderer({ id: 'proxy' }));

    const { result } = renderHook(() => useRendererCapabilities('sequenceDiagram', { registry }));

    expect(result.current.rendererId).toBeNull();
    await waitFor(() => expect(result.current.rendererId).toBe('proxy'));
    expect(result.current.diagramType).toBe('sequence');
    expect(result.current.capabilities).toEqual({ events: false, viewport: false, step: false });
  });

  it('reports native renderer capabilities so a UI can enable its controls', async () => {
    const registry = makeFakeRegistry(
      makeFakeRenderer({
        id: 'native-sequence',
        capabilities: { step: true, events: true, viewport: true },
        Component: () => null,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities('sequenceDiagram', { registry }));

    await waitFor(() => expect(result.current.rendererId).toBe('native-sequence'));
    expect(result.current.capabilities).toEqual({ events: true, viewport: true, step: true });
  });
});
