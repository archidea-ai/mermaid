export type MermaidErrorCode =
  'UPSTREAM_NOT_INSTALLED' | 'DIAGRAM_PARSE_ERROR' | 'UNSUPPORTED_DIAGRAM';

const ERROR_CODES = new Set<string>([
  'UPSTREAM_NOT_INSTALLED',
  'DIAGRAM_PARSE_ERROR',
  'UNSUPPORTED_DIAGRAM',
]);

export class MermaidReplacementError extends Error {
  readonly code: MermaidErrorCode;

  constructor(code: MermaidErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
    this.name = new.target.name;
  }
}

export class UpstreamNotInstalledError extends MermaidReplacementError {
  constructor(cause?: unknown) {
    super(
      'UPSTREAM_NOT_INSTALLED',
      'Upstream "mermaid" could not be loaded. It is an optional peer dependency of ' +
        '@archidea-ai/mermaid and is required for diagram types that have no native ' +
        'renderer registered. Install it with: pnpm add mermaid',
      cause,
    );
  }
}

export class DiagramParseError extends MermaidReplacementError {
  readonly text: string;

  constructor(text: string, cause?: unknown) {
    super('DIAGRAM_PARSE_ERROR', `Failed to parse diagram: ${describeCause(cause)}`, cause);
    this.text = text;
  }
}

export class UnsupportedDiagramError extends MermaidReplacementError {
  readonly diagramType: string;

  constructor(diagramType: string, message?: string) {
    super(
      'UNSUPPORTED_DIAGRAM',
      message ?? `No renderer could render diagram type "${diagramType}".`,
    );
    this.diagramType = diagramType;
  }
}

/**
 * Structural rather than instanceof: two copies of this package in one bundle
 * would break prototype checks, and consumers still need to discriminate.
 */
export function isMermaidReplacementError(value: unknown): value is MermaidReplacementError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string' &&
    ERROR_CODES.has((value as { code: string }).code)
  );
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  return 'unknown error';
}
