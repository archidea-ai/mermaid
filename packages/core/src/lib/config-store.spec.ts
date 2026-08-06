import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigStore, defaultConfigStore } from './config-store';

describe('ConfigStore', () => {
  let store: ConfigStore;

  beforeEach(() => {
    store = new ConfigStore();
  });

  it('starts empty', () => {
    expect(store.get()).toEqual({});
  });

  it('deep merges successive calls so initialize is additive, not replacing', () => {
    store.merge({ theme: 'dark', sequence: { mirrorActors: true } });
    store.merge({ sequence: { showSequenceNumbers: true } });

    expect(store.get()).toEqual({
      theme: 'dark',
      sequence: { mirrorActors: true, showSequenceNumbers: true },
    });
  });

  it('is idempotent for a repeated identical patch', () => {
    const first = store.merge({ theme: 'dark' });
    expect(store.merge({ theme: 'dark' })).toEqual(first);
  });

  it('lets a later call override an earlier value key by key', () => {
    store.merge({ theme: 'dark', logLevel: 'error' });
    store.merge({ theme: 'forest' });

    expect(store.get()).toEqual({ theme: 'forest', logLevel: 'error' });
  });

  it('notifies subscribers with the merged config and honours unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.merge({ theme: 'dark' });
    unsubscribe();
    store.merge({ theme: 'forest' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('keeps one subscriber failure from starving the others', () => {
    const healthy = vi.fn();
    store.subscribe(() => {
      throw new Error('subscriber exploded');
    });
    store.subscribe(healthy);

    expect(() => store.merge({ theme: 'dark' })).not.toThrow();
    expect(healthy).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('hands out a snapshot that cannot be mutated into the store', () => {
    store.merge({ theme: 'dark' });
    const snapshot = store.get() as Record<string, unknown>;

    expect(() => {
      snapshot.theme = 'tampered';
    }).toThrow();
    expect(store.get()).toEqual({ theme: 'dark' });
  });

  it('resets back to empty', () => {
    store.merge({ theme: 'dark' });
    store.reset();
    expect(store.get()).toEqual({});
  });

  it('exposes a shared default instance', () => {
    expect(defaultConfigStore).toBeInstanceOf(ConfigStore);
  });
});
