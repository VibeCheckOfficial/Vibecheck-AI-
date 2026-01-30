/**
 * Input Validation Utilities
 * 
 * Provides type-safe validation with detailed error messages.
 */

import { ValidationError } from './errors.js';

export type ValidationResult<T> = 
  | { valid: true; value: T }
  | { valid: false; errors: string[] };

export interface Validator<T> {
  (value: unknown): ValidationResult<T>;
}

/**
 * Create a string validator
 */
export function string(options: {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
} = {}): Validator<string> {
  return (value: unknown): ValidationResult<string> => {
    const errors: string[] = [];

    if (typeof value !== 'string') {
      return { valid: false, errors: ['Expected a string'] };
    }

    if (!options.allowEmpty && value.length === 0) {
      errors.push('String cannot be empty');
    }

    if (options.minLength !== undefined && value.length < options.minLength) {
      errors.push(`String must be at least ${options.minLength} characters`);
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
      errors.push(`String must be at most ${options.maxLength} characters`);
    }

    if (options.pattern && !options.pattern.test(value)) {
      errors.push(`String does not match required pattern`);
    }

    return errors.length === 0 ? { valid: true, value } : { valid: false, errors };
  };
}

/**
 * Create a number validator
 */
export function number(options: {
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
} = {}): Validator<number> {
  return (value: unknown): ValidationResult<number> => {
    const errors: string[] = [];

    if (typeof value !== 'number' || isNaN(value)) {
      return { valid: false, errors: ['Expected a number'] };
    }

    if (options.integer && !Number.isInteger(value)) {
      errors.push('Number must be an integer');
    }

    if (options.positive && value <= 0) {
      errors.push('Number must be positive');
    }

    if (options.min !== undefined && value < options.min) {
      errors.push(`Number must be at least ${options.min}`);
    }

    if (options.max !== undefined && value > options.max) {
      errors.push(`Number must be at most ${options.max}`);
    }

    return errors.length === 0 ? { valid: true, value } : { valid: false, errors };
  };
}

/**
 * Create an enum validator
 */
export function oneOf<T extends string | number>(allowed: readonly T[]): Validator<T> {
  return (value: unknown): ValidationResult<T> => {
    if (allowed.includes(value as T)) {
      return { valid: true, value: value as T };
    }
    return {
      valid: false,
      errors: [`Value must be one of: ${allowed.join(', ')}`],
    };
  };
}

/**
 * Create an array validator
 */
export function array<T>(
  itemValidator: Validator<T>,
  options: { minLength?: number; maxLength?: number } = {}
): Validator<T[]> {
  return (value: unknown): ValidationResult<T[]> => {
    const errors: string[] = [];

    if (!Array.isArray(value)) {
      return { valid: false, errors: ['Expected an array'] };
    }

    if (options.minLength !== undefined && value.length < options.minLength) {
      errors.push(`Array must have at least ${options.minLength} items`);
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
      errors.push(`Array must have at most ${options.maxLength} items`);
    }

    const validatedItems: T[] = [];
    for (let i = 0; i < value.length; i++) {
      const result = itemValidator(value[i]);
      if (result.valid) {
        validatedItems.push(result.value);
      } else {
        errors.push(...result.errors.map(e => `[${i}]: ${e}`));
      }
    }

    return errors.length === 0 
      ? { valid: true, value: validatedItems } 
      : { valid: false, errors };
  };
}

/**
 * Create an object validator
 */
export function object<T extends Record<string, unknown>>(
  schema: { [K in keyof T]: Validator<T[K]> },
  options: { allowExtra?: boolean } = {}
): Validator<T> {
  return (value: unknown): ValidationResult<T> => {
    const errors: string[] = [];

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { valid: false, errors: ['Expected an object'] };
    }

    const obj = value as Record<string, unknown>;
    const result: Partial<T> = {};

    // Validate known fields
    for (const key of Object.keys(schema) as Array<keyof T>) {
      const validator = schema[key];
      const fieldValue = obj[key as string];
      const fieldResult = validator(fieldValue);

      if (fieldResult.valid) {
        result[key] = fieldResult.value;
      } else {
        errors.push(...fieldResult.errors.map(e => `${String(key)}: ${e}`));
      }
    }

    // Check for extra fields
    if (!options.allowExtra) {
      const extraKeys = Object.keys(obj).filter(k => !(k in schema));
      if (extraKeys.length > 0) {
        errors.push(`Unexpected fields: ${extraKeys.join(', ')}`);
      }
    }

    return errors.length === 0 
      ? { valid: true, value: result as T } 
      : { valid: false, errors };
  };
}

/**
 * Create an optional validator
 */
export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value: unknown): ValidationResult<T | undefined> => {
    if (value === undefined || value === null) {
      return { valid: true, value: undefined };
    }
    return validator(value);
  };
}

/**
 * Create a nullable validator
 */
export function nullable<T>(validator: Validator<T>): Validator<T | null> {
  return (value: unknown): ValidationResult<T | null> => {
    if (value === null) {
      return { valid: true, value: null };
    }
    return validator(value);
  };
}

/**
 * Validate and throw if invalid
 */
export function validateOrThrow<T>(
  value: unknown,
  validator: Validator<T>,
  context: { component: string; operation: string; field?: string }
): T {
  const result = validator(value);
  
  if (result.valid) {
    return result.value;
  }

  throw new ValidationError(
    result.errors.join('; '),
    {
      component: context.component,
      operation: context.operation,
      field: context.field,
      value,
      constraints: result.errors,
    }
  );
}

/**
 * Validate a path string
 */
export const pathValidator = string({
  minLength: 1,
  maxLength: 500,
  pattern: /^[a-zA-Z0-9_\-./\\@[\]]+$/,
});

/**
 * Validate a safe filename
 */
export const filenameValidator = string({
  minLength: 1,
  maxLength: 255,
  pattern: /^[a-zA-Z0-9_\-. ]+$/,
});

/**
 * Sanitize a string for safe use
 */
export function sanitize(input: string): string {
  return input
    .replace(/[<>:"\/\\|?*\x00-\x1F]/g, '') // Remove unsafe chars
    .trim()
    .slice(0, 1000); // Limit length
}

/**
 * Check if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep freeze an object
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj;
}
