import { RichLabel } from '@archidea-ai/mermaid-diagram-sequence';
import type { VariableBindings } from '@archidea-ai/mermaid-scenario';
import type { StateDiagramAst } from '../parser/ast';

export interface StateNoteProps {
  ast: StateDiagramAst;
  stateId: string;
  values: VariableBindings;
}

/**
 * A state's own note, shown beneath its name.
 *
 * `note right of X` is the author telling you something about standing in X, so
 * it belongs on X — and only while you are there. Attaching it to every mention
 * would repeat the same aside down the whole chart; attaching it to the state
 * you are actually in says it once, where it applies.
 */
export function StateNote({ ast, stateId, values }: StateNoteProps) {
  const note = ast.stateById.get(stateId)?.note;
  if (!note) return null;

  return (
    <span className="state-chip__note">
      <RichLabel text={note} values={values} />
    </span>
  );
}
