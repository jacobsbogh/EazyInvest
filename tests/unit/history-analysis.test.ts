import { describe, expect, it } from 'vitest';
import { analyzeHistory } from '../../shared/history-analysis';
import type { HistoryObservation } from '../../shared/history-types';

function monthEnds(startYear: number, startMonth: number, count: number): HistoryObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(startYear, startMonth + index + 1, 0)).toISOString().slice(0, 10),
    value: 100,
  }));
}

function expectFiniteNumbers(value: unknown) {
  if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) value.forEach(expectFiniteNumbers);
  else if (value && typeof value === 'object') Object.values(value).forEach(expectFiniteNumbers);
}

describe('available-history returns', () => {
  it('uses actual dated endpoints and ACT/365.25, including leap days', () => {
    const result = analyzeHistory(
      [
        { date: '2020-01-01', value: 100 },
        { date: '2022-01-01', value: 121 },
      ],
      { asOf: '2022-01-02' },
    );
    expect(result.status).toBe('available');
    expect(result.headline).toMatchObject({
      startDate: '2020-01-01',
      endDate: '2022-01-01',
      elapsedDays: 731,
    });
    expect(result.headline!.totalReturn).toBeCloseTo(0.21, 12);
    // An independently dated 731-day period, rather than an assumed two 365-day years.
    expect(result.headline!.annualizedReturn).toBeCloseTo(Math.pow(1.21, 365.25 / 731) - 1, 12);
  });

  it('does not annualize a short period, and handles a February 29 anniversary', () => {
    const short = analyzeHistory(
      [
        { date: '2024-06-01', value: 100 },
        { date: '2024-12-01', value: 110 },
      ],
      { asOf: '2025-01-01' },
    );
    expect(short.headline!.elapsedDays).toBe(183);
    expect(short.headline!.annualizedReturn).toBeNull();
    const anniversary = analyzeHistory(
      [
        { date: '2020-02-29', value: 100 },
        { date: '2021-02-28', value: 110 },
      ],
      { asOf: '2021-03-01' },
    );
    expect(anniversary.headline!.annualizedReturn).toBeCloseTo(Math.pow(1.1, 365.25 / 365) - 1, 12);
  });

  it('identifies initial partial years, December-to-December years, gaps and current YTD', () => {
    const result = analyzeHistory(
      [
        { date: '2019-06-14', value: 50 },
        { date: '2019-12-30', value: 100 },
        { date: '2020-06-30', value: 90 },
        { date: '2020-12-31', value: 120 },
        { date: '2021-12-31', value: 144 },
        { date: '2022-11-30', value: 100 },
        { date: '2023-12-29', value: 200 },
        { date: '2024-10-02', value: 220 },
      ],
      { asOf: '2024-10-04' },
    );
    expect(result.yearly.map(({ year, kind }) => [year, kind])).toEqual([
      [2019, 'partial-year'],
      [2020, 'full-year'],
      [2021, 'full-year'],
      [2022, 'partial-year'],
      [2023, 'partial-year'],
      [2024, 'ytd'],
    ]);
    expect(result.yearly[0].totalReturn).toBe(1);
    expect(result.yearly[1]).toMatchObject({ startDate: '2019-12-30', endDate: '2020-12-31' });
    expect(result.yearly[1].totalReturn).toBeCloseTo(0.2, 12);
    expect(result.yearly[2].totalReturn).toBeCloseTo(0.2, 12);
    expect(result.yearly[3].totalReturn).toBeCloseTo(100 / 144 - 1, 12);
    expect(result.yearly[4].totalReturn).toBeNull();
    expect(result.yearly[5].totalReturn).toBeCloseTo(0.1, 12);
  });

  it('keeps the current December partial until that month is completed', () => {
    const points = [
      { date: '2023-12-29', value: 100 },
      { date: '2024-12-30', value: 120 },
    ];
    expect(analyzeHistory(points, { asOf: '2024-12-31' }).yearly.at(-1)!.kind).toBe('ytd');
    expect(analyzeHistory(points, { asOf: '2025-01-01' }).yearly.at(-1)!.kind).toBe('full-year');
  });
});

describe('observed rolling holding periods', () => {
  it('requires 61 monthly endpoints for one five-year window and reports its actual dates', () => {
    const points = monthEnds(2020, 0, 61);
    points[60].value = 200;
    const result = analyzeHistory(points, { asOf: '2025-02-01' });
    const five = result.rolling[0];
    expect(five).toMatchObject({
      years: 5,
      months: 60,
      sampleCount: 1,
      lossCount: 0,
      lossShare: 0,
    });
    expect(five.best).toEqual(five.worst);
    expect(five.best).toMatchObject({
      startDate: '2020-01-31',
      endDate: '2025-01-31',
      totalReturn: 1,
      elapsedDays: 1827,
    });
    expect(five.best!.annualizedReturn).toBeCloseTo(Math.pow(2, 365.25 / 1827) - 1, 12);
    expect(result.rolling[1].sampleCount).toBe(0);
    expect(result.rolling[2].sampleCount).toBe(0);
  });

  it('counts overlapping observations, losses and all supported holding periods', () => {
    const points = monthEnds(2000, 0, 242);
    points[241].value = 50;
    const result = analyzeHistory(points, { asOf: '2020-03-01' });
    expect(result.rolling.map((rolling) => rolling.sampleCount)).toEqual([182, 122, 2]);
    expect(result.rolling.map((rolling) => rolling.lossCount)).toEqual([1, 1, 1]);
    expect(result.rolling[0].lossShare).toBeCloseTo(1 / 182, 12);
    expect(result.rolling[1].lossShare).toBeCloseTo(1 / 122, 12);
    expect(result.rolling[2].lossShare).toBe(0.5);
    expect(result.rolling[0].best).toMatchObject({
      startDate: '2000-01-31',
      endDate: '2005-01-31',
      totalReturn: 0,
      annualizedReturn: 0,
    });
    expect(result.rolling[0].worst).toMatchObject({
      startDate: '2015-02-28',
      endDate: '2020-02-29',
      totalReturn: -0.5,
    });
    expect(result.rolling[2].worst).toMatchObject({
      startDate: '2000-02-29',
      endDate: '2020-02-29',
      totalReturn: -0.5,
    });
  });

  it('excludes the current partial month while retaining it for headline and YTD returns', () => {
    const points = monthEnds(2020, 0, 61);
    points[60] = { date: '2025-01-08', value: 200 };
    const result = analyzeHistory(points, { asOf: '2025-01-10' });
    expect(result.completedMonthCount).toBe(60);
    expect(result.rolling[0].sampleCount).toBe(0);
    expect(result.headline!.endDate).toBe('2025-01-08');
    expect(result.headline!.totalReturn).toBe(1);
    expect(result.yearly.at(-1)).toMatchObject({ kind: 'ytd', totalReturn: 1 });
  });

  it('does not bridge missing months even when endpoints span exactly five years', () => {
    const points = monthEnds(2020, 0, 61).filter((point) => point.date !== '2022-06-30');
    const result = analyzeHistory(points, { asOf: '2025-02-01' });
    expect(result.headline!.startDate).toBe('2020-01-31');
    expect(result.headline!.endDate).toBe('2025-01-31');
    expect(result.completedMonthCount).toBe(60);
    expect(result.rolling[0].sampleCount).toBe(0);
    expect(result.rolling[0].lossShare).toBeNull();
  });

  it('uses the last observation in each completed month without changing its input', () => {
    const points = monthEnds(2020, 0, 61);
    points[60].value = 200;
    points.unshift({ date: '2020-01-15', value: 50 });
    const before = structuredClone(points);
    const result = analyzeHistory(points, { asOf: '2025-02-01' });
    expect(result.observationCount).toBe(62);
    expect(result.completedMonthCount).toBe(61);
    expect(result.headline!.totalReturn).toBe(3);
    expect(result.rolling[0].best!.totalReturn).toBe(1);
    expect(result.rolling[0].best!.startDate).toBe('2020-01-31');
    expect(points).toEqual(before);
  });
});

describe('unavailable and malformed history', () => {
  it('makes insufficient history explicit without invented returns or windows', () => {
    for (const points of [[], [{ date: '2024-01-31', value: 100 }]]) {
      const result = analyzeHistory(points, { asOf: '2025-01-01' });
      expect(result.status).toBe('insufficient-history');
      expect(result.headline).toBeNull();
      expect(
        result.rolling.every(
          (rolling) =>
            rolling.sampleCount === 0 && rolling.best === null && rolling.lossShare === null,
        ),
      ).toBe(true);
    }
  });

  it('rejects invalid, future, duplicate and reversed observations safely', () => {
    const valid = [
      { date: '2024-01-31', value: 100 },
      { date: '2024-02-29', value: 110 },
    ];
    const invalid: unknown[] = [
      null,
      undefined,
      {},
      [null],
      [{ date: '2024-02-30', value: 100 }],
      [{ date: '2024-2-01', value: 100 }],
      [{ date: '2024-01-31T00:00:00Z', value: 100 }],
      [{ date: '2026-01-31', value: 100 }],
      ...[0, -1, NaN, Infinity, '100'].map((value) => [{ date: '2024-01-31', value }]),
      [valid[0], valid[0]],
      [...valid].reverse(),
    ];
    for (const points of invalid) {
      const result = analyzeHistory(points as HistoryObservation[], { asOf: '2025-01-01' });
      expect(result.status).toBe('invalid-history');
      expect(result.headline).toBeNull();
      expectFiniteNumbers(result);
    }
    expect(analyzeHistory(valid, { asOf: 'bad-date' }).status).toBe('invalid-history');
  });

  it('never exposes NaN or Infinity even when otherwise valid numerical inputs overflow', () => {
    const points = monthEnds(2020, 0, 61);
    points[0].value = Number.MIN_VALUE;
    points[60].value = Number.MAX_VALUE;
    const result = analyzeHistory(points, { asOf: '2025-02-01' });
    expect(result.status).toBe('available');
    expect(result.headline!.totalReturn).toBeNull();
    expect(result.rolling[0].sampleCount).toBe(0);
    expectFiniteNumbers(result);
  });
});
