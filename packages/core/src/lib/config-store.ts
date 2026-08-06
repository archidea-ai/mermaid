import { deepMerge } from './deep-merge';
import type { MermaidConfig } from './types';

export type ConfigListener = (config: MermaidConfig) => void;

/**
 * Holds the merged MermaidConfig. Callers expect initialize() to be sticky and
 * synchronous, but upstream mermaid loads lazily — so config is stored here and
 * forwarded to upstream by the proxy renderer before each render.
 */
export class ConfigStore {
  #config: MermaidConfig = Object.freeze({});
  #listeners = new Set<ConfigListener>();

  get(): MermaidConfig {
    return this.#config;
  }

  merge(patch: MermaidConfig): MermaidConfig {
    this.#config = Object.freeze(deepMerge(this.#config, patch));
    this.#notify();
    return this.#config;
  }

  reset(): void {
    this.#config = Object.freeze({});
    this.#notify();
  }

  subscribe(listener: ConfigListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(this.#config);
      } catch {
        // A misbehaving subscriber must not starve the others or fail the merge.
      }
    }
  }
}

export const defaultConfigStore = new ConfigStore();
