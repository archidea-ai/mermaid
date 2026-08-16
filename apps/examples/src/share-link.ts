import LZString from 'lz-string';
import { examples, type DiagramExample } from './examples';

/**
 * The chart lives in the URL fragment so a link is the whole share mechanism —
 * no server, no store, no id to resolve. The fragment is never sent to the
 * host, which is the honest place for a document someone is still editing.
 *
 * `c` is the key *and* the version marker. A fragment we do not recognise is
 * ignored rather than guessed at, so a future `c2=` can land beside it without
 * breaking the links already in people's messages.
 */
const KEY = 'c';

export function encodeSource(source: string): string {
  return `${KEY}=${LZString.compressToEncodedURIComponent(source)}`;
}

/** The decoded source, or `null` for a fragment that is not one of ours. */
export function decodeHash(hash: string): string | null {
  const match = new RegExp(`^#?${KEY}=(.*)$`).exec(hash);
  if (!match) return null;

  // lz-string's URI-safe alphabet includes `+`, which anything treating the
  // fragment as a query string turns into a space. Turn it back before
  // decompressing, or a link that passed through such a thing reads as corrupt.
  const payload = match[1]!.replace(/ /g, '+');
  if (!payload) return null;

  let source: string | null = null;
  try {
    source = LZString.decompressFromEncodedURIComponent(payload);
  } catch {
    return null;
  }

  return source ? source : null;
}

/** `base` is a full URL — the app is served from a subpath, so origin is not enough. */
export function shareUrl(source: string, base: string): string {
  const url = new URL(base);
  url.hash = encodeSource(source);
  return url.toString();
}

export interface Selection {
  readonly exampleId: string;
  /** Seeded into the edits map, so an arriving chart is editable like any other. */
  readonly edits: Record<string, string>;
}

/**
 * What the app should open with. A shared chart that *is* an example selects
 * that example cleanly; anything else arrives as an edit of the first one.
 * No fragment, or an unreadable one, is the plain default — a bad link never
 * costs the visitor the page.
 */
export function selectionFromHash(
  hash: string,
  all: readonly DiagramExample[] = examples,
): Selection {
  const first = all[0]!;
  const source = decodeHash(hash);
  if (source === null) return { exampleId: first.id, edits: {} };

  const match = all.find((entry) => entry.source === source);
  if (match) return { exampleId: match.id, edits: {} };

  return { exampleId: first.id, edits: { [first.id]: source } };
}
