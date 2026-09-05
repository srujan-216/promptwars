import type { SimpleField } from '@/components/medical/StructuredRecord';
import type { Provenanced } from '@/lib/domain/types';
import { sexLabel, type Intake } from '@/lib/intake/schema';

/**
 * Turn intake into provenanced fields (CR-1 feeding CR-5).
 *
 * Every value here is wrapped in `Provenanced<string>` with `origin: 'user_provided'`.
 * That is the point of the exercise: the distinction between "a person typed this" and
 * "a model read this out of a document" is carried in the type, not in a UI convention
 * someone might forget to apply.
 *
 * `verified: true` here means something different from a verified extraction, and the
 * difference is worth stating: an extracted field is verified when its quote was found in
 * the document. A user-provided field has no document to check against — it is verified in
 * the sense that its origin is known with certainty. It is NOT a claim that the user is
 * correct. `confidence: 1` reflects certainty about provenance, never about truth.
 */

export function provenancedUserValue(value: string): Provenanced<string> {
  return {
    value,
    origin: 'user_provided',
    confidence: 1,
    verified: true,
  };
}

function toField(path: string, label: string, value: string): SimpleField {
  const provenanced = provenancedUserValue(value);
  return {
    path,
    label,
    value: provenanced.value,
    origin: provenanced.origin,
    verified: provenanced.verified,
  };
}

export interface IntakeSections {
  patientInformation: SimpleField[];
  symptoms: SimpleField[];
  conditionsAndHistory: SimpleField[];
  allergies: SimpleField[];
  medications: SimpleField[];
  additionalObservations: SimpleField[];
}

export function intakeToSections(intake: Intake): IntakeSections {
  const patientInformation: SimpleField[] = [];
  if (intake.identifier !== '') {
    patientInformation.push(toField('intake.identifier', 'Name or identifier', intake.identifier));
  }
  if (intake.age !== null) {
    patientInformation.push(toField('intake.age', 'Age', String(intake.age)));
  }
  if (intake.sex !== null) {
    patientInformation.push(toField('intake.sex', 'Sex', sexLabel(intake.sex)));
  }

  const symptoms = intake.symptoms.map((symptom, index) =>
    toField(
      `intake.symptoms.${String(index)}`,
      symptom.name,
      symptom.duration === '' ? 'Duration not given' : `Duration: ${symptom.duration}`,
    ),
  );

  const conditionsAndHistory = intake.conditions.map((condition, index) =>
    toField(`intake.conditions.${String(index)}`, 'Condition', condition),
  );

  const allergies = intake.noKnownAllergies
    ? [toField('intake.allergies.none', 'Allergies', 'No known allergies (stated by patient)')]
    : intake.allergies.map((allergy, index) =>
        toField(`intake.allergies.${String(index)}`, 'Allergy', allergy),
      );

  const medications = intake.medications.map((medication, index) =>
    toField(`intake.medications.${String(index)}`, 'Medication', medication),
  );

  const additionalObservations =
    intake.notes === '' ? [] : [toField('intake.notes', 'Additional notes', intake.notes)];

  return {
    patientInformation,
    symptoms,
    conditionsAndHistory,
    allergies,
    medications,
    additionalObservations,
  };
}

/** Shape intake for `runExtractionPipeline`, which feeds conflicts and clarification. */
export function intakeForPipeline(intake: Intake): {
  noKnownAllergies: boolean;
  allergies: readonly string[];
  medications: readonly string[];
  age: number | null;
  sex: string | null;
  symptoms: readonly { path: string; name: string; duration: string | null }[];
} {
  return {
    noKnownAllergies: intake.noKnownAllergies,
    allergies: intake.allergies,
    medications: intake.medications,
    age: intake.age,
    sex: intake.sex,
    symptoms: intake.symptoms.map((symptom, index) => ({
      path: `intake.symptoms.${String(index)}`,
      name: symptom.name,
      duration: symptom.duration === '' ? null : symptom.duration,
    })),
  };
}
