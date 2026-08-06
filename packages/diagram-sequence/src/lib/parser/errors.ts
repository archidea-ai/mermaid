import { MermaidReplacementError } from '@archidea-ai/mermaid-core';

/**
 * A diagram we cannot parse is not fatal: the renderer catches this and falls
 * back to the proxy, so the package never renders worse than upstream.
 */
export class SequenceParseError extends MermaidReplacementError {
  readonly line: number;
  readonly lineText: string;

  constructor(message: string, line: number, lineText: string) {
    super('DIAGRAM_PARSE_ERROR', `${message} (line ${line}: "${lineText}")`);
    this.line = line;
    this.lineText = lineText;
  }
}
