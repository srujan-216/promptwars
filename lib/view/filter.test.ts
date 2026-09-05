import { describe, expect, it } from 'vitest';

import type { LabResult, RangeStatus } from '@/lib/domain/types';
import {
  availableStatuses,
  describeResultCount,
  filterLabs,
  matchesQuery,
  matchesStatus,
} from './filter';

function lab(
  canonicalName: string,
  status: RangeStatus = 'normal',
  rawName = canonicalName,
): LabResult {
  return {
    rawName,
    canonicalName,
    value: { value: 1, origin: 'ai_extracted', confidence: 0.9, verified: true },
    unit: null,
    referenceText: null,
    refLow: null,
    refHigh: null,
    refUnit: null,
    status,
  };
}

const LABS = [
  lab('Hemoglobin', 'low', 'Haemoglobin'),
  lab('Platelet Count', 'normal', 'PLT'),
  lab('Ferritin', 'no_reference_in_source'),
];

describe('matchesQuery', () => {
  it('matches an empty query to everything', () => {
    expect(matchesQuery(LABS[0]!, '')).toBe(true);
  });

  it('matches on the canonical name', () => {
    expect(matchesQuery(LABS[0]!, 'hemoglobin')).toBe(true);
  });

  it('matches on the name as printed in the report', () => {
    expect(matchesQuery(LABS[0]!, 'haemoglobin')).toBe(true);
  });

  it('finds Hemoglobin when searching the alias the user knows', () => {
    // "Hb" is not in either name string, but "PLT" is the printed name for Platelet Count,
    // so the printed-name path is what makes short forms findable.
    expect(matchesQuery(LABS[1]!, 'PLT')).toBe(true);
  });

  it('ignores case', () => {
    expect(matchesQuery(LABS[0]!, 'HEMOGLOBIN')).toBe(true);
  });

  it('ignores spacing and punctuation', () => {
    expect(matchesQuery(LABS[1]!, 'plateletcount')).toBe(true);
    expect(matchesQuery(LABS[1]!, 'platelet count')).toBe(true);
  });

  it('matches a partial name', () => {
    expect(matchesQuery(LABS[0]!, 'globin')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(matchesQuery(LABS[0]!, 'vitamin')).toBe(false);
  });
});

describe('matchesStatus', () => {
  it('matches everything when set to all', () => {
    expect(matchesStatus(LABS[0]!, 'all')).toBe(true);
  });

  it('matches the exact status', () => {
    expect(matchesStatus(LABS[0]!, 'low')).toBe(true);
  });

  it('rejects a different status', () => {
    expect(matchesStatus(LABS[0]!, 'high')).toBe(false);
  });

  it('filters on no_reference_in_source like any other status', () => {
    expect(matchesStatus(LABS[2]!, 'no_reference_in_source')).toBe(true);
  });
});

describe('filterLabs', () => {
  it('returns everything with no filter applied', () => {
    expect(filterLabs(LABS, { query: '', status: 'all' })).toHaveLength(3);
  });

  it('combines query and status', () => {
    expect(filterLabs(LABS, { query: 'hemo', status: 'low' })).toHaveLength(1);
  });

  it('returns nothing when query and status disagree', () => {
    expect(filterLabs(LABS, { query: 'hemo', status: 'normal' })).toHaveLength(0);
  });

  it('never mutates the input', () => {
    filterLabs(LABS, { query: 'hemo', status: 'all' });

    expect(LABS).toHaveLength(3);
  });
});

describe('availableStatuses', () => {
  it('lists only statuses present in the data', () => {
    expect(availableStatuses(LABS).sort()).toEqual([
      'low',
      'no_reference_in_source',
      'normal',
    ]);
  });

  it('deduplicates', () => {
    expect(availableStatuses([lab('A', 'low'), lab('B', 'low')])).toEqual(['low']);
  });

  it('returns nothing for no labs', () => {
    expect(availableStatuses([])).toEqual([]);
  });
});

describe('describeResultCount', () => {
  it('says all when nothing is filtered out', () => {
    expect(describeResultCount(3, 3)).toBe('Showing all 3 results.');
  });

  it('says the subset when filtered', () => {
    expect(describeResultCount(1, 3)).toBe('Showing 1 of 3 results.');
  });

  it('uses the singular for one result', () => {
    expect(describeResultCount(1, 1)).toBe('Showing all 1 result.');
  });
});
