import './lib/theme.css';

export { sequenceRenderer } from './lib/renderer';
export { SequenceDiagramSurface } from './lib/components/surface';
export { SequenceCanvas } from './lib/components/canvas';
export {
  DecisionPanel,
  NotePanel,
  SequenceToolbar,
  StepList,
  VariablePanel,
} from './lib/components/panels';

export { parse } from './lib/parser/parse';
export { SequenceParseError } from './lib/parser/errors';
export { parseRichText } from './lib/parser/variables';
export type {
  Fragment,
  FragmentBranch,
  Message,
  Note,
  Participant,
  ParticipantBox,
  RichText,
  SequenceDiagramAst,
  Statement,
  TextSegment,
  VariableDeclaration,
  VariableEffect,
  VariableType,
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

export { createBindings, replayEffects } from './lib/model/bindings';
export type { VariableBindings, VariableValue } from './lib/model/bindings';

export { conditionVariables, evaluateCondition, parseCondition } from './lib/model/conditions';
export type { Condition, Tristate } from './lib/model/conditions';

export { useSequenceRun } from './lib/model/controller';
export type { SequenceRunController, VariablePrompt } from './lib/model/controller';

export { computeEmphasis } from './lib/layout/emphasis';
export type { Emphasis, EmphasisMap } from './lib/layout/emphasis';

export { DEFAULT_LAYOUT_OPTIONS, layout } from './lib/layout/layout';
export type { SequenceLayout } from './lib/layout/layout';

export { createCanvasMeasurer, createEstimateMeasurer, DEFAULT_FONT } from './lib/layout/measure';
export type { FontSpec, TextMeasurer } from './lib/layout/measure';
