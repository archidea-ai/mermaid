import './lib/theme.css';

// The shared run vocabulary, re-exported so consumers need one import.
export {
  conditionDeclarations,
  conditionVariables,
  createBindings,
  evaluateCondition,
  parseCondition,
  parseRichText,
  replayEffects,
} from '@archidea-ai/mermaid-scenario';
export type {
  Condition,
  RichText,
  TextSegment,
  Tristate,
  VariableBindings,
  VariableDeclaration,
  VariableEffect,
  VariableType,
  VariableValue,
} from '@archidea-ai/mermaid-scenario';

export { sequenceRenderer } from './lib/renderer';
export { SequenceDiagramSurface } from './lib/components/surface';
export { SequenceCanvas } from './lib/components/canvas';
export { SequenceStage } from './lib/components/stage';

// shadcn primitives, so an app shell can use the same chrome as the renderer.
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './lib/ui/select';
export { RichLabel, humaniseLabel, withBreaks } from './lib/components/rich-label';
export { computeArc } from './lib/layout/stage';
export type { StageArc, StagePoint } from './lib/layout/stage';
export { useAnchors } from './lib/layout/use-anchors';
export type { AnchorMap } from './lib/layout/use-anchors';
export { isPhaseBanner } from './lib/model/notes';
export {
  DecisionPanel,
  NotePanel,
  SequenceToolbar,
  StepList,
  VariablePanel,
} from './lib/components/panels';
export type { SequenceVariant } from './lib/components/panels';

export { parse } from './lib/parser/parse';
export { SequenceParseError } from './lib/parser/errors';
export type {
  Fragment,
  FragmentBranch,
  Message,
  Note,
  Participant,
  ParticipantBox,
  SequenceDiagramAst,
  Statement,
} from './lib/parser/ast';

export { buildTimeline } from './lib/model/timeline';
export type {
  Decision,
  DecisionMap,
  FragmentPathEntry,
  PendingDecision,
  SkippedRegion,
  Step,
  StepKind,
  Timeline,
} from './lib/model/timeline';

export { useSequenceRun } from './lib/model/controller';
export type { SequenceRunController, VariablePrompt } from './lib/model/controller';

export { computeEmphasis } from './lib/layout/emphasis';
export type { Emphasis, EmphasisMap } from './lib/layout/emphasis';

export { computeGrid, HEADER_ROW } from './lib/layout/grid';
export type {
  GridActivation,
  GridColumn,
  GridFragment,
  GridMessage,
  GridNote,
  GridRow,
  SequenceGrid,
} from './lib/layout/grid';
