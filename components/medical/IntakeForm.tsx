'use client';

import { useId, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { linesToList, SEX_OPTIONS, sexLabel, type Intake } from '@/lib/intake/schema';

/**
 * Structured patient intake (CR-1).
 *
 * Accessibility: every control is labelled, errors carry `aria-invalid` and
 * `aria-describedby` pointing at a `role="alert"` message, and the parent moves focus to
 * the first invalid control on submit.
 *
 * Errors arrive as a `Record<path, message>` produced by the shared Zod schema, so the
 * browser shows exactly what the server would reject rather than a parallel set of rules.
 */

export interface IntakeFormProps {
  value: Intake;
  onChange: (next: Intake) => void;
  errors: Readonly<Record<string, string>>;
  /** Ids are assigned here and reported up so the parent can focus the first error. */
  onRegisterFieldId: (path: string, id: string) => void;
}

const FIELD_CLASS =
  'w-full rounded-md border border-slate-300 p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900';
const LABEL_CLASS = 'text-sm font-medium text-slate-700';

export function IntakeForm({
  value,
  onChange,
  errors,
  onRegisterFieldId,
}: IntakeFormProps): ReactElement {
  const baseId = useId();
  const idFor = (path: string): string => `${baseId}-${path.replace(/\./g, '-')}`;

  function register(path: string): {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  } {
    const id = idFor(path);
    onRegisterFieldId(path, id);
    const hasError = errors[path] !== undefined;
    return {
      id,
      'aria-invalid': hasError,
      'aria-describedby': hasError ? `${id}-error` : undefined,
    };
  }

  function ErrorFor({ path }: { path: string }): ReactElement | null {
    const message = errors[path];
    if (message === undefined) return null;
    return (
      <p
        id={`${idFor(path)}-error`}
        role="alert"
        className="flex items-start gap-2 text-sm text-red-800"
      >
        <span aria-hidden="true" className="font-bold">
          !
        </span>
        <span>{message}</span>
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5">
      <legend className="px-1 text-lg font-semibold text-slate-900">About the patient</legend>
      <p className="max-w-prose text-sm text-slate-600">
        Optional. Anything entered here is recorded as supplied by you, shown separately from
        anything read out of a document, and used to check the report for contradictions.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idFor('identifier')} className={LABEL_CLASS}>
            Name or identifier
          </label>
          <input
            {...register('identifier')}
            type="text"
            value={value.identifier}
            onChange={(event) => {
              onChange({ ...value, identifier: event.target.value });
            }}
            className={FIELD_CLASS}
          />
          <ErrorFor path="identifier" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={idFor('age')} className={LABEL_CLASS}>
            Age
          </label>
          <input
            {...register('age')}
            type="number"
            min={0}
            max={130}
            value={value.age === null ? '' : String(value.age)}
            onChange={(event) => {
              const raw = event.target.value;
              onChange({ ...value, age: raw === '' ? null : Number(raw) });
            }}
            className={FIELD_CLASS}
          />
          <ErrorFor path="age" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={idFor('sex')} className={LABEL_CLASS}>
            Sex
          </label>
          <select
            {...register('sex')}
            value={value.sex ?? ''}
            onChange={(event) => {
              const raw = event.target.value;
              onChange({ ...value, sex: SEX_OPTIONS.find((option) => option === raw) ?? null });
            }}
            className={FIELD_CLASS}
          >
            <option value="">Not stated</option>
            {SEX_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {sexLabel(option)}
              </option>
            ))}
          </select>
          <ErrorFor path="sex" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className={LABEL_CLASS} id={`${baseId}-symptoms-label`}>
          Symptoms
        </span>
        <ul aria-labelledby={`${baseId}-symptoms-label`} className="flex flex-col gap-2">
          {value.symptoms.map((symptom, index) => (
            <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <div className="flex flex-col gap-1">
                <label htmlFor={idFor(`symptoms.${String(index)}.name`)} className="sr-only">
                  Symptom {index + 1} name
                </label>
                <input
                  {...register(`symptoms.${String(index)}.name`)}
                  type="text"
                  placeholder="Symptom"
                  value={symptom.name}
                  onChange={(event) => {
                    const symptoms = [...value.symptoms];
                    symptoms[index] = { ...symptom, name: event.target.value };
                    onChange({ ...value, symptoms });
                  }}
                  className={FIELD_CLASS}
                />
                <ErrorFor path={`symptoms.${String(index)}.name`} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={idFor(`symptoms.${String(index)}.duration`)} className="sr-only">
                  Symptom {index + 1} duration
                </label>
                <input
                  {...register(`symptoms.${String(index)}.duration`)}
                  type="text"
                  placeholder="How long? (optional)"
                  value={symptom.duration}
                  onChange={(event) => {
                    const symptoms = [...value.symptoms];
                    symptoms[index] = { ...symptom, duration: event.target.value };
                    onChange({ ...value, symptoms });
                  }}
                  className={FIELD_CLASS}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onChange({ ...value, symptoms: value.symptoms.filter((_, i) => i !== index) });
                }}
              >
                Remove<span className="sr-only"> symptom {index + 1}</span>
              </Button>
            </li>
          ))}
        </ul>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.symptoms.length >= 10}
            onClick={() => {
              onChange({ ...value, symptoms: [...value.symptoms, { name: '', duration: '' }] });
            }}
          >
            Add symptom
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idFor('conditions')} className={LABEL_CLASS}>
            Existing conditions
          </label>
          <textarea
            {...register('conditions')}
            rows={3}
            placeholder="One per line"
            value={value.conditions.join('\n')}
            onChange={(event) => {
              onChange({ ...value, conditions: linesToList(event.target.value) });
            }}
            className={FIELD_CLASS}
          />
          <ErrorFor path="conditions" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={idFor('medications')} className={LABEL_CLASS}>
            Current medications
          </label>
          <textarea
            {...register('medications')}
            rows={3}
            placeholder="One per line"
            value={value.medications.join('\n')}
            onChange={(event) => {
              onChange({ ...value, medications: linesToList(event.target.value) });
            }}
            className={FIELD_CLASS}
          />
          <ErrorFor path="medications" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idFor('allergies')} className={LABEL_CLASS}>
          Allergies
        </label>
        <textarea
          {...register('allergies')}
          rows={2}
          placeholder="One per line"
          value={value.allergies.join('\n')}
          onChange={(event) => {
            onChange({ ...value, allergies: linesToList(event.target.value) });
          }}
          className={FIELD_CLASS}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.noKnownAllergies}
            onChange={(event) => {
              onChange({ ...value, noKnownAllergies: event.target.checked });
            }}
            className="size-4"
          />
          No known allergies
        </label>
        <ErrorFor path="allergies" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idFor('notes')} className={LABEL_CLASS}>
          Additional notes
        </label>
        <textarea
          {...register('notes')}
          rows={2}
          value={value.notes}
          onChange={(event) => {
            onChange({ ...value, notes: event.target.value });
          }}
          className={FIELD_CLASS}
        />
        <ErrorFor path="notes" />
      </div>
    </fieldset>
  );
}
