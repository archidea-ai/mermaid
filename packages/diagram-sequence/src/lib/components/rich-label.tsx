import type { VariableBindings } from '../model/bindings';
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
        if (segment.kind !== 'variable') return <span key={index}>{segment.value}</span>;

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
