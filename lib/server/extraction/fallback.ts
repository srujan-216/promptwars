import 'server-only';

import type { ModelClient, ModelRequest } from '@/lib/server/ai/provider';
import type { ExtractionResponse } from '@/lib/server/extraction/schema';

/**
 * Pattern-matching extractor used when GEMINI_API_KEY is absent.
 *
 * This is NOT a simulated model call and must never be presented as one. It calls nothing,
 * costs nothing, and is plain column parsing over the text the user actually pasted. The
 * interface says so wherever a result produced this way is shown.
 *
 * It exists so the verification pipeline can be exercised end to end without a key — which
 * is the part worth demonstrating. Everything downstream is identical: the same audit, the
 * same positional range check, the same range evaluation. A quote it emits is genuinely
 * from the pasted document, so verification passes honestly rather than by exemption.
 *
 * It is deliberately narrow. It reads whitespace-aligned tables, which is what lab reports
 * print, and silently skips anything it does not recognise. It is worse than a model at
 * reading messy documents; that is the honest trade for needing no key.
 */

/** The document is delimited in the prompt; recover it for parsing. */
function extractDelimitedDocument(prompt: string): string {
  const match = /<untrusted_document>\n?([\s\S]*?)\n?<\/untrusted_document>/.exec(prompt);
  return match?.[1] ?? prompt;
}

const NUMERIC = /^[-+]?\d*\.?\d+$/;

/** Looks like a printed reference range: "13.0 - 17.0 g/dL", "<0.5", "> 200". */
function looksLikeRange(text: string): boolean {
  return /^[<>]?\s*[-+]?\d*\.?\d+(\s*(?:[-–—]|to)\s*[-+]?\d*\.?\d+)?/.test(text.trim());
}

/** Split "11.2 g/dL" into its number and unit. */
function splitValueAndUnit(cell: string): { value: number; unit: string | null } | null {
  const parts = cell.trim().split(/\s+/);
  const first = parts[0];
  if (first === undefined || !NUMERIC.test(first)) return null;

  const value = Number(first);
  if (!Number.isFinite(value)) return null;

  const unit = parts.slice(1).join(' ').trim();
  return { value, unit: unit === '' ? null : unit };
}

/** "Allergies: penicillin, latex" or "Medications   Metformin; Aspirin" -> the list. */
function parseLabelledList(line: string, label: RegExp): string[] | null {
  const match = label.exec(line);
  if (match === null) return null;
  return line
    .slice(match[0].length)
    .split(/[,;]|\s{2,}/)
    .map((item) => item.trim())
    .filter((item) => item !== '' && !/^(none|nil|n\/a|not known)$/i.test(item));
}

const ALLERGY_LABEL = /^allergies?\s*[::]?\s*/i;
const MEDICATION_LABEL = /^(?:current\s+)?medications?\s*[::]?\s*/i;

export function parseReportText(documentText: string): ExtractionResponse {
  const labs: ExtractionResponse['labs'] = [];
  const medications: string[] = [];
  const allergies: string[] = [];
  let reportDate: string | null = null;

  for (const rawLine of documentText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') continue;

    const dateMatch = /report\s*date\s*[::]\s*(\d{4}-\d{2}-\d{2})/i.exec(line);
    if (dateMatch?.[1] !== undefined) {
      reportDate = dateMatch[1];
      continue;
    }

    // Labelled lists come before the table parse, since "Allergies  Penicillin" is
    // column-shaped but is not a measurement.
    const allergyList = parseLabelledList(line, ALLERGY_LABEL);
    if (allergyList !== null) {
      allergies.push(...allergyList);
      continue;
    }

    const medicationList = parseLabelledList(line, MEDICATION_LABEL);
    if (medicationList !== null) {
      medications.push(...medicationList);
      continue;
    }

    // Lab tables are column-aligned: two or more spaces separate the columns.
    const columns = line.trim().split(/\s{2,}/);
    const name = columns[0]?.trim();
    const valueCell = columns[1];
    if (name === undefined || name === '' || valueCell === undefined) continue;
    if (!/[A-Za-z]/.test(name)) continue;

    const parsed = splitValueAndUnit(valueCell);
    if (parsed === null) continue;

    const rangeCell = columns[2]?.trim();
    const referenceText =
      rangeCell !== undefined && rangeCell !== '' && looksLikeRange(rangeCell)
        ? rangeCell.replace(/^Ref(?:erence)?\s*[::]\s*/i, '').trim()
        : null;

    labs.push({
      name,
      value: parsed.value,
      unit: parsed.unit,
      referenceText,
      // The whole line, verbatim from the document, so verification is genuine.
      sourceQuote: line.trim(),
      // Not a model's self-assessment: this is a deterministic parse that either
      // matched the column layout or was skipped entirely.
      confidence: 1,
    });
  }

  return { patient: { age: null, sex: null, reportDate }, labs, medications, allergies };
}

/**
 * A ModelClient that never calls a model. Shaped to the same seam so the pipeline,
 * verification and caching are exercised exactly as they are in the real path.
 */
export function createPatternFallbackClient(): ModelClient {
  return {
    generateStructured(request: ModelRequest): Promise<string> {
      const documentText = extractDelimitedDocument(request.prompt);
      return Promise.resolve(JSON.stringify(parseReportText(documentText)));
    },
  };
}
