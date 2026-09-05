import { z } from 'zod';

import { getProvider } from '@/lib/server/ai/providerRegistry';
import { analyzeRateLimiter, identifyClient } from '@/lib/server/rateLimit';
import { PipelineError, runExtractionPipeline } from '@/lib/server/extraction/pipeline';
import { intakeForPipeline, intakeToSections } from '@/lib/intake/present';
import { EMPTY_INTAKE, intakeSchema } from '@/lib/intake/schema';
import { generateSummary } from '@/lib/server/ai/summary';
import { buildFactsNarrative, buildSummaryFacts, presentAudit } from '@/lib/view/present';

export const dynamic = 'force-dynamic';

/**
 * Node runtime, declared explicitly: the provider uses `node:crypto` for the cache key,
 * which the Edge runtime does not supply. Without this a future default change could move
 * the route to Edge and break extraction at runtime rather than at build time.
 */
export const runtime = 'nodejs';

/**
 * A Gemini extraction call, plus a second call when a previous report is supplied, plus a
 * summary call, comfortably exceeds Vercel's 10s default for serverless functions. 60s is
 * the ceiling on the free tier and is far more than a normal request needs — it exists so
 * a slow model response fails as a slow response, not as a truncated one.
 */
export const maxDuration = 60;

/** Roughly 40 pages of text. Bounds both memory and the model bill. */
const MAX_DOCUMENT_CHARS = 100_000;

const documentField = z
  .string()
  .max(MAX_DOCUMENT_CHARS, 'That document is too large. The limit is 100,000 characters.');

const requestSchema = z.object({
  documentText: documentField.min(1, 'Paste a report before processing.'),
  /** Optional earlier report, for comparison. Absent or blank means no comparison. */
  previousDocumentText: documentField.optional(),
  /** Re-validated server-side with the same schema the browser used. */
  intake: intakeSchema.optional(),
});

export type AnalyzeMode = 'gemini' | 'pattern_fallback';

export async function POST(request: Request): Promise<Response> {
  // Before parsing the body: a rejected request should cost as little as possible.
  const limit = analyzeRateLimiter.check(identifyClient(request));
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      {
        status: 429,
        headers: {
          'retry-after': String(limit.retryAfterSeconds),
          'x-ratelimit-remaining': '0',
        },
      },
    );
  }

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

  // Module-scoped: the cache survives between requests handled by the same warm instance.
  // See lib/server/ai/providerRegistry.ts for exactly what that does and does not promise.
  const { provider, mode } = getProvider();

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

    const intake = parsed.data.intake ?? EMPTY_INTAKE;

    const result = await runExtractionPipeline({
      documentText: parsed.data.documentText,
      provider,
      previousResults,
      intake: intakeForPipeline(intake),
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

    // Merge user-provided fields into the record. They keep origin 'user_provided', so the
    // record shows per field whether a person typed it or a model read it from the document.
    const intakeSections = intakeToSections(intake);
    const record = {
      ...presented.record,
      patientInformation: [
        ...intakeSections.patientInformation,
        ...presented.record.patientInformation,
      ],
      symptoms: intakeSections.symptoms,
      conditionsAndHistory: intakeSections.conditionsAndHistory,
      allergies: [...intakeSections.allergies, ...presented.record.allergies],
      medications: [...intakeSections.medications, ...presented.record.medications],
      additionalObservations: intakeSections.additionalObservations,
    };

    // Only attempt a summary when a real model is available. The pattern fallback has no
    // model to write prose, and generating a deterministic template here would present
    // code-assembled text as though a summary stage had run. Absent means absent.
    const summary =
      mode === 'gemini'
        ? await generateSummary({
            provider,
            facts: buildSummaryFacts(record, result.audit),
            factsNarrative: buildFactsNarrative(record),
          })
        : null;

    return Response.json({
      mode,
      summary:
        summary === null
          ? null
          : {
              text: summary.text,
              source: summary.source,
              guardrailTriggered: summary.guardrailTriggered,
              rejectedAttemptCount: summary.rejectedAttempts.length,
            },
      audit: result.audit,
      record,
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
