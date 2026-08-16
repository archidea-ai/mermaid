// Only this package's own chrome. The --seq-* tokens come from the sequence
// package's theme.css, which the host imports once for all renderers — a
// package force-importing another's stylesheet is coupling we do not need.
import './lib/c4.css';

export { c4Renderer } from './lib/renderer';
export { C4Surface } from './lib/components/surface';
export { C4Chart } from './lib/components/chart';

export { parse, C4ParseError } from './lib/parser/parse';
export type {
  C4Ast,
  C4Boundary,
  C4DiagramKind,
  C4Element,
  C4Hint,
  C4Kind,
  C4Relation,
  C4Style,
  C4Variant,
} from './lib/parser/ast';
export { ancestorsOf, buildTree, descendantsOf, elementCountOf } from './lib/model/tree';
export type { C4Box, C4Tree } from './lib/model/tree';
export { allBoundaryIds, isVisible, revealFor, visibleOwner } from './lib/model/collapse';
export { buildLinks } from './lib/model/links';
export type { C4Link, C4LinkSet } from './lib/model/links';
export { insetEndpoints } from './lib/model/geometry';
export { orderMembers } from './lib/model/order';
export { computeLit } from './lib/model/selection';
export type { C4Lit, C4Selection, C4SelectionKind } from './lib/model/selection';
export { C4_DIAGRAM_TYPE, fromElementRef, isC4Selection, toElementRef } from './lib/model/refs';
export type { C4ElementRef, C4SelectionData } from './lib/model/refs';
export { orderedRelations, useStepController } from './lib/model/run';
