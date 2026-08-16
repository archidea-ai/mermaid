/** What an element is, independent of how it was drawn. */
export type C4Kind = 'person' | 'system' | 'container' | 'component' | 'node';

/** The shape suffix an author reached for: SystemDb, ContainerQueue, and so on. */
export type C4Variant = 'plain' | 'db' | 'queue';

/** Author-declared colour, arriving from an Update*Style directive. */
export interface C4Style {
  readonly background: string | null;
  readonly border: string | null;
  readonly text: string | null;
}

export interface C4Element {
  /** The author's alias. Stable, and what every relation refers to. */
  readonly id: string;
  readonly kind: C4Kind;
  readonly label: string;
  readonly technology: string | null;
  readonly description: string | null;
  readonly external: boolean;
  readonly variant: C4Variant;
  readonly tags: readonly string[];
  readonly link: string | null;
  /** The boundary that declared it, if any. */
  readonly parent: string | null;
  readonly style: C4Style | null;
}

export interface C4Boundary {
  readonly id: string;
  readonly label: string;
  /** "Enterprise", "System", a Node's $type — whatever the author gave. */
  readonly type: string | null;
  /** A Deployment_Node is a boundary that is also a box in its own right. */
  readonly isNode: boolean;
  readonly description: string | null;
  readonly parent: string | null;
  readonly tags: readonly string[];
  readonly style: C4Style | null;
}

/** Kept on the AST, ignored by the arc layer. See the spec's §3.2. */
export type C4Hint = 'up' | 'down' | 'left' | 'right';

export interface C4Relation {
  /** Derived from source position, never an array index. */
  readonly id: string;
  readonly line: number;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly technology: string | null;
  readonly description: string | null;
  readonly bidirectional: boolean;
  /** RelIndex's number, or declaration order in a C4Dynamic. Null elsewhere. */
  readonly index: number | null;
  readonly hint: C4Hint | null;
  readonly style: C4Style | null;
}

export type C4DiagramKind = 'context' | 'container' | 'component' | 'dynamic' | 'deployment';

export interface C4Ast {
  readonly kind: C4DiagramKind;
  readonly title: string | null;
  readonly elements: readonly C4Element[];
  readonly boundaries: readonly C4Boundary[];
  readonly relations: readonly C4Relation[];
  /** Statements understood to be inert, kept so nothing vanishes silently. */
  readonly ignored: readonly { readonly text: string; readonly line: number }[];
}
