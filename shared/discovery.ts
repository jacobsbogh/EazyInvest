import { z } from 'zod';
import { instrumentKeySchema, instrumentSchema } from './instrument.js';

export const searchQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[\p{L}\p{N} .&'()-]+$/u, 'Use a company name or ticker.');
export const requestStatusSchema = z.enum(['pending', 'ready', 'unavailable', 'error']);
export const discoverySchema = z
  .object({
    query: searchQuerySchema,
    requestedAt: z.string().datetime(),
    status: requestStatusSchema,
    completedAt: z.string().datetime().optional(),
    results: z.array(instrumentSchema).max(10).optional(),
  })
  .strict();
export const historyRequestSchema = z
  .object({
    instrumentId: instrumentKeySchema,
    requestedAt: z.string().datetime(),
    status: requestStatusSchema,
    completedAt: z.string().datetime().optional(),
  })
  .strict();
export type Discovery = z.infer<typeof discoverySchema>;
export type HistoryRequest = z.infer<typeof historyRequestSchema>;
