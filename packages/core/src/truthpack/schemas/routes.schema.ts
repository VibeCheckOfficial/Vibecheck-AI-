/**
 * Routes Schema
 * 
 * Defines the structure for route truthpack data.
 */

import { z } from 'zod';

export const HttpMethodSchema = z.enum([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'
]);

export const RouteParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'uuid']),
  required: z.boolean(),
  description: z.string().optional(),
});

export const RouteDefinitionSchema = z.object({
  path: z.string(),
  method: HttpMethodSchema,
  handler: z.string(),
  file: z.string(),
  line: z.number(),
  parameters: z.array(RouteParameterSchema).optional(),
  middleware: z.array(z.string()).optional(),
  auth: z.object({
    required: z.boolean(),
    roles: z.array(z.string()).optional(),
  }).optional(),
  description: z.string().optional(),
});

export const RoutesSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  routes: z.array(RouteDefinitionSchema),
  summary: z.object({
    totalRoutes: z.number(),
    byMethod: z.record(z.number()),
    protectedRoutes: z.number(),
    publicRoutes: z.number(),
  }),
});

export type RouteDefinition = z.infer<typeof RouteDefinitionSchema>;
export type Routes = z.infer<typeof RoutesSchema>;
