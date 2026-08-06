import { DiagramRegistry, NO_CAPABILITIES } from '@archidea-ai/mermaid-core';
import type {
  DiagramRenderer,
  DiagramSurfaceProps,
  RendererCapabilities,
} from '@archidea-ai/mermaid-core';
import type { ComponentType } from 'react';

export interface FakeRendererOptions {
  id?: string;
  supports?: (type: string) => boolean;
  capabilities?: Partial<RendererCapabilities>;
  svg?: string;
  diagramType?: string;
  bindFunctions?: (element: Element) => void;
  Component?: ComponentType<DiagramSurfaceProps>;
  renderDelayMs?: number;
  failWith?: Error;
}

/** Fakes so no React spec ever needs upstream mermaid, which jsdom cannot run. */
export function makeFakeRenderer(options: FakeRendererOptions = {}): DiagramRenderer {
  const {
    id = 'fake',
    supports = () => true,
    capabilities = {},
    svg = '<svg data-testid="fake-svg"></svg>',
    diagramType = 'sequence',
    bindFunctions,
    Component,
    renderDelayMs = 0,
    failWith,
  } = options;

  return {
    id,
    supports,
    capabilities: { ...NO_CAPABILITIES, ...capabilities },
    ...(Component ? { Component } : {}),
    async renderToSvg() {
      if (renderDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, renderDelayMs));
      if (failWith) throw failWith;
      return { svg, diagramType, bindFunctions };
    },
  };
}

export function makeFakeRegistry(fallback = makeFakeRenderer()): DiagramRegistry {
  return new DiagramRegistry(fallback);
}
