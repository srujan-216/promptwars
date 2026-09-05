import { z } from 'zod';

/**
 * Patient intake (CR-1).
 *
 * This schema is deliberately NOT server-only: the same Zod object validates in the
 * browser and again on the server. Client-side validation is a courtesy to the user;
 * the server-side parse is the one that matters, and it does not trust the client.
 *
 * Everything here is `user_provided`. Keeping it structurally separate from extracted
 * data is what lets the record show, per field, whether a human typed it or a model
 * read it out of a document.
 */

export const SEX_OPTIONS = ['female', 'male', 'intersex', 'prefer_not_to_say'] as const;

export const symptomSchema = z.object({
  name: z.string().trim().min(1, 'Give the symptom a name, or remove the row.').max(120),
  /** Free text: "3 days", "since March". Empty means unanswered, which triggers a question. */
  duration: z.string().trim().max(120),
});

export const intakeSchema = z
  .object({
    identifier: z.string().trim().max(120).default(''),
    age: z
      .number({ invalid_type_error: 'Age must be a number.' })
      .int('Age must be a whole number.')
      .min(0, 'Age cannot be negative.')
      .max(130, 'Age must be 130 or less.')
      .nullable()
      .default(null),
    sex: z.enum(SEX_OPTIONS).nullable().default(null),
    symptoms: z.array(symptomSchema).max(10).default([]),
    conditions: z.array(z.string().trim().min(1)).max(30).default([]),
    allergies: z.array(z.string().trim().min(1)).max(30).default([]),
    noKnownAllergies: z.boolean().default(false),
    medications: z.array(z.string().trim().min(1)).max(30).default([]),
    notes: z.string().trim().max(2000).default(''),
  })
  // A form-level contradiction we can catch immediately, rather than passing two
  // conflicting claims downstream and reporting them as a conflict later.
  .refine((data) => !(data.noKnownAllergies && data.allergies.length > 0), {
    message: 'You listed an allergy but also ticked "no known allergies". Please resolve one.',
    path: ['allergies'],
  });

export type Intake = z.infer<typeof intakeSchema>;
export type Symptom = z.infer<typeof symptomSchema>;

export const EMPTY_INTAKE: Intake = {
  identifier: '',
  age: null,
  sex: null,
  symptoms: [],
  conditions: [],
  allergies: [],
  noKnownAllergies: false,
  medications: [],
  notes: '',
};

/** Split a textarea into trimmed, non-empty lines. */
export function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

const SEX_LABELS: Record<(typeof SEX_OPTIONS)[number], string> = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex',
  prefer_not_to_say: 'Prefer not to say',
};

export function sexLabel(value: (typeof SEX_OPTIONS)[number]): string {
  return SEX_LABELS[value];
}

/** True when the user supplied nothing at all, so no intake sections should render. */
export function isIntakeEmpty(intake: Intake): boolean {
  return (
    intake.identifier === '' &&
    intake.age === null &&
    intake.sex === null &&
    intake.symptoms.length === 0 &&
    intake.conditions.length === 0 &&
    intake.allergies.length === 0 &&
    !intake.noKnownAllergies &&
    intake.medications.length === 0 &&
    intake.notes === ''
  );
}
