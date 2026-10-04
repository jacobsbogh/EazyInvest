import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { z } from 'zod';
import { ProviderError } from './alpha-vantage.js';

export const budgetSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    used: z.number().int().min(0).max(25),
    lastRequestAt: z.number().finite().nonnegative(),
  })
  .strict();
export function nextBudget(input: unknown, now: number) {
  const day = new Date(now).toISOString().slice(0, 10);
  const previous =
    input === undefined ? { day, used: 0, lastRequestAt: 0 } : budgetSchema.parse(input);
  if (previous.day > day) throw new Error('Budget clock is ahead of this run.');
  const used = previous.day === day ? previous.used : 0;
  if (used >= 25) throw new ProviderError('quota');
  return { day, used: used + 1, lastRequestAt: Math.max(now, previous.lastRequestAt + 13000) };
}
export function dailyAllowance(db: Firestore) {
  let runUsed = 0;
  return async () => {
    if (runUsed >= 25) throw new ProviderError('quota');
    const reserved = await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'marketSync', 'budget');
      const current = await transaction.get(ref);
      const next = nextBudget(current.exists() ? current.data() : undefined, Date.now());
      transaction.set(ref, next);
      return next;
    });
    runUsed++;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, reserved.lastRequestAt - Date.now())),
    );
  };
}
