import { describe, expect, it } from 'vitest';
import { DiagramRegistry } from './registry';
import { NO_CAPABILITIES } from './types';
import type { DiagramRenderer, DiagramType } from './types';

const makeRenderer = (id: string, supports: (type: DiagramType) => boolean): DiagramRenderer => ({
  id,
  supports,
  capabilities: NO_CAPABILITIES,
  renderToSvg: async ({ text }) => ({ svg: `<svg data-by="${id}"></svg>`, diagramType: text }),
});

const fallback = makeRenderer('fallback', () => true);

describe('DiagramRegistry', () => {
  it('falls back when nothing is registered, so resolution never fails', () => {
    const registry = new DiagramRegistry(fallback);
    expect(registry.resolve('sequence')).toBe(fallback);
    expect(registry.resolve('anything-at-all')).toBe(fallback);
  });

  it('prefers a registered renderer that supports the type', () => {
    const registry = new DiagramRegistry(fallback);
    const sequence = makeRenderer('sequence', (type) => type === 'sequence');
    registry.register(sequence);

    expect(registry.resolve('sequence')).toBe(sequence);
    expect(registry.resolve('flowchart-v2')).toBe(fallback);
  });

  it('resolves in registration order when two renderers both support a type', () => {
    const registry = new DiagramRegistry(fallback);
    const first = makeRenderer('first', () => true);
    registry.register(first);
    registry.register(makeRenderer('second', () => true));

    expect(registry.resolve('sequence')).toBe(first);
  });

  it('returns an unregister function that restores the previous resolution', () => {
    const registry = new DiagramRegistry(fallback);
    const sequence = makeRenderer('sequence', (type) => type === 'sequence');
    const unregister = registry.register(sequence);

    expect(registry.resolve('sequence')).toBe(sequence);
    unregister();
    expect(registry.resolve('sequence')).toBe(fallback);
  });

  it('tolerates unregistering twice', () => {
    const registry = new DiagramRegistry(fallback);
    const unregister = registry.register(makeRenderer('x', () => true));

    unregister();
    expect(() => unregister()).not.toThrow();
    expect(registry.resolve('sequence')).toBe(fallback);
  });

  it('lists registered renderers ahead of the fallback', () => {
    const registry = new DiagramRegistry(fallback);
    registry.register(makeRenderer('sequence', () => true));

    expect(registry.list().map((renderer) => renderer.id)).toEqual(['sequence', 'fallback']);
  });

  it('treats a renderer whose supports() throws as non-matching', () => {
    const registry = new DiagramRegistry(fallback);
    registry.register(
      makeRenderer('broken', () => {
        throw new Error('bad predicate');
      }),
    );

    expect(registry.resolve('sequence')).toBe(fallback);
  });

  it('exposes the fallback', () => {
    expect(new DiagramRegistry(fallback).fallback).toBe(fallback);
  });
});
