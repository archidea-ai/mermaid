import { conditionVariables, evaluateCondition } from './conditions';
import { createBindings } from './bindings';
import type { VariableBindings } from './bindings';
import type {
  Fragment,
  FragmentBranch,
  Note,
  SequenceDiagramAst,
  Statement,
  VariableDeclaration,
  VariableEffect,
} from '../parser/ast';

export type StepKind = 'message' | 'note' | 'activate' | 'deactivate' | 'create' | 'destroy';

export interface FragmentPathEntry {
  readonly fragmentId: string;
  readonly branchId: string;
  readonly kind: Fragment['kind'];
  readonly label: string;
  readonly iteration: number | null;
}

export interface Step {
  readonly id: string;
  readonly index: number;
  readonly kind: StepKind;
  readonly node: Statement;
  /** Participants to highlight while this step is current. */
  readonly involved: readonly string[];
  /** Enclosing fragment branches, outermost first. */
  readonly path: readonly FragmentPathEntry[];
  readonly ordinal: number | null;
  readonly notes: readonly Note[];
  readonly effects: readonly VariableEffect[];
  /** Non-assigning variable reads, so the controller can prompt for unbound ones. */
  readonly reads: readonly VariableDeclaration[];
}

export type Decision =
  | { readonly kind: 'branch'; readonly fragmentId: string; readonly branchId: string }
  | { readonly kind: 'include'; readonly fragmentId: string; readonly included: boolean }
  | { readonly kind: 'iterations'; readonly fragmentId: string; readonly count: number }
  | { readonly kind: 'lanes'; readonly fragmentId: string; readonly branchIds: readonly string[] };

export type DecisionMap = ReadonlyMap<string, Decision>;

export type PendingDecision =
  | {
      readonly kind: 'branch' | 'lanes' | 'include' | 'iterations';
      readonly fragment: Fragment;
      readonly reason: 'unresolved';
    }
  | {
      readonly kind: 'variable';
      readonly fragment: Fragment;
      readonly names: readonly string[];
      readonly reason: 'unknown-condition';
    };

export interface SkippedRegion {
  readonly fragmentId: string;
  readonly branchId: string;
  readonly kind: Fragment['kind'];
  readonly label: string;
  readonly statementCount: number;
}

export interface Timeline {
  readonly steps: readonly Step[];
  readonly pending: PendingDecision | null;
  readonly skipped: readonly SkippedRegion[];
}

/**
 * The visible sequence of steps is a pure function of the AST, the viewer's
 * decisions and the current bindings. Nothing here is stored as mutable state:
 * picking a branch or entering a value re-derives the timeline from scratch,
 * which is what makes "optionals choose their own way" a recomputation rather
 * than a patch.
 */
export function buildTimeline(
  ast: SequenceDiagramAst,
  decisions: DecisionMap = new Map(),
  seedBindings: VariableBindings = createBindings(),
): Timeline {
  const steps: Step[] = [];
  const skipped: SkippedRegion[] = [];
  let pending: PendingDecision | null = null;
  let bindings = seedBindings;
  let ordinal = ast.autonumber.start;

  const push = (partial: Omit<Step, 'index' | 'ordinal'> & { countsForOrdinal: boolean }): void => {
    const { countsForOrdinal, ...rest } = partial;
    steps.push({
      ...rest,
      index: steps.length,
      ordinal: ast.autonumber.enabled && countsForOrdinal ? ordinal : null,
    });
    if (ast.autonumber.enabled && countsForOrdinal) ordinal += ast.autonumber.step;
    for (const effect of rest.effects) bindings = bindings.with(effect.name, effect.value);
  };

  const walk = (statements: readonly Statement[], path: readonly FragmentPathEntry[]): void => {
    for (const statement of statements) {
      if (pending) return;

      switch (statement.type) {
        case 'message': {
          const suffix = pathSuffix(path);
          push({
            id: `${statement.id}${suffix}`,
            kind: 'message',
            node: statement,
            involved: [statement.from, statement.to],
            path,
            notes: [],
            effects: statement.text.effects,
            reads: statement.text.reads.filter((read) => !read.assigns),
            countsForOrdinal: true,
          });

          // The +/- shorthand emits its own activation step so stepping shows it.
          if (statement.activate || statement.deactivate) {
            push({
              id: `${statement.id}${suffix}-${statement.activate ? 'act' : 'deact'}`,
              kind: statement.activate ? 'activate' : 'deactivate',
              node: statement,
              involved: [statement.to],
              path,
              notes: [],
              effects: [],
              reads: [],
              countsForOrdinal: false,
            });
          }
          break;
        }

        case 'note':
          push({
            id: `${statement.id}${pathSuffix(path)}`,
            kind: 'note',
            node: statement,
            involved: statement.targets,
            path,
            notes: [statement],
            effects: statement.text.effects,
            reads: statement.text.reads.filter((read) => !read.assigns),
            countsForOrdinal: false,
          });
          break;

        case 'activate':
        case 'deactivate':
        case 'create':
        case 'destroy':
          push({
            id: `${statement.id}${pathSuffix(path)}`,
            kind: statement.type,
            node: statement,
            involved: [statement.target],
            path,
            notes: [],
            effects: [],
            reads: [],
            countsForOrdinal: false,
          });
          break;

        case 'fragment':
          walkFragment(statement, path);
          break;
      }
    }
  };

  const walkFragment = (fragment: Fragment, path: readonly FragmentPathEntry[]): void => {
    const resolution = resolveFragment(fragment, decisions, bindings);

    if (resolution.pending) {
      pending = resolution.pending;
      return;
    }

    for (const branch of fragment.branches) {
      if (!resolution.selected.includes(branch.id)) {
        skipped.push({
          fragmentId: fragment.id,
          branchId: branch.id,
          kind: fragment.kind,
          label: branch.label,
          statementCount: branch.statements.length,
        });
      }
    }

    const selectedBranches = fragment.branches.filter((branch) =>
      resolution.selected.includes(branch.id),
    );

    if (fragment.kind === 'par' && selectedBranches.length > 1) {
      interleaveLanes(fragment, selectedBranches, path);
      return;
    }

    for (let iteration = 0; iteration < resolution.iterations; iteration += 1) {
      for (const branch of selectedBranches) {
        walk(branch.statements, [
          ...path,
          entryFor(fragment, branch, resolution.iterations > 1 ? iteration : null),
        ]);
      }
    }
  };

  /**
   * Parallel lanes are genuinely concurrent, so stepping walks them round-robin
   * by statement. Running one lane to completion would hide the parallelism.
   */
  const interleaveLanes = (
    fragment: Fragment,
    branches: readonly FragmentBranch[],
    path: readonly FragmentPathEntry[],
  ): void => {
    const longest = Math.max(...branches.map((branch) => branch.statements.length));

    for (let position = 0; position < longest; position += 1) {
      for (const branch of branches) {
        const statement = branch.statements[position];
        if (!statement) continue;
        walk([statement], [...path, entryFor(fragment, branch, null)]);
        if (pending) return;
      }
    }
  };

  walk(ast.statements, []);

  return { steps, pending, skipped };
}

function entryFor(
  fragment: Fragment,
  branch: FragmentBranch,
  iteration: number | null,
): FragmentPathEntry {
  return {
    fragmentId: fragment.id,
    branchId: branch.id,
    kind: fragment.kind,
    label: branch.label,
    iteration,
  };
}

/** Distinct ids per loop iteration and per branch, so step identity is stable. */
function pathSuffix(path: readonly FragmentPathEntry[]): string {
  const parts = path
    .filter((entry) => entry.iteration !== null)
    .map((entry) => `${entry.branchId}#${entry.iteration}`);
  return parts.length > 0 ? `@${parts.join('/')}` : '';
}

interface FragmentResolution {
  selected: string[];
  iterations: number;
  pending: PendingDecision | null;
}

/**
 * Resolution order, first match wins: an explicit viewer decision, then a
 * condition that evaluates true, then the else/option fallback, then the
 * per-kind default. An `unknown` condition never falls through to else —
 * silently defaulting on missing data is what would make the walkthrough
 * untrustworthy, so it prompts instead.
 */
function resolveFragment(
  fragment: Fragment,
  decisions: DecisionMap,
  bindings: VariableBindings,
): FragmentResolution {
  const decision = decisions.get(fragment.id);
  const all = fragment.branches.map((branch) => branch.id);
  const first = all[0]!;

  switch (fragment.kind) {
    case 'alt':
    case 'critical': {
      if (decision?.kind === 'branch') {
        return { selected: [decision.branchId], iterations: 1, pending: null };
      }

      let sawUnknown: string[] | null = null;
      for (const branch of fragment.branches) {
        if (!branch.condition) continue;
        const verdict = evaluateCondition(branch.condition, bindings);
        if (verdict === true) return { selected: [branch.id], iterations: 1, pending: null };
        if (verdict === 'unknown' && !sawUnknown) {
          sawUnknown = conditionVariables(branch.condition).filter((name) => !bindings.has(name));
        }
      }

      if (sawUnknown && sawUnknown.length > 0) {
        return {
          selected: [],
          iterations: 1,
          pending: { kind: 'variable', fragment, names: sawUnknown, reason: 'unknown-condition' },
        };
      }

      const conditioned = fragment.branches.filter((branch) => branch.condition);
      if (conditioned.length > 0) {
        const fallback = fragment.branches.find((branch) => !branch.condition);
        return { selected: fallback ? [fallback.id] : [], iterations: 1, pending: null };
      }

      return {
        selected: [],
        iterations: 1,
        pending: { kind: 'branch', fragment, reason: 'unresolved' },
      };
    }

    case 'opt':
    case 'break': {
      if (decision?.kind === 'include') {
        return { selected: decision.included ? [first] : [], iterations: 1, pending: null };
      }

      const condition = fragment.branches[0]?.condition;
      if (condition) {
        const verdict = evaluateCondition(condition, bindings);
        if (verdict === 'unknown') {
          const names = conditionVariables(condition).filter((name) => !bindings.has(name));
          return {
            selected: [],
            iterations: 1,
            pending: { kind: 'variable', fragment, names, reason: 'unknown-condition' },
          };
        }
        return { selected: verdict ? [first] : [], iterations: 1, pending: null };
      }

      return { selected: [first], iterations: 1, pending: null };
    }

    case 'par':
      return {
        selected: decision?.kind === 'lanes' ? [...decision.branchIds] : all,
        iterations: 1,
        pending: null,
      };

    case 'loop':
      return {
        selected: [first],
        iterations: decision?.kind === 'iterations' ? Math.max(0, decision.count) : 1,
        pending: null,
      };

    case 'rect':
      return { selected: [first], iterations: 1, pending: null };
  }
}
