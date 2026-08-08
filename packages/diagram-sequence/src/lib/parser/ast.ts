import type { ArrowKind, FragmentKeyword, NotePlacement } from './tokenize';
import type { Condition } from '@archidea-ai/mermaid-scenario';

export type VariableType = 'string' | 'number' | 'boolean' | { union: readonly string[] };

export interface VariableDeclaration {
  readonly name: string;
  readonly declaredType: VariableType | null;
  /** True when this occurrence assigns a value rather than reading one. */
  readonly assigns: boolean;
}

export interface VariableEffect {
  readonly name: string;
  readonly value: string | number | boolean;
}

export type TextSegment =
  | { readonly kind: 'text'; readonly value: string }
  | {
      readonly kind: 'variable';
      readonly name: string;
      readonly declaredType: VariableType | null;
    };

export interface RichText {
  readonly raw: string;
  readonly segments: readonly TextSegment[];
  readonly reads: readonly VariableDeclaration[];
  readonly effects: readonly VariableEffect[];
}

export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly kind: 'participant' | 'actor';
  readonly boxId: string | null;
  readonly declared: boolean;
}

export interface ParticipantBox {
  readonly id: string;
  readonly label: string;
  readonly color: string | null;
  readonly participantIds: readonly string[];
}

export interface Message {
  readonly type: 'message';
  readonly id: string;
  readonly line: number;
  readonly from: string;
  readonly to: string;
  readonly arrow: ArrowKind;
  readonly activate: boolean;
  readonly deactivate: boolean;
  readonly text: RichText;
}

export interface Note {
  readonly type: 'note';
  readonly id: string;
  readonly line: number;
  readonly placement: NotePlacement;
  readonly targets: readonly string[];
  readonly text: RichText;
}

export interface ActivateStatement {
  readonly type: 'activate' | 'deactivate';
  readonly id: string;
  readonly line: number;
  readonly target: string;
}

export interface LifecycleStatement {
  readonly type: 'create' | 'destroy';
  readonly id: string;
  readonly line: number;
  readonly target: string;
}

export interface FragmentBranch {
  readonly id: string;
  readonly label: string;
  readonly condition: Condition | null;
  readonly statements: readonly Statement[];
}

export interface Fragment {
  readonly type: 'fragment';
  readonly id: string;
  readonly line: number;
  readonly kind: FragmentKeyword;
  readonly color: string | null;
  readonly branches: readonly FragmentBranch[];
}

export type Statement = Message | Note | Fragment | ActivateStatement | LifecycleStatement;

export interface SequenceDiagramAst {
  readonly participants: readonly Participant[];
  readonly boxes: readonly ParticipantBox[];
  readonly statements: readonly Statement[];
  readonly autonumber: { readonly enabled: boolean; readonly start: number; readonly step: number };
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly ignored: readonly { readonly text: string; readonly line: number }[];
}
