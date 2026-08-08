import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { RichLabel } from './rich-label';
import type { SequenceRunController, VariablePrompt } from '../model/controller';
import type { Timeline } from '../model/timeline';
import type { EmphasisMap } from '../layout/emphasis';
import type { VariableType } from '../parser/ast';

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={controller.prev} disabled={current < 0}>
        <ChevronLeft data-icon="inline-start" />
        Back
      </Button>
      <Button size="sm" onClick={controller.next} disabled={!canAdvance}>
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
  onSubmit,
}: {
  prompt: VariablePrompt;
  onSubmit: (raw: string) => void;
}) {
  const { name, declaredType } = prompt.declaration;
  const options = unionOptions(declaredType);

  return (
    <div className="grid gap-1.5">
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
          onValueChange={(value: string[]) => {
            if (value[0]) onSubmit(value[0]);
          }}
        >
          {options.map((option) => (
            <ToggleGroupItem key={option} value={option} aria-label={option}>
              {option}
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

function unionOptions(declaredType: VariableType | null): readonly string[] | null {
  if (declaredType && typeof declaredType === 'object' && 'union' in declaredType) {
    return declaredType.union;
  }
  if (declaredType === 'boolean') return ['true', 'false'];
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
            {branch.label || 'otherwise'}
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
        <ScrollArea className="max-h-64">
          <div className="grid gap-0.5">
            {timeline.steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                data-emphasis={emphasis.step(step.id)}
                onClick={() => controller.goTo(index)}
                className="text-muted-foreground hover:bg-muted data-[emphasis=current]:bg-primary data-[emphasis=current]:text-primary-foreground data-[emphasis=spent]:text-foreground cursor-pointer px-1.5 py-0.5 text-left text-xs"
              >
                {step.ordinal !== null ? `${step.ordinal}. ` : ''}
                {step.node.type === 'message' ? (
                  step.node.text.segments.length > 0 ? (
                    <RichLabel text={step.node.text} />
                  ) : (
                    `${step.node.from} → ${step.node.to}`
                  )
                ) : (
                  `[${step.kind}]`
                )}
              </button>
            ))}
          </div>
        </ScrollArea>

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
                {region.kind} · {region.label || 'otherwise'} ({region.statementCount})
              </div>
            ))}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
