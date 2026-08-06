import type { Timeline } from '../model/timeline';

export type Emphasis = 'rest' | 'spent' | 'path' | 'current';

export interface EmphasisMap {
  readonly step: (stepId: string) => Emphasis;
  readonly participant: (participantId: string) => Emphasis;
  readonly fragmentBranch: (branchId: string) => Emphasis;
}

const REST: Emphasis = 'rest';

/**
 * One place decides emphasis for every element, rather than each leaf component
 * deciding independently and drifting.
 */
export function computeEmphasis(timeline: Timeline, cursor: number): EmphasisMap {
  const current = cursor >= 0 ? timeline.steps[cursor] : undefined;

  const currentParticipants = new Set(current?.involved ?? []);
  const currentBranches = new Set(current?.path.map((entry) => entry.branchId) ?? []);

  const spentParticipants = new Set<string>();
  const spentBranches = new Set<string>();
  for (let index = 0; index < cursor && index < timeline.steps.length; index += 1) {
    const step = timeline.steps[index]!;
    step.involved.forEach((id) => spentParticipants.add(id));
    step.path.forEach((entry) => spentBranches.add(entry.branchId));
  }

  const stepIndexById = new Map(timeline.steps.map((step, index) => [step.id, index]));

  return {
    step: (stepId) => {
      const index = stepIndexById.get(stepId);
      if (index === undefined) return REST;
      if (index === cursor) return 'current';
      return index < cursor ? 'spent' : REST;
    },
    participant: (participantId) => {
      if (currentParticipants.has(participantId)) return 'current';
      return spentParticipants.has(participantId) ? 'spent' : REST;
    },
    fragmentBranch: (branchId) => {
      if (currentBranches.has(branchId)) return 'path';
      return spentBranches.has(branchId) ? 'spent' : REST;
    },
  };
}
