import { z } from 'zod';
import { instrumentKeySchema } from './instrument.js';

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const strategySchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    name: z.string().trim().min(1).max(80),
    allocations: z
      .array(
        z
          .object({
            instrumentId: instrumentKeySchema,
            weight: z.number().finite().positive().max(100),
          })
          .strict(),
      )
      .min(1)
      .max(5),
    initial: z.number().finite().min(0).max(100_000_000),
    monthly: z.number().finite().min(0).max(1_000_000),
    goal: z.number().finite().positive().max(100_000_000),
    account: z.enum(['general', 'ask', 'annual', 'none']),
    rebalance: z.enum(['none', 'annual']),
    note: z.string().max(2000),
    startMonth: monthSchema.nullable(),
    endMonth: monthSchema.nullable(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(s.allocations.map((a) => a.instrumentId)).size !== s.allocations.length)
      issue('Choose each investment only once.');
    if (Math.abs(s.allocations.reduce((sum, a) => sum + a.weight, 0) - 100) > 0.000001)
      issue('Investment allocations must total 100%.');
    if (s.initial === 0 && s.monthly === 0)
      issue('Enter starting money or a monthly contribution.');
    if (s.startMonth && s.endMonth && s.startMonth > s.endMonth)
      issue('The start month must be on or before the end month.');
  });
export type Strategy = z.infer<typeof strategySchema>;
