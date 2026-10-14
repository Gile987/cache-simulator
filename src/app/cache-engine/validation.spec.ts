import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseIntegerField } from './validation';
import type { ValidationIssue } from './models';

describe('parseIntegerField', () => {
  it.each([
    ['1', 1],
    ['100', 100],
    [' 10 ', 10],
    ['3.0', 3],
    ['1e1', 10],
    ['0x10', 16],
  ] as const)('accepts "%s" as %s', (raw, value) => {
    const result = parseIntegerField(raw, 'size', 'Size');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issue.message);
    }
    expectTypeOf(result.value).toEqualTypeOf<number>();
    expect(result.value).toBe(value);
  });

  describe.each([
    ['size', 'Size'],
    ['capacity', 'Capacity'],
  ] as const)('%s validation', (field, label) => {
    it.each([
      ['', 'is required.'],
      ['   ', 'is required.'],
      ['1.5', 'must be a whole number.'],
      ['invalid', 'must be a whole number.'],
      ['Infinity', 'must be a whole number.'],
      ['9007199254740992', 'must be a whole number.'],
      ['0', 'must be between 1 and 100.'],
      ['101', 'must be between 1 and 100.'],
    ])('rejects "%s" with the existing field-specific message', (raw, message) => {
      const result = parseIntegerField(raw, field, label);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error(`Unexpected accepted value: ${result.value}`);
      }
      expectTypeOf(result.issue).toEqualTypeOf<ValidationIssue>();
      expect(result.issue).toEqual({ field, message: `${label} ${message}` });
    });

    it('accepts a corrected value after rejecting a fractional draft', () => {
      const rejected = parseIntegerField('2.5', field, label);
      const corrected = parseIntegerField('2', field, label);

      expect(rejected).toEqual({
        ok: false,
        issue: { field, message: `${label} must be a whole number.` },
      });
      expect(corrected).toEqual({ ok: true, value: 2 });
    });
  });

  it('honors custom inclusive limits and their validation message', () => {
    expect(parseIntegerField('5', 'size', 'Size', 5, 10)).toEqual({ ok: true, value: 5 });
    expect(parseIntegerField('10', 'size', 'Size', 5, 10)).toEqual({ ok: true, value: 10 });
    expect(parseIntegerField('4', 'size', 'Size', 5, 10)).toEqual({
      ok: false,
      issue: { field: 'size', message: 'Size must be between 5 and 10.' },
    });
    expect(parseIntegerField('11', 'size', 'Size', 5, 10)).toEqual({
      ok: false,
      issue: { field: 'size', message: 'Size must be between 5 and 10.' },
    });
  });
});
