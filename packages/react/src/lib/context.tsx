import { createContext, createElement, useContext, useMemo, useRef } from 'react';
import { defaultConfigStore, defaultRegistry, deepMerge } from '@archidea-ai/mermaid-core';
import type { DiagramRegistry, MermaidConfig } from '@archidea-ai/mermaid-core';
import type { ReactNode } from 'react';

export interface MermaidContextValue {
  readonly config: MermaidConfig;
  readonly registry: DiagramRegistry;
}

const MermaidContext = createContext<MermaidContextValue | null>(null);

const EMPTY_CONFIG: MermaidConfig = Object.freeze({});

/**
 * Module-level so the no-provider path returns a stable identity. A fresh
 * object here re-triggers every downstream useMemo on the config, which loops
 * the render effect forever.
 */
const DEFAULT_CONTEXT: MermaidContextValue = Object.freeze({
  config: EMPTY_CONFIG,
  registry: defaultRegistry,
});

export interface MermaidProviderProps {
  config?: MermaidConfig;
  registry?: DiagramRegistry;
  children: ReactNode;
}

/**
 * Provider config is scoped to this subtree rather than written into the global
 * config store: a React subtree silently mutating global config would surprise
 * the imperative API.
 */
export function MermaidProvider({ config, registry, children }: MermaidProviderProps) {
  const value = useMemo<MermaidContextValue>(
    () => ({ config: config ?? EMPTY_CONFIG, registry: registry ?? defaultRegistry }),
    [config, registry],
  );

  return createElement(MermaidContext.Provider, { value }, children);
}

/** Falls back to module defaults, so components work with no provider present. */
export function useMermaidContext(): MermaidContextValue {
  return useContext(MermaidContext) ?? DEFAULT_CONTEXT;
}

/**
 * Effective config precedence: store, then provider, then per-instance props.
 *
 * Keyed on a structural signature rather than object identity. Consumers
 * routinely pass a fresh `config={{...}}` literal on every render, and keying on
 * identity would make this value — and therefore the render effect that depends
 * on it — change forever.
 */
export function useEffectiveConfig(instanceConfig?: MermaidConfig): MermaidConfig {
  const { config: providerConfig } = useMermaidContext();
  const storeConfig = defaultConfigStore.get();

  const signature = JSON.stringify([storeConfig, providerConfig, instanceConfig ?? null]);
  const cache = useRef<{ signature: string; value: MermaidConfig } | null>(null);

  if (cache.current?.signature !== signature) {
    let merged = deepMerge(storeConfig, providerConfig);
    if (instanceConfig) merged = deepMerge(merged, instanceConfig);
    cache.current = { signature, value: merged };
  }

  return cache.current.value;
}
