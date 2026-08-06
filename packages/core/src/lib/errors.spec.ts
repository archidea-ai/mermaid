import { describe, expect, it } from 'vitest';
import {
  DiagramParseError,
  MermaidReplacementError,
  UnsupportedDiagramError,
  UpstreamNotInstalledError,
  isMermaidReplacementError,
} from './errors';

describe('error hierarchy', () => {
  it('gives UpstreamNotInstalledError a stable code, its own name and an actionable message', () => {
    const error = new UpstreamNotInstalledError(new Error('Cannot find module'));

    expect(error).toBeInstanceOf(MermaidReplacementError);
    expect(error.code).toBe('UPSTREAM_NOT_INSTALLED');
    expect(error.name).toBe('UpstreamNotInstalledError');
    expect(error.message).toContain('pnpm add mermaid');
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('carries the offending source on DiagramParseError', () => {
    const error = new DiagramParseError('sequenceDiagram\n  A ->> B', new Error('bad token'));

    expect(error.code).toBe('DIAGRAM_PARSE_ERROR');
    expect(error.text).toBe('sequenceDiagram\n  A ->> B');
    expect(error.message).toContain('bad token');
  });

  it('carries the diagram type on UnsupportedDiagramError', () => {
    const error = new UnsupportedDiagramError('sequence');

    expect(error.code).toBe('UNSUPPORTED_DIAGRAM');
    expect(error.diagramType).toBe('sequence');
  });

  it('recognises its own errors by code rather than by prototype', () => {
    const fromAnotherBundleCopy = { code: 'DIAGRAM_PARSE_ERROR', message: 'elsewhere' };

    expect(isMermaidReplacementError(new DiagramParseError('x'))).toBe(true);
    expect(isMermaidReplacementError(fromAnotherBundleCopy)).toBe(true);
    expect(isMermaidReplacementError(new Error('plain'))).toBe(false);
    expect(isMermaidReplacementError(null)).toBe(false);
  });
});
