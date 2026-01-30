/**
 * API Contracts Schema
 * 
 * Defines the structure for API contract truthpack data.
 */

import { z } from 'zod';

export const SchemaPropertySchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'null']),
    required: z.boolean().optional(),
    description: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
    items: SchemaPropertySchema.optional(),
    properties: z.record(SchemaPropertySchema).optional(),
  })
);

export const RequestSchemaSchema = z.object({
  headers: z.record(SchemaPropertySchema).optional(),
  params: z.record(SchemaPropertySchema).optional(),
  query: z.record(SchemaPropertySchema).optional(),
  body: SchemaPropertySchema.optional(),
});

export const ResponseSchemaSchema = z.object({
  statusCode: z.number(),
  description: z.string().optional(),
  headers: z.record(SchemaPropertySchema).optional(),
  body: SchemaPropertySchema.optional(),
});

export const ApiContractSchema = z.object({
  path: z.string(),
  method: z.string(),
  operationId: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  request: RequestSchemaSchema,
  responses: z.array(ResponseSchemaSchema),
  examples: z.array(z.object({
    name: z.string(),
    request: z.unknown(),
    response: z.unknown(),
  })).optional(),
});

export const ContractsSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  contracts: z.array(ApiContractSchema),
  summary: z.object({
    totalEndpoints: z.number(),
    byTag: z.record(z.number()),
  }),
});

export type ApiContract = z.infer<typeof ApiContractSchema>;
export type Contracts = z.infer<typeof ContractsSchema>;
