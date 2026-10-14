import { ValidationField, ValidationIssue } from './models';

export const MIN_VALUE = 1;
export const MAX_VALUE = 100;
export const MAX_KEY_LENGTH = 40;

export function normalizeKey(raw: string): string {
  return raw.trim();
}

export function validateKey(raw: string): ValidationIssue | null {
  const key = normalizeKey(raw);
  if (key.length === 0) {
    return { field: 'key', message: 'Enter a key.' };
  }
  if (key.length > MAX_KEY_LENGTH) {
    return { field: 'key', message: `Use at most ${MAX_KEY_LENGTH} characters.` };
  }
  return null;
}

export interface IntegerParseResult {
  readonly value: number | null;
  readonly issue: ValidationIssue | null;
}

export function parseIntegerField(
  raw: string,
  field: ValidationField,
  label: string,
  min: number = MIN_VALUE,
  max: number = MAX_VALUE,
): IntegerParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { value: null, issue: { field, message: `${label} is required.` } };
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    return { value: null, issue: { field, message: `${label} must be a whole number.` } };
  }
  if (value < min || value > max) {
    return {
      value: null,
      issue: { field, message: `${label} must be between ${min} and ${max}.` },
    };
  }
  return { value, issue: null };
}
