import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeMock = vi.fn();
const renderMock = vi.fn();
const parseMock = vi.fn();
const detectTypeMock = vi.fn();

vi.mock("mermaid", () => ({
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

describe('detectDiagramType', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.clearAllMocks());

  it('delegates to upstream detectType', async () => {
    detectTypeMock.mockReturnValue('sequence');
    const { detectDiagramType } = await import('./detect');

    await expect(detectDiagramType('sequenceDiagram\n  A ->> B: hi')).resolves.toBe('sequence');
    expect(detectTypeMock).toHaveBeenCalledWith('sequenceDiagram\n  A ->> B: hi', undefined);
  });

  it('wraps an upstream detection failure as DiagramParseError carrying the source', async () => {
    detectTypeMock.mockImplementation(() => {
      throw new Error('No diagram type detected');
    });
    const { detectDiagramType } = await import('./detect');

    await expect(detectDiagramType('not a diagram')).rejects.toMatchObject({
      code: 'DIAGRAM_PARSE_ERROR',
      text: 'not a diagram',
    });
  });

  it('resolves a renderer alongside the detected type', async () => {
    detectTypeMock.mockReturnValue('sequence');
    const { resolveRendererForText } = await import('./detect');
    const { DiagramRegistry } = await import('./registry');
    const { NO_CAPABILITIES } = await import('./types');

    const fallback = {
      id: 'fallback',
      supports: () => true,
      capabilities: NO_CAPABILITIES,
      renderToSvg: async () => ({ svg: '', diagramType: 'sequence' }),
    };
    const native = {
      id: 'native-sequence',
      supports: (type: string) => type === 'sequence',
      capabilities: { events: true, viewport: true, step: true },
      renderToSvg: async () => ({ svg: '', diagramType: 'sequence' }),
      Component: () => null,
    };
    const registry = new DiagramRegistry(fallback);
    registry.register(native);

    await expect(resolveRendererForText('sequenceDiagram', registry)).resolves.toEqual({
      renderer: native,
      diagramType: 'sequence',
    });
  });
});
