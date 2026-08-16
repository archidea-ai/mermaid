import { describe, expect, it, vi } from 'vitest';

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

describe('default registration', () => {
  it('resolves sequence diagrams to the native renderer, not the proxy', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('sequence').id).toBe('sequence-react');
    expect(defaultRegistry.resolve('sequence').capabilities.step).toBe(true);
  });

  it('leaves every type without a native renderer on the proxy', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('gantt').id).toBe('proxy');
    expect(defaultRegistry.resolve('classDiagram').id).toBe('proxy');
  });
});

describe('flowchart registration', () => {
  it('resolves flowcharts to the native renderer, under either spelling', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    for (const type of ['flowchart', 'flowchart-v2', 'graph']) {
      expect(defaultRegistry.resolve(type).id).toBe('flowchart-react');
    }
  });

  it('claims no stepping, because a chart is a map rather than a run', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('flowchart').capabilities).toEqual({
      events: true,
      viewport: false,
      step: false,
    });
  });
});

describe('state diagram registration', () => {
  it('resolves state diagrams to the native renderer', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    for (const type of ['stateDiagram', 'stateDiagram-v2']) {
      expect(defaultRegistry.resolve(type).id).toBe('state-react');
      expect(defaultRegistry.resolve(type).capabilities.step).toBe(true);
    }
  });

  it('keeps sequence and state on their own renderers', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('sequence').id).toBe('sequence-react');
    expect(defaultRegistry.resolve('gantt').id).toBe('proxy');
  });
});

describe('c4 registration', () => {
  it('resolves the c4 type to the native renderer', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('c4').id).toBe('c4-react');
  });

  it('claims stepping for every C4 type, because the transport must stay visible even where only C4Dynamic has a run', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('c4').capabilities).toEqual({
      events: true,
      viewport: false,
      step: true,
    });
  });

  it('renders through a Component, not just the imperative renderToSvg path', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('c4').Component).toBeTypeOf('function');
  });
});
