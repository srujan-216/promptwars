# Responsible AI

The brief forbids clinical judgement. This document records what MedLens deliberately does
**not** build, and — more usefully — the mechanism that would stop each one from creeping
back in. A promise not to do something is worth less than a structure that makes doing it
awkward.

## Never build

| Not built | Why | Mechanism that enforces it |
| --- | --- | --- |
| **Risk scores** | A number implying likelihood of disease is a clinical prediction, and one users would act on. | No scoring code exists. `RangeStatus` (`lib/domain/types.ts`) is a closed union of six positional facts with no numeric or ordinal severity. Adding a score means adding a type. |
| **Differential diagnosis / "possible conditions"** | Naming candidate conditions is diagnosis, however it is hedged. | `lib/server/ai/guardrail.ts` rejects `diagnos(ed\|is\|e)`, `you have`, `this indicates`, `you likely have`. The extraction schema (`lib/server/extraction/schema.ts`) has no field a condition could be returned in. |
| **Drug-interaction warnings** | Interaction significance is prescribing judgement and depends on dose, renal function and indication we do not have. | `lib/conflicts/detect.ts` handles medications only as *duplicate entries* — a data-quality observation. It has no interaction table and no pharmacology. |
| **Critical-value alerts we compute ourselves** | Deciding a value is dangerous is exactly the judgement the brief forbids. | `evaluateRange` returns only position relative to a range **printed in the source**. There is no threshold table, no "critical" status, and no path that escalates a status. |
| **Symptom checkers** | Mapping symptoms to causes is diagnosis. | `lib/clarify/questions.ts` only *asks* about symptoms. Its test `contains no advice, urgency or clinical judgement language` regex-asserts every generated string against `you should\|see a doctor\|urgent\|may indicate\|suggests\|diagnos\|treat\|prescrib\|dose`. |
| **Dosage guidance** | Prescribing. | Guardrail rules `prescription_language`, `dosage_language` and `treatment_change_language` reject `take X 200 mg`, `dosage`, `increase your dose`, `stop taking`. |

### The one exception

If a source report **itself** printed a critical flag, that flag is surfaced as an
extracted field with its `sourceQuote`, attributed to the document. It is never presented
as our determination. The distinction is the whole point: reporting that a lab wrote
"CRITICAL" is transcription; deciding a value is critical is diagnosis.

## Positive commitments

**Clinical status is computed, not generated.** `lib/ranges/evaluate.ts` is a pure function
and the only code permitted to produce `low`/`normal`/`high`. The model contributes value,
unit and the printed range text — nothing else. Even a fully compromised model cannot
change a status directly; it can only supply inputs that are then verified.

**Refusal is a first-class outcome.** Three of six `RangeStatus` values are refusals:
`no_reference_in_source`, `unparseable_range`, `unit_mismatch`. Units are never converted —
5.5 mmol/L against a 70–110 mg/dL range would read as catastrophically low, so the system
declines to compare rather than guessing. Test: `does not convert units — a mismatched
value is never scored as low`.

**Absent means absent.** No reference range is ever recalled from training data. If the
document printed none, the answer is "none printed", not a typical range.

**Conflicts are flagged, never resolved.** `lib/conflicts/detect.ts` reports that two
values disagree and stops. Choosing between them is clinical judgement.

## The guardrail fallback chain

Every model-written sentence passes `checkGuardrail` before display. There is no path that
shows a user text which has not passed it.

1. **Generate**, then check. If clean → shown, `source: 'generated'`.
2. **Regenerate once**, with a stricter instruction naming the failure. If clean → shown,
   `source: 'regenerated'`, and `guardrailTriggered` is set true so the interface can say
   the guardrail fired.
3. **Deterministic template** — `buildDeterministicSummary`, built from counts by pure
   code. `source: 'deterministic_template'`.

Tier 3 is what makes the chain safe to ship. It reports only counts about the document and
our own processing, and makes no claim about the patient, so it cannot fail the guardrail.
This is asserted, not assumed: `passes the guardrail for every combination of counts` runs
27 count permutations through `checkGuardrail` and requires every one to pass. A provider
outage also lands here rather than showing nothing — `falls back rather than failing when
the provider throws`.

The guardrail is a **language** filter, not a truth filter. It cannot tell whether a
statement is medically correct, and does not try. Correctness is handled upstream, by
showing only what the document printed and by verifying every field against it.

## Why no second model as judge

An LLM-as-judge would itself need verifying, would add a call and a failure mode, and would
be non-deterministic on a safety-critical check. A regex scan is auditable, instant, free,
and identical on every run. Its limits are visible in the source, which a model's are not.
