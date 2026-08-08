import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { VariableBindings } from '@archidea-ai/mermaid-scenario';
import type { RichText, TextSegment } from '../parser/ast';

export interface RichLabelProps {
  text: RichText;
  /**
   * When given, a bound reference renders as its **value** rather than its name.
   *
   * The modern view is for someone being walked through a running system: they
   * care that the role is `admin`, not that the variable is called `role`. The
   * classic view omits this and shows names, because it describes the protocol
   * rather than one run of it.
   */
  values?: VariableBindings;
}

export function RichLabel({ text, values }: RichLabelProps) {
  return (
    <>
      {text.segments.map((segment: TextSegment, index) => {
        if (segment.kind !== 'variable') {
          return <Fragment key={index}>{withBreaks(segment.value)}</Fragment>;
        }

        const bound = values?.get(segment.name);
        const resolved = bound !== undefined;

        return (
          <span
            key={index}
            className="seq-var"
            data-variable={segment.name}
            data-resolved={resolved}
            // The name stays discoverable on hover once the value replaces it.
            title={resolved ? segment.name : undefined}
          >
            {resolved ? String(bound) : segment.name}
          </span>
        );
      })}
    </>
  );
}

/**
 * A fragment label is a raw condition, so it carries whatever the author wrote —
 * including type annotations that are meaningful to the parser and noise to a
 * reader. `{{sendSms : boolean}}` displays as `sendSms`.
 */
export function humaniseLabel(label: string): string {
  return label.replace(/\{\{([^}]*)\}\}/g, (_match, body: string) => {
    const [name] = body.split(/[:=]/);
    return (name ?? body).trim();
  });
}

const BREAK = /<br\s*\/?>/i;

/**
 * `<br/>` is a line break in mermaid text, not four literal characters.
 *
 * Real diagrams lean on it heavily to keep participant names and long messages
 * readable, and rendering it verbatim made every such label look broken.
 */
export function withBreaks(value: string): ReactNode {
  if (!BREAK.test(value)) return value;

  return value.split(BREAK).map((part, index, all) => (
    <Fragment key={index}>
      {part}
      {index < all.length - 1 ? <br /> : null}
    </Fragment>
  ));
}
