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
    kind: z.enum(['ETF', 'Stock', 'Fund']),
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
    sourceKind: z.enum(['issuer', 'provider', 'regulator']).optional(),
    mic: z.enum(['XCSE', 'DSME', 'FNDK']).optional(),
    yahooSymbol: z
      .string()
      .regex(/^[A-Z0-9][A-Z0-9.-]{0,29}$/)
      .optional(),
    yahooType: z.enum(['EQUITY', 'MUTUALFUND']).optional(),
    referenceStatus: z.enum(['current', 'retained']).optional(),
    symbolSource: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://'))
      .optional(),
  })
  .strict()
  .refine(
    (item) =>
      item.yahooType !== 'MUTUALFUND' ||
      (item.kind === 'Fund' && item.isin !== '' && item.sourceKind === 'issuer') ||
      (item.kind === 'Stock' &&
        item.mic !== undefined &&
        item.isin !== '' &&
        item.sourceKind === 'regulator'),
    'A provider fund classification requires issuer evidence or an official Danish share reference.',
  );
export type Instrument = z.infer<typeof instrumentSchema>;

export function providerInstrumentId(symbol: string) {
  return instrumentKeySchema.parse(`av-${symbol.toLowerCase().replaceAll('.', '-')}`);
}
