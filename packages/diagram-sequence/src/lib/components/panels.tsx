import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { RichLabel, humaniseLabel } from './rich-label';
import type { SequenceRunController, VariablePrompt } from '../model/controller';
import type { Timeline } from '../model/timeline';
import type { EmphasisMap } from '../layout/emphasis';
import type { VariableType } from '../parser/ast';
import type { VariableValue } from '../model/bindings';

/** Classic lays out the whole protocol; modern shows only the active call. */
export type SequenceVariant = 'classic' | 'modern';

export interface ToolbarProps {
  controller: SequenceRunController;
  variant: SequenceVariant;
  onVariantChange: (variant: SequenceVariant) => void;
}

export function SequenceToolbar({ controller, variant, onVariantChange }: ToolbarProps) {
  const { current, stepCount, canAdvance } = controller;
  const waiting = !canAdvance && current + 1 < stepCount;
  const unblocked = useJustUnblocked(canAdvance);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={controller.prev} disabled={current < 0}>
        <ChevronLeft data-icon="inline-start" />
        Back
      </Button>
      <Button
        size="sm"
        onClick={controller.next}
        disabled={!canAdvance}
        /* Pulses when the run becomes advanceable again, so the viewer knows
           their answer landed and where to look next. */
        data-unblocked={unblocked}
        className="seq-next"
      >
        Next step
        <ChevronRight data-icon="inline-end" />
      </Button>
      <Button variant="ghost" size="sm" onClick={controller.resetRun}>
        <RotateCcw data-icon="inline-start" />
        Restart
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <span className="text-muted-foreground text-xs tabular-nums">
        {current + 1} / {stepCount}
      </span>

      {/* Never hidden — a disabled control with a reason beats a missing one. */}
      {waiting ? (
        <Badge variant="outline" className="text-primary border-primary/40">
          Waiting for a value
        </Badge>
      ) : null}

      <ToggleGroup
        className="ms-auto shrink-0"
        variant="outline"
        size="sm"
        value={[variant]}
        aria-label="Diagram view"
        onValueChange={(value: string[]) => {
          if (value[0]) onVariantChange(value[0] as SequenceVariant);
        }}
      >
        <ToggleGroupItem value="classic" aria-label="Classic view">
          Classic
        </ToggleGroupItem>
        <ToggleGroupItem value="modern" aria-label="Modern view">
          Modern
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

/**
 * A literal union renders as a visible toggle group rather than a dropdown: the
 * options are the explanation, and a viewer being walked through should not have
 * to open a popup to discover what the choices are.
 */
function PromptField({
  prompt,
  current,
  onSubmit,
}: {
  prompt: VariablePrompt;
  current: VariableValue | undefined;
  onSubmit: (raw: string) => void;
}) {
  const { name, declaredType } = prompt.declaration;
  const options = promptOptions(declaredType);
  const fieldRef = useRef<HTMLDivElement>(null);

  /*
   * The run has stopped and is waiting on this value, so put the cursor where
   * the answer goes. PromptField is keyed by variable name, so this fires once
   * per newly required value rather than on every render.
   */
  useEffect(() => {
    const focusable = fieldRef.current?.querySelector<HTMLElement>(
      'input, button, select, textarea',
    );
    focusable?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="seq-prompt grid gap-1.5" ref={fieldRef} data-fresh="true">
      <Label htmlFor={`seq-var-${name}`} className="text-xs">
        <span className="font-mono font-semibold">{name}</span>
        {prompt.reason === 'unknown-condition' ? (
          <span className="text-muted-foreground">needed to choose a branch</span>
        ) : null}
      </Label>

      {options ? (
        <ToggleGroup
          id={`seq-var-${name}`}
          variant="outline"
          size="sm"
          aria-label={name}
          value={current === undefined ? [] : [String(current)]}
          onValueChange={(value: string[]) => {
            if (value[0]) onSubmit(value[0]);
          }}
        >
          {options.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} aria-label={option.label}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <Input
          id={`seq-var-${name}`}
          type={declaredType === 'number' ? 'number' : 'text'}
          placeholder="Enter a value"
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            onSubmit((event.target as HTMLInputElement).value);
          }}
          onBlur={(event) => onSubmit(event.target.value)}
        />
      )}
    </div>
  );
}

interface PromptOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Choices render as buttons rather than a switch or a dropdown.
 *
 * A boolean needs three states — true, false, and *not answered yet* — and a
 * switch only has two: sitting in its off position it claims `false` has been
 * chosen when the run is actually blocked waiting. Buttons show all the answers
 * at once and let either be picked in one click, which is also what the literal
 * unions already do.
 *
 * The values stay `true`/`false` so they read correctly everywhere else; only
 * the labels are humanised.
 */
function promptOptions(declaredType: VariableType | null): readonly PromptOption[] | null {
  if (declaredType === 'boolean') {
    return [
      { value: 'false', label: 'No' },
      { value: 'true', label: 'Yes' },
    ];
  }
  if (declaredType && typeof declaredType === 'object' && 'union' in declaredType) {
    return declaredType.union.map((option) => ({ value: option, label: option }));
  }
  return null;
}

/**
 * Prompts sit beside the diagram rather than in a modal: a modal hides the
 * diagram at exactly the moment the viewer needs it to answer.
 */
export function VariablePanel({ controller }: { controller: SequenceRunController }) {
  const entries = controller.bindings.entries();

  const submit = (prompt: VariablePrompt, raw: string): void => {
    if (raw === '') return;
    // 'false' is a real answer — never let a falsy-looking string be dropped.
    const { declaredType } = prompt.declaration;
    const value =
      declaredType === 'number' ? Number(raw) : declaredType === 'boolean' ? raw === 'true' : raw;
    controller.bind(prompt.declaration.name, value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-[11px] font-normal tracking-wide uppercase">
          Values
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {controller.prompts.map((prompt) => (
          <PromptField
            key={prompt.declaration.name}
            prompt={prompt}
            current={controller.bindings.get(prompt.declaration.name)}
            onSubmit={(raw) => submit(prompt, raw)}
          />
        ))}

        {entries.length === 0 && controller.prompts.length === 0 ? (
          <p className="text-muted-foreground m-0 text-xs">No values yet.</p>
        ) : null}

        {entries.length > 0 ? (
          <div className="grid gap-1">
            {entries.map(([name, value]) => (
              <div key={name} className="flex items-center justify-between gap-2 font-mono text-xs">
                <span className="text-foreground font-semibold">{name}</span>
                <span className="flex items-center gap-1">
                  {String(value)}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Clear ${name}`}
                    onClick={() => controller.unbind(name)}
                  >
                    ×
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function NotePanel({ controller }: { controller: SequenceRunController }) {
  const step = controller.current >= 0 ? controller.timeline.steps[controller.current] : undefined;
  const notes = step?.notes ?? [];

  if (notes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-[11px] font-normal tracking-wide uppercase">
          Note
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notes.map((note) => (
          <p key={note.id} className="m-0 text-xs">
            <RichLabel text={note.text} />
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

export function DecisionPanel({ controller }: { controller: SequenceRunController }) {
  const pending = controller.pending;
  if (!pending || pending.kind === 'variable') return null;

  const { fragment } = pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-[11px] font-normal tracking-wide uppercase">
          Choose a path
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        <Badge variant="secondary" className="w-fit font-mono">
          {fragment.kind}
        </Badge>
        {fragment.branches.map((branch) => (
          <Button
            key={branch.id}
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() =>
              controller.decide({ kind: 'branch', fragmentId: fragment.id, branchId: branch.id })
            }
          >
            {humaniseLabel(branch.label) || 'otherwise'}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export interface StepListProps {
  controller: SequenceRunController;
  emphasis: EmphasisMap;
  timeline: Timeline;
}

export function StepList({ controller, emphasis, timeline }: StepListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-[11px] font-normal tracking-wide uppercase">
          Steps
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/*
          A plain scroll container, not the ScrollArea primitive. Its root sets
          no definite height and no overflow, so its viewport's height:100%
          resolved against an auto parent — the list grew past max-h and spilled
          over the section below instead of scrolling.
        */}
        <div className="seq-steps grid max-h-64 gap-0.5 overflow-y-auto">
          {timeline.steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              data-emphasis={emphasis.step(step.id)}
              onClick={() => controller.goTo(index)}
              className="text-muted-foreground hover:bg-muted data-[emphasis=current]:bg-primary data-[emphasis=current]:text-primary-foreground data-[emphasis=spent]:text-foreground cursor-pointer px-1.5 py-0.5 text-left text-xs"
            >
              {step.ordinal !== null ? `${step.ordinal}. ` : ''}
              {/*
                  Keyed on step.kind, never node.type. The +/- activation
                  shorthand emits a message step and a lifecycle step that share
                  one message node, so branching on the node rendered the same
                  message twice.
                */}
              {step.kind === 'message' && step.node.type === 'message' ? (
                step.node.text.segments.length > 0 ? (
                  <RichLabel text={step.node.text} />
                ) : (
                  `${step.node.from} → ${step.node.to}`
                )
              ) : (
                `${step.kind} · ${step.involved.join(', ')}`
              )}
            </button>
          ))}
        </div>

        {timeline.skipped.length > 0 ? (
          <>
            <Separator className="my-2" />
            <p className="text-muted-foreground m-0 mb-1 text-[11px] tracking-wide uppercase">
              Skipped
            </p>
            {timeline.skipped.map((region) => (
              <div
                key={region.branchId}
                className="text-xs line-through"
                style={{ color: 'var(--seq-skipped)' }}
              >
                {region.kind} · {humaniseLabel(region.label) || 'otherwise'} (
                {region.statementCount})
              </div>
            ))}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * True for a moment after `canAdvance` flips from false to true.
 *
 * Answering a prompt un-blocks the run somewhere else on screen — the button
 * simply stops being grey — so it needs to say so rather than change quietly.
 */
function useJustUnblocked(canAdvance: boolean): boolean {
  const previous = useRef(canAdvance);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const wasBlocked = !previous.current && canAdvance;
    previous.current = canAdvance;
    if (!wasBlocked) return;

    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(timer);
  }, [canAdvance]);

  return flash;
}
