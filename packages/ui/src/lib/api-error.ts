import type { TFunction } from 'i18next';
import { APIError } from './backend-adapter/core';

const CODE_TO_KEY: Record<string, string> = {
  NOT_FOUND: 'apiCodes.notFound',
  PROJECT_NOT_FOUND: 'apiCodes.projectNotFound',
  SPEC_NOT_FOUND: 'apiCodes.specNotFound',
  NO_PROJECT: 'apiCodes.noProject',
  INVALID_REQUEST: 'apiCodes.invalidRequest',
  UNAUTHORIZED: 'apiCodes.unauthorized',
  VALIDATION_FAILED: 'apiCodes.validationFailed',
  DATABASE_ERROR: 'apiCodes.databaseError',
  CONFIG_ERROR: 'apiCodes.configError',
  TOOL_NOT_FOUND: 'apiCodes.toolNotFound',
  TOOL_ERROR: 'apiCodes.toolError',
  INTERNAL_ERROR: 'apiCodes.internalError',
};

export function describeApiError(err: unknown, t: TFunction): string {
  if (err instanceof APIError) {
    if (err.code) {
      const key = CODE_TO_KEY[err.code];
      if (key) {
        return t(key, { ns: 'errors', defaultValue: err.message });
      }
    }

    switch (err.status) {
      case 404:
        return t('specNotFound', { ns: 'errors' });
      case 400:
        return t('invalidInput', { ns: 'errors' });
      case 500:
        return t('unknownError', { ns: 'errors' });
      default:
        return t('loadingError', { ns: 'errors' });
    }
  }

  if (err instanceof Error && err.message.includes('Failed to fetch')) {
    return t('networkError', { ns: 'errors' });
  }

  return err instanceof Error ? err.message : t('unknownError', { ns: 'errors' });
}
