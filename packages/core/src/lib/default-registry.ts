import { DiagramRegistry } from './registry';
import { proxyRenderer } from './renderers/proxy';

/**
 * The registry the facade and React host use by default. The proxy is its
 * fallback, so every diagram type resolves until a native renderer claims one.
 */
export const defaultRegistry = new DiagramRegistry(proxyRenderer);
