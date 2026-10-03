import { instruments } from '../../shared/catalog';
import type { Workspace, MarketSeries, InstrumentId } from '../../shared/schema';

export const emptyWorkspace = (): Workspace => ({
  version: 1,
  name: 'My workspace',
  plan: {
    initial: 25000,
    monthly: 2500,
    years: 20,
    returnRate: 6,
    fee: 0.3,
    inflation: 2,
    goal: 1000000,
    account: 'general',
    realTerms: false,
    married: false,
  },
  transactions: [],
  watchlist: [],
  completedLessons: [],
});
export function demoWorkspace(): Workspace {
  return {
    ...emptyWorkspace(),
    name: 'My investing space',
    watchlist: [
      {
        instrumentId: 'vwce',
        note: 'Understand how a global fund spreads investments across countries.',
      },
      { instrumentId: 'eunl', note: '' },
      { instrumentId: 'novo', note: 'Learn how a single company differs from a diversified fund.' },
    ],
    transactions: [
      {
        id: 'demo-buy-1',
        instrumentId: 'vwce',
        type: 'buy',
        date: '2025-01-06',
        quantity: 25,
        price: 105,
        fx: 7.46,
        fees: 29,
        note: 'Illustrative purchase — not a real trade',
      },
      {
        id: 'demo-buy-2',
        instrumentId: 'eunl',
        type: 'buy',
        date: '2025-03-03',
        quantity: 20,
        price: 90,
        fx: 7.46,
        fees: 29,
        note: 'Illustrative purchase — not a real trade',
      },
    ],
  };
}
export function demoMarket(): Record<InstrumentId, MarketSeries> {
  return Object.fromEntries(
    instruments.map((instrument, index) => {
      const points: MarketSeries['points'] = [];
      const bases = [75, 60, 23, 300, 420, 250];
      for (let month = 0; month < 60; month++) {
        const close =
          bases[index] *
          Math.exp(
            month * (0.008 + index * 0.0005) +
              Math.sin(month * 0.7 + index) * 0.045 -
              (month >= 17 && month <= 24 ? 0.19 * Math.sin(((month - 17) / 7) * Math.PI) : 0),
          );
        points.push({
          date: new Date(Date.UTC(2021 + Math.floor(month / 12), month % 12, 28))
            .toISOString()
            .slice(0, 10),
          close: Math.round(close * 100) / 100,
        });
      }
      return [
        instrument.id,
        {
          instrumentId: instrument.id,
          currency: instrument.currency,
          source: 'demo',
          fetchedAt: '2026-01-01T00:00:00.000Z',
          fxToDkk: instrument.currency === 'DKK' ? 1 : instrument.currency === 'EUR' ? 7.46 : 6.8,
          fxDate: '2025-12-28',
          points,
        },
      ];
    }),
  ) as Record<InstrumentId, MarketSeries>;
}
