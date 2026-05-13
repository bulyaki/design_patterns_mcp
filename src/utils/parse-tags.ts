/**
 * Safely parse array properties from database storage
 * Handles various formats: JSON string, comma-separated string, or array
 */
export function parseArrayProperty(
  data: string | string[] | null | undefined,
  propertyName?: string
): string[] {
  if (!data) return [];

  // If already an array, return as is
  if (Array.isArray(data)) return data;

  const normalizeStringValue = (value: string): string[] => {
    const cleanedValue = value.trim();
    if (cleanedValue.length === 0) return [];

    const isArrayLikeProperty = ['when_to_use', 'benefits', 'drawbacks', 'use_cases'].includes(
      propertyName ?? ''
    );

    if (cleanedValue.includes('\n')) {
      return cleanedValue
        .split('\n')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }

    const isCommaSplittable =
      propertyName === 'tags' || (cleanedValue.includes(',') && cleanedValue.length < 200);

    if (isCommaSplittable) {
      return cleanedValue
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }

    if (cleanedValue.includes(';')) {
      return cleanedValue
        .split(';')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }

    if (isArrayLikeProperty) {
      return cleanedValue.length > 0 ? [cleanedValue] : [];
    }

    if (cleanedValue.length < 500) {
      return [cleanedValue];
    }

    return [];
  };

  // If string, try to parse as JSON
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data);
      if (Array.isArray(parsed)) {
        // Ensure all items are strings
        if (parsed.every((item): item is string => typeof item === 'string')) {
          return parsed;
        }
        return parsed.map(item => String(item));
      }

      if (typeof parsed === 'string') {
        return normalizeStringValue(parsed);
      }

      if (parsed !== null && parsed !== undefined) {
        return [String(parsed)];
      }

      return [];
    } catch {
      return normalizeStringValue(data);
    }
  }

  return [];
}

/**
 * Safely parse tags from database storage
 * Handles various formats: JSON string, comma-separated string, or array
 */
export function parseTags(tags: string | string[] | null | undefined): string[] {
  return parseArrayProperty(tags, 'tags');
}

/**
 * Coerce unknown values (e.g. malformed DB or transport payloads) into string[]
 * so callers can safely join/format without assuming Array.isArray upstream.
 */
export function coerceToStringArray(data: unknown, propertyName?: string): string[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.map(item => String(item));
  }
  if (typeof data === 'string') {
    return parseArrayProperty(data, propertyName);
  }
  if (typeof data === 'number' || typeof data === 'boolean') {
    return [String(data)];
  }
  return [];
}
