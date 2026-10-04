import { useId, useMemo } from 'react';
import { analyzeHistory } from '../../shared/history-analysis';
import type { HistoryReturnPeriod } from '../../shared/history-analysis';
import type { HistoryObservation } from '../../shared/history-types';
import { date, number, percent } from '../lib/format';
import { Empty, Note } from './ui';

export type HoldingPeriodAnalysisProps = {
  points: readonly HistoryObservation[];
  currency: 'EUR' | 'USD' | 'DKK';
  adjusted: boolean;
  demo: boolean;
  asOf?: string;
  unavailableReason?: string;
};

function ObservedWindow({ period }: { period: HistoryReturnPeriod }) {
  return (
    <div className="holding-window">
      <strong>{percent(period.annualizedReturn!)} /yr</strong>
      <small>{percent(period.totalReturn!)} total</small>
      <small>
        {date(period.startDate)} – {date(period.endDate)}
      </small>
    </div>
  );
}

export function HoldingPeriodAnalysis({
  points,
  currency,
  adjusted,
  demo,
  asOf,
  unavailableReason,
}: HoldingPeriodAnalysisProps) {
  const headingId = useId();
  const analysis = useMemo(() => analyzeHistory(points, { asOf }), [points, asOf]);
  const period = analysis.headline;
  return (
    <section className="card holding-analysis" aria-labelledby={headingId}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">ACROSS AVAILABLE HISTORY</div>
          <h2 id={headingId}>Holding-period analysis</h2>
          <p>
            {demo ? 'Generated example' : adjusted ? 'Adjusted returns' : 'Price changes'} in{' '}
            {currency}
            {period && (
              <>
                {' '}
                · {date(period.startDate)} – {date(period.endDate)}
              </>
            )}
          </p>
        </div>
      </div>
      {period ? (
        <>
          <div className="detail-metrics holding-summary">
            <div>
              <span>
                {adjusted ? 'Available-history adjusted return' : 'Available-history price change'}
              </span>
              <strong>
                {period.totalReturn === null ? 'Not available' : percent(period.totalReturn)}
              </strong>
            </div>
            <div>
              <span>Annualized return</span>
              <strong>
                {period.annualizedReturn === null
                  ? 'Not annualized'
                  : `${percent(period.annualizedReturn)} /yr`}
              </strong>
              {period.annualizedReturn === null && (
                <small>Requires at least one calendar year and calculable values.</small>
              )}
            </div>
            <div>
              <span>Observed history</span>
              <strong>
                {number(period.elapsedDays / 365.25, 1)} <small>years</small>
              </strong>
            </div>
          </div>
          <h3>Observed holding periods</h3>
          <p className="muted text-small">
            Every consecutive completed month is required. These results use all available history,
            independently of the chart range and comparison dates.
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Observed holding-period results"
          >
            <table className="holding-table">
              <caption className="sr-only">
                Best and worst observed annualized holding-period returns in {currency}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Holding period</th>
                  <th scope="col">{demo ? 'Example windows' : 'Observed windows'}</th>
                  <th scope="col">Worst annualized</th>
                  <th scope="col">Best annualized</th>
                  <th scope="col">Ended at a loss</th>
                </tr>
              </thead>
              <tbody>
                {analysis.rolling.map((rolling) => (
                  <tr key={rolling.years}>
                    <th scope="row">{rolling.years} years</th>
                    <td>{number(rolling.sampleCount, 0)}</td>
                    {rolling.best && rolling.worst ? (
                      <>
                        <td>
                          <ObservedWindow period={rolling.worst} />
                        </td>
                        <td>
                          <ObservedWindow period={rolling.best} />
                        </td>
                        <td>
                          {rolling.lossCount} of {rolling.sampleCount}
                          <small className="holding-loss-share">
                            {number(rolling.lossShare! * 100, 1)}% of observed windows
                          </small>
                        </td>
                      </>
                    ) : (
                      <td colSpan={3}>
                        Insufficient continuous history. Requires {rolling.months + 1} consecutive
                        completed monthly observations; {analysis.completedMonthCount} available.
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="holding-yearly">
            <summary>Calendar-year results ({analysis.yearly.length})</summary>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Calendar-year results"
            >
              <table className="holding-table">
                <caption className="sr-only">
                  Calendar-year returns in {currency}, with partial years identified
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">Period</th>
                    <th scope="col">Observed dates</th>
                    <th scope="col">{adjusted ? 'Adjusted return' : 'Price change'}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...analysis.yearly].reverse().map((year) => (
                    <tr key={year.year}>
                      <th scope="row">{year.year}</th>
                      <td>
                        {year.kind === 'full-year'
                          ? 'Full year'
                          : year.kind === 'ytd'
                            ? 'Year to date'
                            : 'Partial year'}
                      </td>
                      <td>
                        {date(year.startDate)} – {date(year.endDate)}
                      </td>
                      <td>
                        {year.totalReturn === null ? 'Not available' : percent(year.totalReturn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="muted text-small holding-method">
            Annualized returns use actual elapsed UTC days divided by 365.25; periods shorter than
            one calendar year are not annualized. Full calendar years run from the previous December
            observation to a completed December observation. Year to date uses the previous December
            baseline; years missing a baseline or year end are labelled partial. Rolling windows
            exclude the current partial month and never bridge missing months.
          </p>
          <Note>
            {demo
              ? 'Generated windows illustrate the calculation; they are sample data.'
              : 'Historical windows overlap. Their loss frequency is an observed share, not a probability or forecast.'}{' '}
            {adjusted
              ? 'Adjusted values reflect the provider’s split and dividend adjustments.'
              : 'Price changes exclude dividends and are not total returns.'}{' '}
            Returns exclude personal taxes and trading costs.
          </Note>
        </>
      ) : (
        <Empty
          title={
            unavailableReason
              ? 'Historical analysis unavailable'
              : analysis.status === 'invalid-history'
                ? 'History cannot be analyzed'
                : 'More history needed'
          }
        >
          {unavailableReason ?? analysis.issue}
        </Empty>
      )}
    </section>
  );
}
