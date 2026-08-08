import type { Condition } from '@archidea-ai/mermaid-scenario';
import type { RichText } from '@archidea-ai/mermaid-scenario';

/** `[*]` at the start of a transition means entry; at the end, exit. */
export const TERMINAL = '[*]';

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
