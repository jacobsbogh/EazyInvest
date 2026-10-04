import { z } from 'zod';

export const instrumentKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,59}$/);
export const instrumentSchema = z
  .object({
    id: instrumentKeySchema,
    name: z.string().trim().min(1).max(160),
    shortName: z.string().trim().min(1).max(80),
    ticker: z.string().trim().min(1).max(30),
    exchange: z.string().min(1).max(30),
    currency: z.enum(['EUR', 'USD', 'DKK']),
    kind: z.enum(['ETF', 'Stock']),
    region: z.string().min(1).max(60),
    description: z.string().max(1000),
    isin: z.string().refine((value) => value === '' || /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value)),
    source: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://')),
    color: z.string().regex(/^#[a-f0-9]{6}$/i),
    providerSymbol: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9.-]{0,29}$/)
      .optional(),
    sourceKind: z.enum(['issuer', 'provider']).optional(),
  })
  .strict();
export type Instrument = z.infer<typeof instrumentSchema>;

export function providerInstrumentId(symbol: string) {
  return instrumentKeySchema.parse(`av-${symbol.toLowerCase().replaceAll('.', '-')}`);
}
