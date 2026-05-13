import { describe, expect, it } from 'vitest';
import { parseArrayProperty, parseTags, coerceToStringArray } from '../../src/utils/parse-tags.js';

describe('parseArrayProperty', () => {
  it('parses JSON arrays', () => {
    expect(parseArrayProperty('["a","b"]', 'when_to_use')).toEqual(['a', 'b']);
  });

  it('parses JSON-encoded multiline strings from seeded database rows', () => {
    const value = '"Line one\\nLine two\\nLine three"';
    expect(parseArrayProperty(value, 'benefits')).toEqual(['Line one', 'Line two', 'Line three']);
  });

  it('parses raw multiline strings for array-like properties', () => {
    const value = 'First\nSecond\nThird';
    expect(parseArrayProperty(value, 'drawbacks')).toEqual(['First', 'Second', 'Third']);
  });

  it('parses comma-separated tags', () => {
    expect(parseTags('alpha, beta, gamma')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns a single value for array-like properties when only one item exists', () => {
    expect(parseArrayProperty('Single item', 'use_cases')).toEqual(['Single item']);
  });
});

describe('coerceToStringArray', () => {
  it('parses JSON string benefits like a serialized array', () => {
    expect(coerceToStringArray('["alpha","beta"]', 'benefits')).toEqual(['alpha', 'beta']);
  });

  it('normalizes scalar and null inputs without throwing', () => {
    expect(coerceToStringArray(null, 'benefits')).toEqual([]);
    expect(coerceToStringArray(42, 'benefits')).toEqual(['42']);
    expect(coerceToStringArray(true, 'benefits')).toEqual(['true']);
  });

  it('passes through real arrays while stringifying elements', () => {
    expect(coerceToStringArray(['x', 2], 'tags')).toEqual(['x', '2']);
  });
});
