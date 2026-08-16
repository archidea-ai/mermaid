import { describe, expect, it } from 'vitest';
import { decodeHash, encodeSource, selectionFromHash, shareUrl } from './share-link';
import { examples } from './examples';

const roundTrip = (source: string) => decodeHash(`#${encodeSource(source)}`);

describe('share-link', () => {
  it('round-trips a diagram', () => {
    const source = 'flowchart TD\n    A[Start] --> B{Ok?}\n    B -- yes --> C([Done])';

    expect(roundTrip(source)).toBe(source);
  });

  it('round-trips text the alphabet does not cover', () => {
    const source = 'sequenceDiagram\n    Küche->>Café: ☕ — naïve\n    Café-->>Küche: 日本語';

    expect(roundTrip(source)).toBe(source);
  });

  it('survives a `+` having been turned into a space in transit', () => {
    const source = examples[3]!.source;
    const mangled = `#${encodeSource(source)}`.replace(/\+/g, ' ');

    expect(decodeHash(mangled)).toBe(source);
  });

  it('reads a fragment written without the leading hash', () => {
    expect(decodeHash(encodeSource('flowchart LR\n  A --> B'))).toBe('flowchart LR\n  A --> B');
  });

  it.each([
    ['empty', ''],
    ['bare hash', '#'],
    ['no payload', '#c='],
    ['an unknown key', '#c2=N4IgLghgxg'],
    ['someone else’s fragment', '#section-two'],
    ['garbage in the payload', '#c=!!!!not-lz-string!!!!'],
  ])('returns null for %s', (_name, hash) => {
    expect(decodeHash(hash)).toBeNull();
  });

  it('compresses well below the base64 of the same source', () => {
    const source = examples[3]!.source;

    expect(source.length).toBeGreaterThan(2000);
    expect(encodeSource(source).length).toBeLessThan(
      Buffer.from(source, 'utf8').toString('base64').length,
    );
  });

  it('keeps the path when the app is served from a subpath', () => {
    const url = shareUrl('flowchart LR\n  A --> B', 'https://archidea-ai.github.io/mermaid/#c=old');

    expect(url.startsWith('https://archidea-ai.github.io/mermaid/#c=')).toBe(true);
    expect(decodeHash(new URL(url).hash)).toBe('flowchart LR\n  A --> B');
  });

  describe('selectionFromHash', () => {
    it('falls back to the first example when there is no fragment', () => {
      expect(selectionFromHash('')).toEqual({ exampleId: examples[0]!.id, edits: {} });
    });

    it('falls back to the first example when the fragment is unreadable', () => {
      expect(selectionFromHash('#c=!!!!')).toEqual({ exampleId: examples[0]!.id, edits: {} });
    });

    it('selects the example a shared chart happens to be', () => {
      const release = examples.find((entry) => entry.id === 'release-flowchart')!;

      expect(selectionFromHash(`#${encodeSource(release.source)}`)).toEqual({
        exampleId: release.id,
        edits: {},
      });
    });

    it('seeds anything else as an edit of the first example', () => {
      const source = 'flowchart TD\n    Shared --> Chart';

      expect(selectionFromHash(`#${encodeSource(source)}`)).toEqual({
        exampleId: examples[0]!.id,
        edits: { [examples[0]!.id]: source },
      });
    });
  });
});
