import type { ReactElement, ReactNode } from 'react';

import { LabResultsSection } from '@/components/medical/LabResultsSection';
import { OriginBadge } from '@/components/medical/OriginBadge';
import type { FieldOrigin, LabResult } from '@/lib/domain/types';

/**
 * The structured record, grouped into the sections a person expects to find (item 15).
 *
 * Every displayed field carries an origin badge, and every lab result carries a status
 * badge that is icon + text + colour. A section with no data says so rather than being
 * hidden, because "we found no medications" and "we did not look" are different claims.
 */

export interface SimpleField {
  path: string;
  label: string;
  value: string;
  origin: FieldOrigin;
  verified?: boolean;
}

export interface RecordData {
  patientInformation: SimpleField[];
  symptoms: SimpleField[];
  conditionsAndHistory: SimpleField[];
  allergies: SimpleField[];
  medications: SimpleField[];
  labs: LabResult[];
  additionalObservations: SimpleField[];
}

function Section({
  id,
  title,
  isEmpty,
  emptyMessage,
  children,
}: {
  id: string;
  title: string;
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 id={`${id}-heading`} className="text-base font-semibold text-slate-900">
        {title}
      </h3>
      {isEmpty ? <p className="mt-2 text-sm text-slate-600">{emptyMessage}</p> : children}
    </section>
  );
}

function FieldList({ fields }: { fields: readonly SimpleField[] }): ReactElement {
  return (
    <dl className="mt-3 flex flex-col gap-3">
      {fields.map((field) => (
        <div key={field.path} id={field.path} className="flex flex-col gap-1">
          <dt className="text-sm text-slate-600">{field.label}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{field.value}</span>
            <OriginBadge
              origin={field.origin}
              {...(field.verified !== undefined ? { verified: field.verified } : {})}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StructuredRecord({ data }: { data: RecordData }): ReactElement {
  return (
    <section aria-labelledby="record-heading" className="flex flex-col gap-4">
      <h2 id="record-heading" className="text-lg font-semibold text-slate-900">
        Structured record
      </h2>

      <Section
        id="patient-information"
        title="Patient information"
        isEmpty={data.patientInformation.length === 0}
        emptyMessage="No patient details were provided or found."
      >
        <FieldList fields={data.patientInformation} />
      </Section>

      <Section
        id="symptoms"
        title="Symptoms"
        isEmpty={data.symptoms.length === 0}
        emptyMessage="No symptoms were entered."
      >
        <FieldList fields={data.symptoms} />
      </Section>

      <Section
        id="conditions"
        title="Conditions & history"
        isEmpty={data.conditionsAndHistory.length === 0}
        emptyMessage="No conditions or history were recorded."
      >
        <FieldList fields={data.conditionsAndHistory} />
      </Section>

      <Section
        id="allergies"
        title="Allergies"
        isEmpty={data.allergies.length === 0}
        emptyMessage="No allergies were recorded. This is not the same as confirming there are none."
      >
        <FieldList fields={data.allergies} />
      </Section>

      <Section
        id="medications"
        title="Medications"
        isEmpty={data.medications.length === 0}
        emptyMessage="No medications were recorded."
      >
        <FieldList fields={data.medications} />
      </Section>

      <LabResultsSection labs={data.labs} />

      <Section
        id="observations"
        title="Additional observations"
        isEmpty={data.additionalObservations.length === 0}
        emptyMessage="Nothing further was recorded."
      >
        <FieldList fields={data.additionalObservations} />
      </Section>
    </section>
  );
}
