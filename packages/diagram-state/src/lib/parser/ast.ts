import type { Condition } from '@archidea-ai/mermaid-scenario';
import type { RichText } from '@archidea-ai/mermaid-scenario';

/** `[*]` at the start of a transition means entry; at the end, exit. */
export const TERMINAL = '[*]';

/**
 * `[*]` is a special state, not an ordinary one.
 *
 * The same token is the machine's start and its end, and each composite scopes
 * its own as `[*]@Parent`. Standing on one means the run has finished — it must
 * never be treated as a state you can leave, or reaching the end offered the
 * transitions leaving the *start*.
 */
export function isTerminal(stateId: string | null | undefined): boolean {
  return typeof stateId === 'string' && stateId.startsWith(TERMINAL);
}

/** The composite a scoped terminal belongs to, or null for the machine's own. */
export function terminalOwner(stateId: string): string | null {
  return stateId.startsWith(`${TERMINAL}@`) ? stateId.slice(TERMINAL.length + 1) : null;
}

/**
 * Substates have ends too, and they are not the same end.
 *
 * `[*]` inside `Testing` finishes Testing, after which the run may well carry
 * on in the machine around it — so it says which machine it ended.
 */
export function endLabel(stateId: string, labelOf: (id: string) => string | undefined): string {
  const owner = terminalOwner(stateId);
  if (!owner) return 'End';
  return `End of ${labelOf(owner) ?? owner}`;
}

export type StateKind = 'state' | 'choice' | 'fork' | 'join' | 'terminal';

export interface StateNode {
  readonly id: string;
  readonly label: string;
  readonly kind: StateKind;
  /** Composite states own an interior the viewer can drill into. */
  readonly children: readonly string[];
  readonly parent: string | null;
  readonly note: RichText | null;
}

export interface StateTransition {
  readonly id: string;
  readonly line: number;
  readonly from: string;
  readonly to: string;
  readonly label: RichText | null;
  /** Parsed from the label when it reads as an expression, else null. */
  readonly condition: Condition | null;
}

export interface StateDiagramAst {
  readonly states: readonly StateNode[];
  readonly stateById: ReadonlyMap<string, StateNode>;
  readonly transitions: readonly StateTransition[];
  readonly direction: 'TB' | 'BT' | 'LR' | 'RL';
  readonly ignored: readonly { readonly text: string; readonly line: number }[];
}
