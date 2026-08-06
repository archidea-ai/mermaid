import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeMock = vi.fn();
const renderMock = vi.fn();
const parseMock = vi.fn();
const detectTypeMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
    parse: parseMock,
    detectType: detectTypeMock,
    run: vi.fn(),
    contentLoaded: vi.fn(),
    registerExternalDiagrams: vi.fn(),
    registerIconPacks: vi.fn(),
    registerLayoutLoaders: vi.fn(),
    startOnLoad: false,
    mermaidAPI: { fake: true },
  },
}));

const loadProxy = async () => ({
  createProxyRenderer: (await import('./proxy')).createProxyRenderer,
  ConfigStore: (await import('../config-store')).ConfigStore,
});

describe('proxy renderer', () => {
  beforeEach(() => {
    vi.resetModules();
    detectTypeMock.mockReturnValue('sequence');
    renderMock.mockResolvedValue({ svg: '<svg id="d"></svg>', bindFunctions: undefined });
  });
  afterEach(() => vi.clearAllMocks());

  it('identifies itself as the capability-free universal fallback', async () => {
    const { createProxyRenderer } = await loadProxy();
    const renderer = createProxyRenderer();

    expect(renderer.id).toBe('proxy');
    expect(renderer.supports('sequence')).toBe(true);
    expect(renderer.supports('anything')).toBe(true);
    expect(renderer.capabilities).toEqual({ events: false, viewport: false, step: false });
    expect(renderer.Component).toBeUndefined();
  });

  it('delegates to upstream render and reports the detected diagram type', async () => {
    const { createProxyRenderer } = await loadProxy();
    const container = { nodeType: 1 } as unknown as Element;

    const result = await createProxyRenderer().renderToSvg({
      id: 'diagram-1',
      text: 'sequenceDiagram\n  A ->> B: hi',
      container,
    });

    expect(renderMock).toHaveBeenCalledWith(
      'diagram-1',
      'sequenceDiagram\n  A ->> B: hi',
      container,
    );
    expect(result).toEqual({
      svg: '<svg id="d"></svg>',
      diagramType: 'sequence',
      bindFunctions: undefined,
    });
  });

  it('passes bindFunctions through untouched for the host to run after commit', async () => {
    const bindFunctions = vi.fn();
    renderMock.mockResolvedValue({ svg: '<svg></svg>', bindFunctions });
    const { createProxyRenderer } = await loadProxy();

    const result = await createProxyRenderer().renderToSvg({ id: 'd', text: 'sequenceDiagram' });
    expect(result.bindFunctions).toBe(bindFunctions);
  });

  it('forwards stored config to upstream initialize before rendering', async () => {
    const { createProxyRenderer, ConfigStore } = await loadProxy();
    const store = new ConfigStore();
    store.merge({ theme: 'dark' });

    await createProxyRenderer(store).renderToSvg({ id: 'd', text: 'sequenceDiagram' });

    expect(initializeMock).toHaveBeenCalledWith({ theme: 'dark' });
    expect(initializeMock.mock.invocationCallOrder[0]).toBeLessThan(
      renderMock.mock.invocationCallOrder[0],
    );
  });

  it('merges per-render config over stored config without writing back to the store', async () => {
    const { createProxyRenderer, ConfigStore } = await loadProxy();
    const store = new ConfigStore();
    store.merge({ theme: 'dark', sequence: { mirrorActors: true } });

    await createProxyRenderer(store).renderToSvg({
      id: 'd',
      text: 'sequenceDiagram',
      config: { sequence: { mirrorActors: false } },
    });

    expect(initializeMock).toHaveBeenCalledWith({
      theme: 'dark',
      sequence: { mirrorActors: false },
    });
    expect(store.get()).toEqual({ theme: 'dark', sequence: { mirrorActors: true } });
  });

  it('initializes even with an empty config, because that is what registers detectors', async () => {
    const { createProxyRenderer, ConfigStore } = await loadProxy();

    await createProxyRenderer(new ConfigStore()).renderToSvg({ id: 'd', text: 'sequenceDiagram' });

    expect(initializeMock).toHaveBeenCalledWith({});
    expect(initializeMock.mock.invocationCallOrder[0]).toBeLessThan(
      detectTypeMock.mock.invocationCallOrder[0],
    );
  });

  it('wraps an upstream render failure as DiagramParseError carrying the source', async () => {
    renderMock.mockRejectedValue(new Error('Parse error on line 2'));
    const { createProxyRenderer } = await loadProxy();

    await expect(
      createProxyRenderer().renderToSvg({ id: 'd', text: 'sequenceDiagram\n  ???' }),
    ).rejects.toMatchObject({ code: 'DIAGRAM_PARSE_ERROR', text: 'sequenceDiagram\n  ???' });
  });
});
