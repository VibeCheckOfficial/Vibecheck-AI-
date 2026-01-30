/**
 * Environment Variables Schema
 * 
 * Defines the structure for environment variable truthpack data.
 */

import { z } from 'zod';

export const EnvVariableSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'url', 'secret']),
  required: z.boolean(),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
  usedIn: z.array(z.object({
    file: z.string(),
    line: z.number(),
  })).optional(),
  sensitive: z.boolean().default(false),
  validationPattern: z.string().optional(),
});

export const EnvSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  variables: z.array(EnvVariableSchema),
  environments: z.array(z.object({
    name: z.string(),
    file: z.string().optional(),
    variables: z.array(z.string()),
  })),
  summary: z.object({
    totalVariables: z.number(),
    required: z.number(),
    optional: z.number(),
    sensitive: z.number(),
  }),
});

export type EnvVariable = z.infer<typeof EnvVariableSchema>;
export type Env = z.infer<typeof EnvSchema>;
