/**
 * UI Graph Schema
 * 
 * Defines the structure for UI component graph truthpack data.
 */

import { z } from 'zod';

export const PropDefinitionSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
});

export const ComponentDependencySchema = z.object({
  name: z.string(),
  type: z.enum(['import', 'render', 'context', 'hook']),
  path: z.string().optional(),
});

export const UiComponentSchema = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number(),
  type: z.enum(['function', 'class', 'forwardRef', 'memo']),
  props: z.array(PropDefinitionSchema),
  dependencies: z.array(ComponentDependencySchema),
  children: z.array(z.string()).optional(),
  hooks: z.array(z.string()).optional(),
  contexts: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const UiGraphSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  components: z.array(UiComponentSchema),
  pages: z.array(z.object({
    path: z.string(),
    component: z.string(),
    layout: z.string().optional(),
  })).optional(),
  layouts: z.array(z.object({
    name: z.string(),
    file: z.string(),
    slots: z.array(z.string()),
  })).optional(),
  summary: z.object({
    totalComponents: z.number(),
    totalPages: z.number(),
    maxDepth: z.number(),
  }),
});

export type UiComponent = z.infer<typeof UiComponentSchema>;
export type UiGraph = z.infer<typeof UiGraphSchema>;
