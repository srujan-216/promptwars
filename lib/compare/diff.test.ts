import { describe, expect, it } from 'vitest';

import { compareReports, type ComparableResult } from './diff';

const hb = (value: number, unit: string | null = 'g/dL'): ComparableResult => ({
  canonicalName: 'Hemoglobin',
  value,
  unit,
});

describe('compareReports — matched analytes', () => {
  it('computes a positive delta and an increased direction', () => {
    const [row] = compareReports([hb(11.2)], [hb(13.4)]);

    expect(row?.delta).toBeCloseTo(2.2);
    expect(row?.direction).toBe('increased');
  });

  it('computes a negative delta and a decreased direction', () => {
    const [row] = compareReports([hb(14.0)], [hb(11.2)]);

    expect(row?.delta).toBeCloseTo(-2.8);
    expect(row?.direction).toBe('decreased');
  });

  it('reports an unchanged value', () => {
    const [row] = compareReports([hb(13.0)], [hb(13.0)]);

    expect(row?.delta).toBe(0);
    expect(row?.direction).toBe('unchanged');
  });

  it('computes percentage change relative to the previous value', () => {
    const [row] = compareReports([hb(10)], [hb(12)]);

    expect(row?.percentChange).toBeCloseTo(20);
  });

  it('computes percentage change for a decrease', () => {
    const [row] = compareReports([hb(10)], [hb(8)]);

    expect(row?.percentChange).toBeCloseTo(-20);
  });

  it('returns null percentage when the previous value was zero', () => {
    const [row] = compareReports([hb(0)], [hb(5)]);

    expect(row?.percentChange).toBeNull();
    expect(row?.delta).toBe(5);
  });

  it('matches on canonical name regardless of case and spacing', () => {
    const rows = compareReports(
      [{ canonicalName: 'Hemoglobin', value: 11, unit: 'g/dL' }],
      [{ canonicalName: '  hemoglobin  ', value: 13, unit: 'g/dL' }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.delta).toBeCloseTo(2);
  });

  it('carries the unit through', () => {
    const [row] = compareReports([hb(11)], [hb(13)]);

    expect(row?.unit).toBe('g/dL');
  });
});

describe('compareReports — analytes present on only one side', () => {
  it('flags an analyte only in the previous report', () => {
    const rows = compareReports([hb(11)], []);

    expect(rows[0]?.onlyInPrevious).toBe(true);
    expect(rows[0]?.current).toBeNull();
    expect(rows[0]?.delta).toBeNull();
    expect(rows[0]?.direction).toBeNull();
  });

  it('flags an analyte only in the current report', () => {
    const rows = compareReports([], [hb(13)]);

    expect(rows[0]?.onlyInCurrent).toBe(true);
    expect(rows[0]?.previous).toBeNull();
    expect(rows[0]?.delta).toBeNull();
  });

  it('does not drop analytes that appear on only one side', () => {
    const rows = compareReports(
      [hb(11), { canonicalName: 'Ferritin', value: 18, unit: 'ng/mL' }],
      [hb(13)],
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.canonicalName)).toEqual(['Ferritin', 'Hemoglobin']);
  });
});

describe('compareReports — unit safety', () => {
  it('refuses to compute a delta across differing units', () => {
    const [row] = compareReports(
      [{ canonicalName: 'Glucose', value: 90, unit: 'mg/dL' }],
      [{ canonicalName: 'Glucose', value: 5.0, unit: 'mmol/L' }],
    );

    expect(row?.unitMismatch).toBe(true);
    expect(row?.delta).toBeNull();
    expect(row?.direction).toBeNull();
  });

  it('still shows both values when units differ', () => {
    const [row] = compareReports(
      [{ canonicalName: 'Glucose', value: 90, unit: 'mg/dL' }],
      [{ canonicalName: 'Glucose', value: 5.0, unit: 'mmol/L' }],
    );

    expect(row?.previous).toBe(90);
    expect(row?.current).toBe(5.0);
  });

  it('does not claim a mismatch when one side has no unit', () => {
    const [row] = compareReports([hb(11, null)], [hb(13)]);

    expect(row?.unitMismatch).toBe(false);
    expect(row?.delta).toBeCloseTo(2);
  });

  it('treats equivalent unit spellings as the same unit', () => {
    const [row] = compareReports([hb(11, 'G/DL')], [hb(13, 'g/dL')]);

    expect(row?.unitMismatch).toBe(false);
  });
});

describe('compareReports — output contract', () => {
  it('returns rows sorted by canonical name', () => {
    const rows = compareReports(
      [
        { canonicalName: 'Platelet Count', value: 200, unit: '10^3/uL' },
        { canonicalName: 'Ferritin', value: 18, unit: 'ng/mL' },
      ],
      [hb(13)],
    );

    expect(rows.map((r) => r.canonicalName)).toEqual([
      'Ferritin',
      'Hemoglobin',
      'Platelet Count',
    ]);
  });

  it('returns an empty list for two empty reports', () => {
    expect(compareReports([], [])).toEqual([]);
  });

  it('describes the number only — direction carries no clinical meaning', () => {
    // A fall in haemoglobin and a fall in cholesterol both read "decreased".
    // Neither is labelled better or worse, because that would be interpretation.
    const [row] = compareReports([hb(14)], [hb(11)]);

    expect(row?.direction).toBe('decreased');
    expect(JSON.stringify(row)).not.toMatch(/worse|better|improve|worsen|concern/i);
  });

  it('is deterministic', () => {
    const previous = [hb(11)];
    const current = [hb(13)];

    expect(compareReports(previous, current)).toEqual(compareReports(previous, current));
  });
});
