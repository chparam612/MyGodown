/**
 * Error extraction and normalization utilities for standard backend error envelopes.
 * Standard error shape: { success: false, error: { code, message, details?: [{ field, message }] } }
 */

/**
 * Extracts a human-readable top-level error message from an API error or Axios exception.
 * @param {any} error
 * @param {string} fallback
 * @returns {string}
 */
export function getErrorMessage(error, fallback = 'An unexpected error occurred') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  // Normalized API envelope from backend
  if (error.response?.data?.error?.message) {
    return error.response.data.error.message;
  }

  // Already unwrapped error object
  if (error.error?.message) {
    return error.error.message;
  }

  // Axios or standard Error message
  if (error.message) {
    return error.message;
  }

  return fallback;
}

/**
 * Extracts field-level validation errors from the details array of a 400 Bad Request envelope.
 * @param {any} error
 * @returns {Record<string, string>} Map of fieldName -> errorMessage
 */
export function getFieldErrors(error) {
  const details = error?.response?.data?.error?.details || error?.error?.details || error?.details;
  if (!Array.isArray(details)) return {};

  const map = {};
  for (const item of details) {
    if (item.field && item.message) {
      // Keep first error message for a given field
      if (!map[item.field]) {
        map[item.field] = item.message;
      }
    }
  }
  return map;
}

/**
 * Extracts standard backend error code (e.g. 'VALIDATION_ERROR', 'FORBIDDEN', 'CONFLICT', 'NOT_FOUND').
 * @param {any} error
 * @returns {string|null}
 */
export function getErrorCode(error) {
  return error?.response?.data?.error?.code || error?.error?.code || null;
}
