import { describe, expect, it } from 'vitest';

import { evaluateRange, parseReferenceRange } from './evaluate';

describe('evaluateRange — bounded ranges', () => {
  it('reports a value inside the range as normal', () => {
    expect(evaluateRange({ value: 15, referenceText: '13 - 17' }).status).toBe('normal');
  });

  it('reports a value below the range as low', () => {
    expect(evaluateRange({ value: 11.2, referenceText: '13 - 17' }).status).toBe('low');
  });

  it('reports a value above the range as high', () => {
    expect(evaluateRange({ value: 19.4, referenceText: '13 - 17' }).status).toBe('high');
  });

  it('treats the lower bound as inclusive', () => {
    expect(evaluateRange({ value: 13, referenceText: '13 - 17' }).status).toBe('normal');
  });

  it('treats the upper bound as inclusive', () => {
    expect(evaluateRange({ value: 17, referenceText: '13 - 17' }).status).toBe('normal');
  });

  it('reports a hair below the lower bound as low', () => {
    expect(evaluateRange({ value: 12.99, referenceText: '13 - 17' }).status).toBe('low');
  });

  it('reports a hair above the upper bound as high', () => {
    expect(evaluateRange({ value: 17.01, referenceText: '13 - 17' }).status).toBe('high');
  });

  it('returns the parsed bounds alongside the status', () => {
    const result = evaluateRange({ value: 15, referenceText: '13 - 17' });

    expect(result.refLow).toBe(13);
    expect(result.refHigh).toBe(17);
  });
});

describe('evaluateRange — separator forms', () => {
  it('parses an en-dash separator', () => {
    expect(evaluateRange({ value: 15, referenceText: '13–17' }).status).toBe('normal');
  });

  it('parses an em-dash separator', () => {
    expect(evaluateRange({ value: 12, referenceText: '13—17' }).status).toBe('low');
  });

  it('parses a hyphen with no surrounding spaces', () => {
    expect(evaluateRange({ value: 15, referenceText: '13-17' }).status).toBe('normal');
  });

  it('parses the word "to" as a separator', () => {
    expect(evaluateRange({ value: 15, referenceText: '13 to 17' }).status).toBe('normal');
  });

  it('ignores a unit printed after the range', () => {
    const result = evaluateRange({ value: 15, referenceText: '13 - 17 g/dL' });

    expect(result.status).toBe('normal');
    expect(result.refHigh).toBe(17);
  });

  it('ignores surrounding brackets', () => {
    expect(evaluateRange({ value: 15, referenceText: '(13 - 17)' }).status).toBe('normal');
  });
});

describe('evaluateRange — open-ended ranges', () => {
  it('treats "<0.5" as normal below the bound', () => {
    expect(evaluateRange({ value: 0.3, referenceText: '<0.5' }).status).toBe('normal');
  });

  it('treats a value exactly at an exclusive upper bound as high', () => {
    expect(evaluateRange({ value: 0.5, referenceText: '<0.5' }).status).toBe('high');
  });

  it('treats a value above "<0.5" as high', () => {
    expect(evaluateRange({ value: 1.2, referenceText: '<0.5' }).status).toBe('high');
  });

  it('handles a space after the less-than sign', () => {
    expect(evaluateRange({ value: 0.3, referenceText: '< 0.5' }).status).toBe('normal');
  });

  it('treats ">200" as normal above the bound', () => {
    expect(evaluateRange({ value: 250, referenceText: '>200' }).status).toBe('normal');
  });

  it('treats a value exactly at an exclusive lower bound as low', () => {
    expect(evaluateRange({ value: 200, referenceText: '>200' }).status).toBe('low');
  });

  it('treats a value below ">200" as low', () => {
    expect(evaluateRange({ value: 150, referenceText: '>200' }).status).toBe('low');
  });
});

describe('evaluateRange — refusals to judge', () => {
  it('returns no_reference_in_source when the range is null', () => {
    expect(evaluateRange({ value: 15, referenceText: null }).status).toBe(
      'no_reference_in_source',
    );
  });

  it('returns no_reference_in_source when the range is absent entirely', () => {
    expect(evaluateRange({ value: 15 }).status).toBe('no_reference_in_source');
  });

  it('returns no_reference_in_source for an empty or whitespace range', () => {
    expect(evaluateRange({ value: 15, referenceText: '   ' }).status).toBe(
      'no_reference_in_source',
    );
  });

  it('never invents bounds when no range was printed', () => {
    const result = evaluateRange({ value: 15, referenceText: null });

    expect(result.refLow).toBeNull();
    expect(result.refHigh).toBeNull();
  });

  it('returns unparseable_range for prose', () => {
    expect(evaluateRange({ value: 15, referenceText: 'see comments' }).status).toBe(
      'unparseable_range',
    );
  });

  it('returns unparseable_range for a lone separator', () => {
    expect(evaluateRange({ value: 15, referenceText: '--' }).status).toBe('unparseable_range');
  });

  it('returns unparseable_range for an inverted range rather than reordering it', () => {
    expect(evaluateRange({ value: 15, referenceText: '17 - 13' }).status).toBe(
      'unparseable_range',
    );
  });

  it('returns unparseable_range when the value itself is not finite', () => {
    expect(evaluateRange({ value: Number.NaN, referenceText: '13 - 17' }).status).toBe(
      'unparseable_range',
    );
  });
});

describe('evaluateRange — unit handling', () => {
  it('returns unit_mismatch and refuses to compare when units differ', () => {
    const result = evaluateRange({
      value: 5.5,
      unit: 'mmol/L',
      referenceText: '70 - 110',
      refUnit: 'mg/dL',
    });

    expect(result.status).toBe('unit_mismatch');
  });

  it('still reports the bounds it read when refusing on a unit mismatch', () => {
    const result = evaluateRange({
      value: 5.5,
      unit: 'mmol/L',
      referenceText: '70 - 110',
      refUnit: 'mg/dL',
    });

    expect(result.refLow).toBe(70);
    expect(result.refHigh).toBe(110);
  });

  it('does not convert units — a mismatched value is never scored as low', () => {
    // 5.5 mmol/L is a normal glucose, but against a mg/dL range it would look
    // catastrophically low. Refusing is the whole point.
    const result = evaluateRange({
      value: 5.5,
      unit: 'mmol/L',
      referenceText: '70 - 110',
      refUnit: 'mg/dL',
    });

    expect(result.status).not.toBe('low');
  });

  it('compares normally when units match', () => {
    expect(
      evaluateRange({ value: 90, unit: 'mg/dL', referenceText: '70 - 110', refUnit: 'mg/dL' })
        .status,
    ).toBe('normal');
  });

  it('ignores case and spacing when comparing units', () => {
    expect(
      evaluateRange({ value: 90, unit: 'MG / DL', referenceText: '70 - 110', refUnit: 'mg/dL' })
        .status,
    ).toBe('normal');
  });

  it('treats the micro sign and Greek mu as the same unit', () => {
    expect(
      evaluateRange({ value: 5, unit: 'µg/L', referenceText: '3 - 8', refUnit: 'μg/L' }).status,
    ).toBe('normal');
  });

  it('does not claim a mismatch when only the value has a unit', () => {
    expect(evaluateRange({ value: 15, unit: 'g/dL', referenceText: '13 - 17' }).status).toBe(
      'normal',
    );
  });

  it('does not claim a mismatch when only the range has a unit', () => {
    expect(
      evaluateRange({ value: 15, referenceText: '13 - 17', refUnit: 'g/dL' }).status,
    ).toBe('normal');
  });
});

describe('evaluateRange — numeric edge cases', () => {
  it('handles a value of exactly zero inside the range', () => {
    expect(evaluateRange({ value: 0, referenceText: '0 - 5' }).status).toBe('normal');
  });

  it('handles zero as a low value', () => {
    expect(evaluateRange({ value: 0, referenceText: '13 - 17' }).status).toBe('low');
  });

  it('handles negative values', () => {
    expect(evaluateRange({ value: -3, referenceText: '-5 - 5' }).status).toBe('normal');
  });

  it('reports a negative value below a negative lower bound as low', () => {
    expect(evaluateRange({ value: -8, referenceText: '-5 - 5' }).status).toBe('low');
  });

  it('handles a decimal with a leading dot', () => {
    expect(evaluateRange({ value: 0.4, referenceText: '.2 - .8' }).status).toBe('normal');
  });
});

describe('parseReferenceRange', () => {
  it('returns null for unreadable text rather than a guess', () => {
    expect(parseReferenceRange('not a range')).toBeNull();
  });

  it('parses an exclusive upper bound', () => {
    expect(parseReferenceRange('<0.5')).toEqual({
      low: null,
      high: 0.5,
      exclusiveHigh: true,
      exclusiveLow: false,
    });
  });

  it('parses an exclusive lower bound', () => {
    expect(parseReferenceRange('>200')).toEqual({
      low: 200,
      high: null,
      exclusiveHigh: false,
      exclusiveLow: true,
    });
  });

  it('parses a bounded range with inclusive bounds', () => {
    expect(parseReferenceRange('13 - 17')).toEqual({
      low: 13,
      high: 17,
      exclusiveHigh: false,
      exclusiveLow: false,
    });
  });
});
