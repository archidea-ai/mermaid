import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { orderedRelations } from './run';

describe('orderedRelations', () => {
  it('walks a dynamic diagram in its numbered order, not its written order', () => {
    const ast = parse(`C4Dynamic
    RelIndex(3, c, d, "third")
    RelIndex(1, a, b, "first")
    RelIndex(2, b, c, "second")`);

    expect(orderedRelations(ast).map((relation) => relation.label)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('falls back to declaration order where no number was given', () => {
    const ast = parse('C4Dynamic\nRel(a, b, "one")\nRel(b, c, "two")');
    expect(orderedRelations(ast).map((r) => r.label)).toEqual(['one', 'two']);
  });

  it('is empty for a static diagram, which is a map rather than a run', () => {
    expect(orderedRelations(parse('C4Context\nRel(a, b, "x")'))).toEqual([]);
  });
});
