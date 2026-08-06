import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeMock = vi.fn();
const renderMock = vi.fn();
const parseMock = vi.fn();
const detectTypeMock = vi.fn(() => 'sequence');
const runMock = vi.fn();
const registerExternalMock = vi.fn();
const registerIconsMock = vi.fn();
const registerLayoutMock = vi.fn();

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
    parse: parseMock,
    detectType: detectTypeMock,
    run: runMock,
    contentLoaded: vi.fn(),
    registerExternalDiagrams: registerExternalMock,
    registerIconPacks: registerIconsMock,
    registerLayoutLoaders: registerLayoutMock,
    startOnLoad: false,
    mermaidAPI: { fake: true },
  },
}));

describe('facade api', () => {
  beforeEach(() => {
    vi.resetModules();
    detectTypeMock.mockReturnValue('sequence');
    renderMock.mockResolvedValue({ svg: '<svg></svg>' });
  });
  afterEach(() => vi.clearAllMocks());

  it('initialize stores config synchronously without calling upstream itself', async () => {
    const { initialize } = await import('./api');
    const { defaultConfigStore } = await import('@archidea-ai/mermaid-core');
    defaultConfigStore.reset();

    initialize({ theme: 'dark' });

    expect(defaultConfigStore.get()).toEqual({ theme: 'dark' });
    expect(initializeMock).not.toHaveBeenCalled();
  });

  it('render resolves through the registry and returns svg plus diagram type', async () => {
    const { render } = await import('./api');

    await expect(render('d1', 'sequenceDiagram')).resolves.toMatchObject({
      svg: '<svg></svg>',
      diagramType: 'sequence',
    });
    expect(renderMock).toHaveBeenCalledWith('d1', 'sequenceDiagram', undefined);
  });

  it('render uses a registered native renderer instead of upstream', async () => {
    const { render } = await import('./api');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    const unregister = defaultRegistry.register({
      id: 'native-sequence',
      supports: (type) => type === 'sequence',
      capabilities: { events: true, viewport: true, step: true },
      renderToSvg: async () => ({ svg: '<svg data-native="1"></svg>', diagramType: 'sequence' }),
      Component: () => null,
    });

    await expect(render('d1', 'sequenceDiagram')).resolves.toMatchObject({
      svg: '<svg data-native="1"></svg>',
    });
    expect(renderMock).not.toHaveBeenCalled();
    unregister();
  });

  it('parse delegates and returns upstream value', async () => {
    parseMock.mockResolvedValue({ diagramType: 'sequence' });
    const { parse } = await import('./api');

    await expect(parse('sequenceDiagram')).resolves.toEqual({ diagramType: 'sequence' });
  });

  it('parse with suppressErrors resolves false instead of throwing', async () => {
    parseMock.mockRejectedValue(new Error('bad'));
    const { parse } = await import('./api');

    await expect(parse('nope', { suppressErrors: true })).resolves.toBe(false);
  });

  it('parse without suppressErrors rejects with DiagramParseError carrying the source', async () => {
    parseMock.mockRejectedValue(new Error('bad'));
    const { parse } = await import('./api');

    await expect(parse('nope')).rejects.toMatchObject({
      code: 'DIAGRAM_PARSE_ERROR',
      text: 'nope',
    });
  });

  it('detectType throws before any load and delegates after preloadUpstream', async () => {
    const { detectType, preloadUpstream } = await import('./api');

    expect(() => detectType('sequenceDiagram')).toThrow(/preloadUpstream/);

    await preloadUpstream();
    expect(detectType('sequenceDiagram')).toBe('sequence');
  });

  it('delegates the register* helpers with arguments unchanged', async () => {
    const { registerIconPacks, registerLayoutLoaders, registerExternalDiagrams } =
      await import('./api');

    await registerIconPacks([{ name: 'logos' }]);
    await registerLayoutLoaders([{ name: 'elk' }]);
    await registerExternalDiagrams([{ id: 'x' }], { lazyLoad: false });

    expect(registerIconsMock).toHaveBeenCalledWith([{ name: 'logos' }]);
    expect(registerLayoutMock).toHaveBeenCalledWith([{ name: 'elk' }]);
    expect(registerExternalMock).toHaveBeenCalledWith([{ id: 'x' }], { lazyLoad: false });
  });
});

describe('upstream property mirrors', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it('applies parseError and startOnLoad set before the load once upstream resolves', async () => {
    const state = await import('./upstream-state');
    const handler = vi.fn();

    state.setParseError(handler);
    state.setStartOnLoad(true);
    expect(state.getStartOnLoad()).toBe(true);

    await state.preloadUpstream();
    const { getLoadedUpstream } = await import('@archidea-ai/mermaid-core');

    expect(getLoadedUpstream()?.parseError).toBe(handler);
    expect(getLoadedUpstream()?.startOnLoad).toBe(true);
  });
});
