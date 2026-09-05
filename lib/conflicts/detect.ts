/**
 * Deterministic conflict detection (CLAUDE.md rule 7).
 *
 * Every rule here is an explicit, readable comparison — no model is consulted, because
 * every one of these questions has an exact answer.
 *
 * Conflicts are FLAGGED, never resolved. Deciding which of two contradictory values is
 * correct is clinical judgement, and the system does not have the standing to make it.
 * The output says what disagrees and leaves the resolution to a person.
 */

export type ConflictCode =
  | 'allergy_contradiction'
  | 'divergent_same_day_result'
  | 'future_report_date'
  | 'duplicate_medication';

export interface Conflict {
  code: ConflictCode;
  severity: 'critical' | 'warning';
  /** Plain-language statement of the disagreement. Never a recommendation. */
  message: string;
  /** Field paths involved, so the UI can link to each side of the conflict. */
  paths: string[];
}

export interface IntakeSnapshot {
  /** The patient ticked "no known allergies". */
  noKnownAllergies: boolean;
  /** Allergies the patient listed themselves. */
  allergies: readonly string[];
  /** Medications the patient listed themselves. */
  medications: readonly string[];
}

export interface LabObservation {
  path: string;
  canonicalName: string;
  value: number;
  unit: string | null;
  /** ISO date (YYYY-MM-DD) the sample was reported, when known. */
  reportDate: string | null;
}

export interface ConflictInput {
  intake: IntakeSnapshot;
  labs: readonly LabObservation[];
  /** Allergies mentioned in the uploaded document, as extracted. */
  documentAllergies?: readonly string[];
  /** Medications mentioned in the uploaded document, as extracted. */
  documentMedications?: readonly string[];
  /** Report date from the document header, ISO (YYYY-MM-DD). */
  reportDate?: string | null;
  /** Injected so the rule is testable and deterministic. Defaults to now. */
  now?: Date;
}

/** Case- and whitespace-insensitive key for comparing free-text names. */
function nameKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Two results are "divergent" when they differ by more than a hair. A tiny difference
 * is rounding between two printings of the same number, not a genuine disagreement.
 */
function isDivergent(a: number, b: number): boolean {
  const difference = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return difference / scale > 0.001;
}

/** Parse an ISO date, returning null rather than an Invalid Date. */
function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function detectConflicts(input: ConflictInput): Conflict[] {
  const {
    intake,
    labs,
    documentAllergies = [],
    documentMedications = [],
    reportDate = null,
    now = new Date(),
  } = input;

  const conflicts: Conflict[] = [];

  // --- Intake claims no allergies, but the record names one --------------------
  if (intake.noKnownAllergies && documentAllergies.length > 0) {
    conflicts.push({
      code: 'allergy_contradiction',
      severity: 'critical',
      message: `Intake records no known allergies, but the uploaded document mentions ${documentAllergies
        .map((a) => `"${a}"`)
        .join(', ')}. These disagree and need confirming.`,
      paths: ['intake.noKnownAllergies'],
    });
  }

  // --- Same analyte, same date, different values -------------------------------
  const byAnalyteAndDate = new Map<string, LabObservation[]>();
  for (const lab of labs) {
    if (lab.reportDate === null) continue;
    const key = `${nameKey(lab.canonicalName)}@${lab.reportDate}`;
    const bucket = byAnalyteAndDate.get(key);
    if (bucket === undefined) {
      byAnalyteAndDate.set(key, [lab]);
    } else {
      bucket.push(lab);
    }
  }

  for (const group of byAnalyteAndDate.values()) {
    const first = group[0];
    if (first === undefined || group.length < 2) continue;

    const divergent = group.filter((lab) => isDivergent(lab.value, first.value));
    if (divergent.length === 0) continue;

    const values = group.map((lab) => `${String(lab.value)}${lab.unit ?? ''}`).join(' and ');
    conflicts.push({
      code: 'divergent_same_day_result',
      severity: 'critical',
      message: `${first.canonicalName} is reported as ${values} on ${first.reportDate ?? 'the same date'}. Both cannot be right; this needs review.`,
      paths: group.map((lab) => lab.path),
    });
  }

  // --- Report date in the future -----------------------------------------------
  if (reportDate !== null) {
    const parsed = parseIsoDate(reportDate);
    if (parsed !== null && parsed.getTime() > now.getTime()) {
      conflicts.push({
        code: 'future_report_date',
        severity: 'warning',
        message: `The report is dated ${reportDate}, which is in the future. The date may have been misread.`,
        paths: ['report.date'],
      });
    }
  }

  // --- Duplicated medication ----------------------------------------------------
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const medication of [...intake.medications, ...documentMedications]) {
    const key = nameKey(medication);
    if (key === '') continue;
    if (seen.has(key)) {
      duplicates.add(medication.trim());
    } else {
      seen.add(key);
    }
  }

  for (const duplicate of duplicates) {
    conflicts.push({
      code: 'duplicate_medication',
      severity: 'warning',
      message: `"${duplicate}" is listed more than once. This may be a duplicate entry rather than two separate items.`,
      paths: ['medications'],
    });
  }

  return conflicts;
}
