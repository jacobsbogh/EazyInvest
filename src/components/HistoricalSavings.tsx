import { useId, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryObservation } from '../../shared/history-types';
import {
  completedSavingsObservations,
  SAVINGS_INITIAL_LIMIT,
  SAVINGS_MONTHLY_LIMIT,
  simulateMonthlySavings,
} from '../../shared/savings-simulation';
import type { SavingsSimulation } from '../../shared/savings-simulation';
import { date, money, number } from '../lib/format';
import { Empty, Field, Note } from './ui';

export type HistoricalSavingsProps = {
  points: HistoryObservation[];
  adjusted: boolean;
  demo: boolean;
  unavailableReason?: string;
};

export function HistoricalSavings({
  points,
  adjusted,
  demo,
  unavailableReason,
}: HistoricalSavingsProps) {
  const [startChoice, setStartChoice] = useState('');
  const [endChoice, setEndChoice] = useState('');
  const [monthly, setMonthly] = useState('1000');
  const [initial, setInitial] = useState('0');
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const headingId = useId();
  const asOf = new Date().toISOString().slice(0, 10);
  let completed: HistoryObservation[] = [];
  let historyError = unavailableReason;
  if (!historyError) {
    try {
      completed = completedSavingsObservations(points, asOf);
    } catch (error) {
      historyError = error instanceof Error ? error.message : 'Monthly DKK history is unavailable.';
    }
  }
  const months = completed.map((point) => point.date.slice(0, 7));
  const startMonth = months.includes(startChoice) ? startChoice : (months[0] ?? '');
  const endMonth = months.includes(endChoice) ? endChoice : (months.at(-1) ?? '');
  let simulation: SavingsSimulation | undefined;
  let inputError: string | undefined;
  if (!historyError && completed.length >= 2) {
    try {
      simulation = simulateMonthlySavings(completed, {
        monthlyContribution: monthly.trim() ? Number(monthly) : NaN,
        initialInvestment: initial.trim() ? Number(initial) : NaN,
        startMonth,
        endMonth,
        asOf,
      });
    } catch (error) {
      inputError =
        error instanceof Error ? error.message : 'Check the selected period and amounts.';
    }
  }

  return (
    <section className="card historical-savings" aria-labelledby={headingId}>
      <div className="section-heading">
        <div>
          <div className="eyebrow">MONTHLY SAVING THROUGH HISTORY</div>
          <h2 id={headingId}>What would monthly investing have produced?</h2>
        </div>
        <span className="pill">{demo ? 'DEMO HISTORY' : 'HISTORICAL DKK'}</span>
      </div>
      <p>
        Replay a fixed DKK contribution using observed monthly returns. Contributions and investment
        gains are shown separately. Completed months only.
      </p>
      {historyError || completed.length < 2 ? (
        <Empty title="Monthly saving history is unavailable">
          {historyError ??
            'At least two completed monthly observations with dated DKK exchange rates are needed. The current month is excluded.'}
        </Empty>
      ) : (
        <>
          <div className="historical-savings-controls">
            <Field label="Saving start month">
              <select
                value={startMonth}
                onChange={(event) => {
                  setStartChoice(event.target.value);
                  if (event.target.value > endMonth) setEndChoice(event.target.value);
                }}
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Saving end month">
              <select
                value={endMonth}
                onChange={(event) => {
                  setEndChoice(event.target.value);
                  if (event.target.value < startMonth) setStartChoice(event.target.value);
                }}
              >
                {months.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Historical monthly contribution (DKK)">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max={SAVINGS_MONTHLY_LIMIT}
                step="0.01"
                value={monthly}
                onChange={(event) => setMonthly(event.target.value)}
              />
            </Field>
            <Field label="Historical initial investment (DKK)">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max={SAVINGS_INITIAL_LIMIT}
                step="0.01"
                value={initial}
                onChange={(event) => setInitial(event.target.value)}
              />
            </Field>
          </div>
          {inputError && (
            <p className="loss" role="status">
              {inputError}
            </p>
          )}
          {simulation && (
            <>
              <p className="text-small">
                {date(simulation.points[0].date)} to {date(simulation.points.at(-1)!.date)} ·{' '}
                {simulation.deposits} monthly deposit{simulation.deposits === 1 ? '' : 's'}
                {simulation.initialInvestment > 0 ? ' plus the initial investment' : ''}.
              </p>
              <div className="result-breakdown" aria-live="polite" aria-atomic="true">
                <div>
                  <span>Contributed money</span>
                  <strong>{money(simulation.contributed)}</strong>
                </div>
                <div>
                  <span>Ending historical value</span>
                  <strong>{money(simulation.endingValue)}</strong>
                </div>
                <div>
                  <span>Investment gain / loss</span>
                  <strong className={simulation.gain < 0 ? 'loss' : 'gain'}>
                    {money(simulation.gain)}
                  </strong>
                </div>
              </div>
              <div
                className="chart"
                role="img"
                aria-label={`Historical monthly investing from ${simulation.startMonth} to ${simulation.endMonth}: ${money(simulation.contributed)} contributed, ending value ${money(simulation.endingValue)}, investment gain or loss ${money(simulation.gain)}. Monthly values are available in the table below.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={simulation.points}
                    accessibilityLayer={false}
                    margin={{ top: 12, right: 12, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#e8ebe3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={50}
                      tick={{ fill: '#7b8278', fontSize: 11 }}
                    />
                    <YAxis
                      width={65}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${number(Number(value) / 1000, 0)}k`}
                      tick={{ fill: '#7b8278', fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(value) => money(Number(value))}
                      contentStyle={{ borderRadius: 12, borderColor: '#e8ebe3', fontSize: 12 }}
                    />
                    <Line
                      type="linear"
                      dataKey="value"
                      name="Historical value (DKK)"
                      stroke="#3e6950"
                      strokeWidth={2.5}
                      dot={simulation.points.length === 1}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="contributed"
                      name="Contributed money (DKK)"
                      stroke="#85867d"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={simulation.points.length === 1}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot green" /> Historical value
                </span>
                <span>
                  <i className="legend-dash" /> Contributed money
                </span>
              </div>
              <button
                className="disclosure-button"
                type="button"
                aria-expanded={showTable}
                aria-controls={tableId}
                onClick={() => setShowTable(!showTable)}
              >
                {showTable ? 'Hide' : 'Show'} monthly saving values
                <span aria-hidden="true">{showTable ? '−' : '+'}</span>
              </button>
              <div
                className="table-scroll"
                id={tableId}
                hidden={!showTable}
                tabIndex={0}
                role="region"
                aria-label="Monthly saving values"
              >
                {showTable && (
                  <table>
                    <caption className="sr-only">
                      Historical monthly saving values in nominal DKK, before personal tax and
                      trading costs
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Observed close</th>
                        <th scope="col">Contributed</th>
                        <th scope="col">Historical value</th>
                        <th scope="col">Gain / loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulation.points.map((point) => (
                        <tr key={point.month}>
                          <th scope="row">{date(point.date)}</th>
                          <td>{money(point.contributed)}</td>
                          <td>{money(point.value)}</td>
                          <td>{money(point.gain)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
          <Note>
            The initial investment and first monthly contribution enter at the first selected
            observed close. Each later month grows the existing balance by that month&apos;s
            observed DKK return, then adds the contribution at the close. Fractional investment
            exposure is assumed.
            {adjusted
              ? ' Provider-adjusted history includes dividend reinvestment and split adjustments.'
              : ' Price-only history excludes dividends.'}{' '}
            Values are nominal DKK, before personal tax, trading costs and currency-conversion
            charges. The current UTC month is excluded; missing months are never filled in.
            Historical results are not forecasts.
            {demo ? ' This uses generated demo history, not real market observations.' : ''}
          </Note>
        </>
      )}
    </section>
  );
}
