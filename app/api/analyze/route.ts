import { z } from 'zod';

import { createGeminiClient, createProvider, type ModelClient } from '@/lib/server/ai/provider';
import { createPatternFallbackClient } from '@/lib/server/extraction/fallback';
import { PipelineError, runExtractionPipeline } from '@/lib/server/extraction/pipeline';
import { presentAudit } from '@/lib/view/present';

export const dynamic = 'force-dynamic';

/** Roughly 40 pages of text. Bounds both memory and the model bill. */
const MAX_DOCUMENT_CHARS = 100_000;

const documentField = z
  .string()
  .max(MAX_DOCUMENT_CHARS, 'That document is too large. The limit is 100,000 characters.');

const requestSchema = z.object({
  documentText: documentField.min(1, 'Paste a report before processing.'),
  /** Optional earlier report, for comparison. Absent or blank means no comparison. */
  previousDocumentText: documentField.optional(),
});

export type AnalyzeMode = 'gemini' | 'pattern_fallback';

/**
 * Choose the extraction client.
 *
 * With no API key we use deterministic pattern matching, NOT a simulated model call.
 * The mode travels back to the client so the interface can say which one ran — a result
 * produced without a model must never be presented as though a model produced it.
 */
function selectClient(): { client: ModelClient; mode: AnalyzeMode } {
  if (typeof process.env['GEMINI_API_KEY'] === 'string' && process.env['GEMINI_API_KEY'] !== '') {
    return { client: createGeminiClient(), mode: 'gemini' };
  }
  return { client: createPatternFallbackClient(), mode: 'pattern_fallback' };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'The request body could not be read as JSON.' },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    // The Zod message is written for a user; the offending text is never echoed back.
    const message = parsed.error.issues[0]?.message ?? 'That request was not valid.';
    return Response.json({ error: message }, { status: 400 });
  }

  const { client, mode } = selectClient();
  const provider = createProvider({ client });

  try {
    // The earlier report goes through the same pipeline — same verification, same range
    // rules — so a comparison is never drawn against unverified values.
    const previousText = parsed.data.previousDocumentText?.trim() ?? '';
    const previousResults =
      previousText === ''
        ? []
        : (
            await runExtractionPipeline({ documentText: previousText, provider })
          ).labs.map((lab) => ({
            canonicalName: lab.canonicalName,
            value: lab.value.value,
            unit: lab.unit,
          }));

    const result = await runExtractionPipeline({
      documentText: parsed.data.documentText,
      provider,
      previousResults,
    });

    const units = Object.fromEntries(
      result.labs.map((lab, index) => [`labs.${String(index)}`, lab.unit]),
    );

    const presented = presentAudit({
      audit: result.audit,
      units,
      reportDate: result.patient.reportDate,
      medications: result.medications,
      allergies: result.allergies,
    });

    return Response.json({
      mode,
      audit: result.audit,
      record: presented.record,
      quarantined: presented.quarantined,
      comparison: result.comparison,
      conflicts: result.conflicts,
      questions: result.questions,
      servedFromCache: result.servedFromCache,
    });
  } catch (error) {
    if (error instanceof PipelineError) {
      // userMessage is deliberately generic; the technical detail stays server-side.
      return Response.json({ error: error.userMessage }, { status: 422 });
    }
    return Response.json(
      { error: 'Something went wrong while processing the document.' },
      { status: 500 },
    );
  }
}
