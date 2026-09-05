import { z } from 'zod';

/**
 * Zod schema for model output (CLAUDE.md rule 1).
 *
 * Model output is an external boundary and is validated like any other. Note what is
 * deliberately ABSENT: there is no `status`, no `interpretation`, no `isAbnormal`, no
 * `severity`. The schema gives the model nowhere to put a clinical judgement, so a
 * judgement cannot arrive through this door even if the model tries to offer one.
 */

export const extractedLabSchema = z.object({
  /** Analyte name exactly as printed. */
  name: z.string().min(1),
  value: z.number().finite(),
  unit: z.string().nullable(),
  /** Reference range EXACTLY as printed, or null. Verified verbatim downstream (rule 3). */
  referenceText: z.string().nullable(),
  /** Verbatim span containing the value. Verified downstream (rule 4). */
  sourceQuote: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const extractedPatientSchema = z.object({
  age: z.number().int().positive().max(130).nullable(),
  sex: z.string().nullable(),
  reportDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'reportDate must be ISO YYYY-MM-DD')
    .nullable(),
});

export const extractionResponseSchema = z.object({
  patient: extractedPatientSchema,
  labs: z.array(extractedLabSchema),
  medications: z.array(z.string()),
  allergies: z.array(z.string()),
});

export type ExtractedLab = z.infer<typeof extractedLabSchema>;
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

/**
 * The same shape expressed for Gemini's `responseSchema`.
 *
 * Kept adjacent to the Zod schema on purpose: this one constrains what the model may emit,
 * the Zod one verifies what actually arrived. Neither is trusted to do the other's job —
 * structured-output constraints are a convenience, not a guarantee.
 *
 * TYPES ARE UPPERCASE, and that is not cosmetic. `responseSchema` takes Google's own Schema
 * type, an OpenAPI 3.0 subset whose `Type` enum is 'OBJECT' / 'STRING' / 'INTEGER'. Sending
 * lowercase JSON Schema types made the API reject every request, and the deployed site
 * returned 422 on every extraction until this was corrected.
 *
 * The sibling parameter `responseJsonSchema` does take standard JSON Schema — but its
 * documented property list does NOT include `nullable`, which five fields here need. So the
 * native Schema type is the correct target, not merely the more conventional one.
 */
export const extractionResponseGeminiSchema = {
  type: 'OBJECT',
  properties: {
    patient: {
      type: 'OBJECT',
      properties: {
        age: { type: 'INTEGER', nullable: true },
        sex: { type: 'STRING', nullable: true },
        reportDate: { type: 'STRING', nullable: true, description: 'ISO YYYY-MM-DD' },
      },
      required: ['age', 'sex', 'reportDate'],
    },
    labs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          value: { type: 'NUMBER' },
          unit: { type: 'STRING', nullable: true },
          referenceText: {
            type: 'STRING',
            nullable: true,
            description: 'Reference range copied EXACTLY as printed, or null if none is printed.',
          },
          sourceQuote: {
            type: 'STRING',
            description: 'Verbatim text from the document containing this value.',
          },
          confidence: { type: 'NUMBER' },
        },
        required: ['name', 'value', 'unit', 'referenceText', 'sourceQuote', 'confidence'],
      },
    },
    medications: { type: 'ARRAY', items: { type: 'STRING' } },
    allergies: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['patient', 'labs', 'medications', 'allergies'],
} as const;
