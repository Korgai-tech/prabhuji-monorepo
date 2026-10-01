import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { EntityFormFieldRenderProps } from '@/components/entity-form/entity-form';

import type { HoroscopeStep } from './use-horoscope-steps';
import type { ResultStep } from './use-horoscope-results';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  The `steps` editor (spec §(c)) — a STRUCTURED repeating field, NOT a JSON
 *  textarea. This is the field an editor touches ~24 times a day.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  - `stepId` is a select of the chosen mode's `HoroscopeStepConfig` rows.
 *    Choosing one PREFILLS `title`, `contentType` and `order` from that config
 *    (spec §(c)) — the valid path is the default path.
 *  - `contentType` is LOCKED to the config (TAM-100 rejects a mismatch with a
 *    400), so the client can never author an inconsistent step.
 *  - `displayText` and `ttsText` are their own multi-line inputs — `ttsText` is
 *    what the app reads aloud, surfaced as a first-class field, not an afterthought.
 *  - Reorder is up/down buttons (no drag-and-drop dependency — TAM-97 rule); a
 *    swap moves the row AND its `order` value.
 *
 * Client validation MIRRORS TAM-100 as fast feedback; the server is authoritative
 * (a prohibited claim in `displayText`/`ttsText` is a server-side 400 surfaced by
 * `<EntityForm>`).
 */

export function asSteps(value: unknown): ResultStep[] {
  return Array.isArray(value) ? (value as ResultStep[]) : [];
}

interface StepsEditorProps extends Pick<EntityFormFieldRenderProps, 'onChange' | 'disabled'> {
  value: ResultStep[];
  /** The chosen mode's step configs (drives the select + prefill). */
  configs: HoroscopeStep[];
  isLoadingConfigs: boolean;
  /** Whether a mode has been chosen yet (the configs are mode-scoped). */
  modeChosen: boolean;
}

export function StepsEditor({
  value,
  onChange,
  disabled,
  configs,
  isLoadingConfigs,
  modeChosen,
}: StepsEditorProps) {
  const enabledConfigs = configs.filter((c) => c.enabled);

  function update(next: ResultStep[]) {
    onChange(next);
  }

  function addStep() {
    // Seed from the first not-yet-used enabled config, else a blank row.
    const used = new Set(value.map((s) => s.stepId));
    const seed = enabledConfigs.find((c) => !used.has(c.stepId)) ?? enabledConfigs[0];
    update([
      ...value,
      seed
        ? {
            stepId: seed.stepId,
            title: seed.title,
            order: seed.order,
            contentType: seed.contentType,
            displayText: '',
            ttsText: '',
          }
        : { stepId: '', title: '', order: value.length, contentType: 'text', displayText: '', ttsText: '' },
    ]);
  }

  function patchStep(index: number, patch: Partial<ResultStep>) {
    update(value.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  /** Choosing a `stepId` prefills title/contentType/order from its config. */
  function chooseStepId(index: number, stepId: string) {
    const config = configs.find((c) => c.stepId === stepId);
    patchStep(index, {
      stepId,
      title: config?.title ?? value[index]?.title ?? '',
      contentType: config?.contentType ?? value[index]?.contentType ?? 'text',
      order: config?.order ?? value[index]?.order ?? index,
    });
  }

  function removeStep(index: number) {
    update(value.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const a = next[index];
    const b = next[target];
    // Swap positions AND their order values so `order` tracks the new position.
    next[index] = { ...b, order: a.order };
    next[target] = { ...a, order: b.order };
    update(next);
  }

  if (!modeChosen) {
    return (
      <p className="text-sm text-muted-foreground">
        Choose a mode first — the available steps depend on it.
      </p>
    );
  }

  if (isLoadingConfigs) {
    return (
      <div className="grid gap-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {enabledConfigs.length === 0 && (
        <Alert>
          <AlertTitle>No steps configured for this mode</AlertTitle>
          <AlertDescription>
            Add steps under <span className="font-medium">Horoscope → Step config</span> for this
            mode before authoring a result.
          </AlertDescription>
        </Alert>
      )}

      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">No steps yet — add the first step below.</p>
      ) : (
        <ul className="grid gap-3">
          {value.map((step, index) => (
            <li key={index} className="grid gap-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="grid flex-1 gap-1">
                  <label
                    htmlFor={`step-${index}-stepId`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Step
                  </label>
                  <Select
                    id={`step-${index}-stepId`}
                    value={step.stepId}
                    disabled={disabled}
                    onChange={(event) => chooseStepId(index, event.target.value)}
                  >
                    <option value="">Select a step…</option>
                    {configs.map((config) => (
                      <option key={config.id} value={config.stepId}>
                        {config.title} ({config.stepId}){config.enabled ? '' : ' — disabled'}
                      </option>
                    ))}
                  </Select>
                </div>
                <Badge variant="muted" className="mt-5">
                  {step.contentType}
                </Badge>
                <div className="mt-5 flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || index === 0}
                    aria-label={`Move step ${index + 1} up`}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || index === value.length - 1}
                    aria-label={`Move step ${index + 1} down`}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() => removeStep(index)}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-1">
                <label
                  htmlFor={`step-${index}-displayText`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Display text
                </label>
                <Textarea
                  id={`step-${index}-displayText`}
                  value={step.displayText}
                  disabled={disabled}
                  placeholder="Shown on screen"
                  onChange={(event) => patchStep(index, { displayText: event.target.value })}
                />
              </div>

              <div className="grid gap-1">
                <label
                  htmlFor={`step-${index}-ttsText`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  TTS text (read aloud)
                </label>
                <Textarea
                  id={`step-${index}-ttsText`}
                  value={step.ttsText}
                  disabled={disabled}
                  placeholder="What the app reads aloud"
                  onChange={(event) => patchStep(index, { ttsText: event.target.value })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || enabledConfigs.length === 0}
          onClick={addStep}
        >
          <PlusIcon aria-hidden="true" />
          Add step
        </Button>
      </div>
    </div>
  );
}
