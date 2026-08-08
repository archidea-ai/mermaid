/**
 * The variable vocabulary every scenario-family renderer shares.
 *
 * `{{name}}` / `{{name = value}}` / `{{name : Type}}` is one language whatever
 * diagram it appears in, so it is defined once here rather than per renderer.
 */

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
