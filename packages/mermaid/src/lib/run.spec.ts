import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeMock = vi.fn();
const renderMock = vi.fn();
const parseMock = vi.fn();
const detectTypeMock = vi.fn(() => 'sequence');
const runMock = vi.fn(async () => undefined);
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

const createRootMock = vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: createRootMock }));

const seed = (sources: string[]) => {
  document.body.innerHTML = sources
    .map((source) => `<pre class="mermaid">${source}</pre>`)
    .join('');
};

describe('run() partitioning', () => {
  beforeEach(() => {
    vi.resetModules();
    detectTypeMock.mockReturnValue('sequence');
  });
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('sends every element to upstream in one call when only the proxy is registered', async () => {
    seed(['sequenceDiagram', 'graph TD', 'gantt']);
    const { run } = await import('./run');

    await run();

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0]![0].nodes).toHaveLength(3);
    expect(createRootMock).not.toHaveBeenCalled();
  });

  it('mounts native types with createRoot and leaves the rest to upstream', async () => {
    seed(['sequenceDiagram', 'graph TD', 'gantt']);
    detectTypeMock.mockImplementation((text: string) =>
      text.startsWith('sequenceDiagram') ? 'sequence' : 'flowchart-v2',
    );

    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');
    const unregister = defaultRegistry.register({
      id: 'native-sequence',
      supports: (type) => type === 'sequence',
      capabilities: { events: true, viewport: true, step: true },
      renderToSvg: async () => ({ svg: '', diagramType: 'sequence' }),
      Component: () => null,
    });

    const { run } = await import('./run');
    await run();

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock.mock.calls[0]![0].nodes).toHaveLength(2);
    expect(createRootMock).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('does not call upstream at all when every element is native', async () => {
    seed(['sequenceDiagram']);
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');
    const unregister = defaultRegistry.register({
      id: 'native-sequence',
      supports: () => true,
      capabilities: { events: true, viewport: true, step: true },
      renderToSvg: async () => ({ svg: '', diagramType: 'sequence' }),
      Component: () => null,
    });

    const { run } = await import('./run');
    await run();

    expect(runMock).not.toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('honours a custom querySelector', async () => {
    document.body.innerHTML =
      '<div class="chart">sequenceDiagram</div><pre class="mermaid">gantt</pre>';
    const { run } = await import('./run');

    await run({ querySelector: '.chart' });

    expect(runMock.mock.calls[0]![0].nodes).toHaveLength(1);
  });

  it('uses an explicit nodes list instead of querying', async () => {
    seed(['sequenceDiagram', 'gantt']);
    const nodes = [document.querySelector('pre')!];
    const { run } = await import('./run');

    await run({ nodes });

    expect(runMock.mock.calls[0]![0].nodes).toEqual(nodes);
  });

  it('skips elements already marked processed', async () => {
    seed(['sequenceDiagram', 'gantt']);
    document.querySelector('pre')!.setAttribute('data-processed', 'true');
    const { run } = await import('./run');

    await run();

    expect(runMock.mock.calls[0]![0].nodes).toHaveLength(1);
  });
});
