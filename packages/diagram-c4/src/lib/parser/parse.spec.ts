import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { C4ParseError } from './parse';

describe('parse — the header', () => {
  it('reads each of the five C4 headers', () => {
    expect(parse('C4Context').kind).toBe('context');
    expect(parse('C4Container').kind).toBe('container');
    expect(parse('C4Component').kind).toBe('component');
    expect(parse('C4Dynamic').kind).toBe('dynamic');
    expect(parse('C4Deployment').kind).toBe('deployment');
  });

  it('reads the title, quoted or bare', () => {
    expect(parse('C4Context\n    title Big Bank plc').title).toBe('Big Bank plc');
    expect(parse('C4Context\n    title "Big Bank plc"').title).toBe('Big Bank plc');
  });

  it('has no title when none was given', () => {
    expect(parse('C4Context').title).toBeNull();
  });

  it('skips blank lines and %% comments before the header', () => {
    expect(parse('\n%% a note to the reader\nC4Context').kind).toBe('context');
  });

  it('refuses a source that is not C4 at all, so the proxy can take it', () => {
    expect(() => parse('sequenceDiagram\n  A->>B: hi')).toThrow(C4ParseError);
  });

  it('refuses an empty source', () => {
    expect(() => parse('   \n\n')).toThrow(C4ParseError);
  });
});
