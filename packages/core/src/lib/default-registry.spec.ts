import { describe, expect, it } from 'vitest';
import { defaultRegistry } from './default-registry';
import { DiagramRegistry } from './registry';
import { NO_CAPABILITIES } from './types';

describe('defaultRegistry', () => {
  it('is a registry whose fallback is the proxy renderer', () => {
    expect(defaultRegistry).toBeInstanceOf(DiagramRegistry);
    expect(defaultRegistry.fallback.id).toBe('proxy');
  });

  it('resolves every diagram type to the proxy before a native renderer registers', () => {
    for (const type of ['sequence', 'flowchart-v2', 'gantt', 'made-up']) {
      expect(defaultRegistry.resolve(type).id).toBe('proxy');
    }
  });

  it('lets a native renderer take over one type and hands it back on unregister', () => {
    const unregister = defaultRegistry.register({
      id: 'native-sequence',
      supports: (type) => type === 'sequence',
      capabilities: { ...NO_CAPABILITIES, step: true },
      renderToSvg: async () => ({ svg: '<svg></svg>', diagramType: 'sequence' }),
      Component: () => null,
    });

    expect(defaultRegistry.resolve('sequence').id).toBe('native-sequence');
    expect(defaultRegistry.resolve('gantt').id).toBe('proxy');

    unregister();
    expect(defaultRegistry.resolve('sequence').id).toBe('proxy');
  });
});
