import { AxiosError } from 'axios';

/**
 * DRF answers errors in three shapes:
 *   { detail: "..." }                  — APIException / AuthenticationFailed
 *   { non_field_errors: ["..."] }      — serializer validate()
 *   { email: ["..."], password: [...] } — per-field validation
 * These helpers flatten them without guessing which one arrived.
 */

const RESERVED_KEYS = new Set(['detail', 'non_field_errors']);

const firstString = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const found = value.find((entry) => typeof entry === 'string');
    return typeof found === 'string' ? found : null;
  }
  return null;
};

export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string => {
  if (!(error instanceof AxiosError)) return fallback;

  // No response at all: offline, DNS failure, CORS, or the 10s timeout.
  if (!error.response) {
    return error.code === 'ECONNABORTED'
      ? 'The server took too long to respond.'
      : 'Could not reach the server. Check your connection.';
  }

  const data = error.response.data;
  if (typeof data === 'string' && data.trim()) return data;
  if (!data || typeof data !== 'object') return fallback;

  const body = data as Record<string, unknown>;
  return (
    firstString(body.detail) ??
    firstString(body.non_field_errors) ??
    firstString(Object.values(body)[0]) ??
    fallback
  );
};

/** Per-field messages, ready to hand to <Input error={...} />. */
export const getFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof AxiosError)) return {};
  const data = error.response?.data;
  if (!data || typeof data !== 'object') return {};

  return Object.entries(data as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (RESERVED_KEYS.has(key)) return acc;
      const message = firstString(value);
      if (message) acc[key] = message;
      return acc;
    },
    {},
  );
};
