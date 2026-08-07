import type { RichText, TextSegment } from '../parser/ast';

/**
 * Renders `{{name}}` references as chips so a value reads as data, not prose.
 *
 * Shared by the canvas and the sidebar: showing a chip in one place and raw
 * braces in the other makes the same message look like two different things.
 */
export function RichLabel({ text }: { text: RichText }) {
  return (
    <>
      {text.segments.map((segment: TextSegment, index) =>
        segment.kind === 'variable' ? (
          <span key={index} className="seq-var" data-variable={segment.name}>
            {segment.name}
          </span>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </>
  );
}
