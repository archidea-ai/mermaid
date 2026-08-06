import type { SequenceRunController, VariablePrompt } from '../model/controller';
import type { Timeline } from '../model/timeline';
import type { EmphasisMap } from '../layout/emphasis';
import type { VariableType } from '../parser/ast';

export interface ToolbarProps {
  controller: SequenceRunController;
}

export function SequenceToolbar({ controller }: ToolbarProps) {
  const { current, stepCount, canAdvance } = controller;

  return (
    <div className="archidea-sequence__toolbar">
      <button
        type="button"
        className="archidea-sequence__button"
        onClick={controller.prev}
        disabled={current < 0}
      >
        Back
      </button>
      <button
        type="button"
        className="archidea-sequence__button"
        data-variant="primary"
        onClick={controller.next}
        disabled={!canAdvance}
      >
        Next step
      </button>
      <button type="button" className="archidea-sequence__button" onClick={controller.resetRun}>
        Restart
      </button>
      <span style={{ color: 'var(--seq-text-muted)' }}>
        {current + 1} / {stepCount}
      </span>
      {!canAdvance && current + 1 < stepCount ? (
        <span style={{ color: 'var(--seq-accent)' }}>Waiting for a value</span>
      ) : null}
    </div>
  );
}

function inputFor(
  declaredType: VariableType | null,
  value: string,
  onChange: (next: string) => void,
) {
  if (declaredType && typeof declaredType === 'object' && 'union' in declaredType) {
    return (
      <select
        className="archidea-sequence__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose…</option>
        {declaredType.union.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (declaredType === 'boolean') {
    return (
      <select
        className="archidea-sequence__select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose…</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  return (
    <input
      className="archidea-sequence__input"
      type={declaredType === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Enter a value"
    />
  );
}

/**
 * Prompts sit beside the diagram rather than in a modal: a modal hides the
 * diagram at exactly the moment the viewer needs it to answer.
 */
export function VariablePanel({ controller }: { controller: SequenceRunController }) {
  const entries = controller.bindings.entries();

  const submit = (prompt: VariablePrompt, raw: string): void => {
    if (raw === '') return;
    const { declaredType } = prompt.declaration;
    const value =
      declaredType === 'number' ? Number(raw) : declaredType === 'boolean' ? raw === 'true' : raw;
    controller.bind(prompt.declaration.name, value);
  };

  return (
    <div className="archidea-sequence__panel">
      <h3>Values</h3>

      {controller.prompts.map((prompt) => (
        <div className="archidea-sequence__field" key={prompt.declaration.name}>
          <label htmlFor={`seq-var-${prompt.declaration.name}`}>
            <b>{prompt.declaration.name}</b>
            {prompt.reason === 'unknown-condition' ? ' — needed to choose a branch' : ''}
          </label>
          <span id={`seq-var-${prompt.declaration.name}`}>
            {inputFor(prompt.declaration.declaredType, '', (next) => submit(prompt, next))}
          </span>
        </div>
      ))}

      {entries.length === 0 && controller.prompts.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--seq-text-muted)' }}>No values yet.</p>
      ) : null}

      {entries.map(([name, value]) => (
        <div className="archidea-sequence__variable" key={name}>
          <b>{name}</b>
          <span>
            {String(value)}{' '}
            <button
              type="button"
              className="archidea-sequence__step"
              onClick={() => controller.unbind(name)}
              aria-label={`Clear ${name}`}
            >
              ×
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

export function NotePanel({ controller }: { controller: SequenceRunController }) {
  const step = controller.current >= 0 ? controller.timeline.steps[controller.current] : undefined;
  const notes = step?.notes ?? [];

  if (notes.length === 0) return null;

  return (
    <div className="archidea-sequence__panel">
      <h3>Note</h3>
      {notes.map((note) => (
        <p key={note.id} style={{ margin: 0 }}>
          {note.text.raw}
        </p>
      ))}
    </div>
  );
}

export function DecisionPanel({ controller }: { controller: SequenceRunController }) {
  const pending = controller.pending;
  if (!pending || pending.kind === 'variable') return null;

  const { fragment } = pending;

  return (
    <div className="archidea-sequence__panel">
      <h3>Choose a path</h3>
      <p style={{ marginTop: 0, color: 'var(--seq-text-muted)' }}>{fragment.kind}</p>
      {fragment.branches.map((branch) => (
        <button
          key={branch.id}
          type="button"
          className="archidea-sequence__button"
          style={{ display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}
          onClick={() =>
            controller.decide({ kind: 'branch', fragmentId: fragment.id, branchId: branch.id })
          }
        >
          {branch.label || 'otherwise'}
        </button>
      ))}
    </div>
  );
}

export interface StepListProps {
  controller: SequenceRunController;
  emphasis: EmphasisMap;
  timeline: Timeline;
}

export function StepList({ controller, emphasis, timeline }: StepListProps) {
  return (
    <div className="archidea-sequence__panel">
      <h3>Steps</h3>
      <div className="archidea-sequence__steplist">
        {timeline.steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className="archidea-sequence__step"
            data-emphasis={emphasis.step(step.id)}
            onClick={() => controller.goTo(index)}
          >
            {step.ordinal !== null ? `${step.ordinal}. ` : ''}
            {step.node.type === 'message'
              ? step.node.text.raw || `${step.node.from} → ${step.node.to}`
              : `[${step.kind}]`}
          </button>
        ))}
      </div>

      {timeline.skipped.length > 0 ? (
        <>
          <h3 style={{ marginTop: 10 }}>Skipped</h3>
          {timeline.skipped.map((region) => (
            <div key={region.branchId} className="archidea-sequence__skipped">
              {region.kind} · {region.label || 'otherwise'} ({region.statementCount})
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
