export interface SourceLine {
  readonly text: string;
  /** 1-based line number in the original source. */
  readonly number: number;
  readonly indent: number;
}

export interface PreprocessResult {
  readonly lines: readonly SourceLine[];
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

const DIRECTIVE = /%%\{.*?\}%%/g;

/**
 * Strips frontmatter, directives, comments and blank lines, keeping the
 * original line numbers so parse errors point at real source.
 */
export function preprocess(source: string): PreprocessResult {
  const raw = source.replace(/\r\n?/g, '\n').split('\n');
  const frontmatter: Record<string, unknown> = {};
  const lines: SourceLine[] = [];

  let index = 0;

  // Frontmatter only counts when --- is the first non-blank line.
  while (index < raw.length && raw[index]!.trim() === '') index += 1;
  if (raw[index]?.trim() === '---') {
    index += 1;
    while (index < raw.length && raw[index]!.trim() !== '---') {
      const separator = raw[index]!.indexOf(':');
      if (separator > 0) {
        const key = raw[index]!.slice(0, separator).trim();
        const value = raw[index]!.slice(separator + 1).trim();
        if (key) frontmatter[key] = coerce(value);
      }
      index += 1;
    }
    index += 1; // closing ---
  } else {
    index = 0;
  }

  for (; index < raw.length; index += 1) {
    const original = raw[index]!;
    let text = original.replace(DIRECTIVE, '');

    const trimmedStart = text.trimStart();
    if (trimmedStart.startsWith('%%')) continue;

    // A trailing comment only counts before the message-text colon; after it,
    // %% is literal content the author meant to show.
    const colon = text.indexOf(':');
    const comment = text.indexOf('%%');
    if (comment !== -1 && (colon === -1 || comment < colon)) {
      text = text.slice(0, comment);
    }

    if (text.trim() === '') continue;

    lines.push({
      text: text.trim(),
      number: index + 1,
      indent: original.length - original.trimStart().length,
    });
  }

  return { lines, frontmatter: Object.freeze(frontmatter) };
}

function coerce(value: string): unknown {
  const unquoted = value.replace(/^["']|["']$/g, '');
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (unquoted !== '' && !Number.isNaN(Number(unquoted))) return Number(unquoted);
  return unquoted;
}
