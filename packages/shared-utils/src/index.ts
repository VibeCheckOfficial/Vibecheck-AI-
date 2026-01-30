/**
 * Shared utilities for the monorepo
 */

import type { ApiResponse, ApiError } from '@repo/shared-types';

export const createSuccessResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
});

export const createErrorResponse = <T>(error: ApiError): ApiResponse<T> => ({
  success: false,
  error,
});

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const isNonNullable = <T>(value: T): value is NonNullable<T> =>
  value !== null && value !== undefined;

export const validateConfig = <T extends Record<string, unknown>>(
  config: T,
  requiredKeys: (keyof T)[]
): { valid: boolean; missing: string[] } => {
  const missing = requiredKeys.filter(
    (key) => config[key] === undefined || config[key] === null
  );
  return {
    valid: missing.length === 0,
    missing: missing as string[],
  };
};

export const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
};
