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

  it('leaves every other diagram type on the proxy', async () => {
    await import('../index');
    const { defaultRegistry } = await import('@archidea-ai/mermaid-core');

    expect(defaultRegistry.resolve('flowchart-v2').id).toBe('proxy');
    expect(defaultRegistry.resolve('gantt').id).toBe('proxy');
  });
});
