import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Papa from 'papaparse';
import { useApp } from '../lib/store';
import { PageHeading, Field, Note, Empty } from '../components/ui';
import {
  contributionPlan,
  contributionSchema,
  contributionQuote,
  type ContributionSettings,
  type ContributionMonth,
} from '../../shared/contributions';
import { currentQuote } from '../../shared/quote';
import { portfolio } from '../../shared/finance';
import { strategySchema } from '../../shared/strategy';
import { number, download } from '../lib/format';
const cashMoney = (n: number) =>
  new Intl.NumberFormat('en-DK', {
    style: 'currency',
    currency: 'DKK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export default function Contributions() {
  const {
    data,
    getInstrument,
    market,
    quotes,
    mode,
    update,
    saving,
    notify,
    refreshMarket,
    refreshing,
  } = useApp();
  const [params] = useSearchParams();
  const initial =
    data.strategies.find((s) => s.id === (params.get('strategy') ?? data.preferredStrategyId)) ??
    data.strategies[0];
  const [strategyId, setStrategyId] = useState(initial?.id ?? '');
  const strategy = data.strategies.find((s) => s.id === strategyId);
  const [s, setSettings] = useState<ContributionSettings>({
    monthly: initial?.monthly ?? data.plan.monthly,
    cash: 0,
    months: 1,
    units: 'whole',
    allocation: 'target',
    feePercent: 0,
    minimumFee: 0,
    fxPercent: 0,
  });
  const [useRecorded, setUseRecorded] = useState(true),
    [showMonths, setShowMonths] = useState(false);
  const validation = contributionSchema.safeParse(s);
  const positions = portfolio(data.transactions, market, quotes).rows;
  const excluded = positions.filter(
    (p) => p.units > 0 && !strategy?.allocations.some((a) => a.instrumentId === p.id),
  );
  const pricing =
    strategy?.allocations.map((a) => {
      const item = getInstrument(a.instrumentId);
      const q = contributionQuote(
        currentQuote(market[item.id], quotes[item.id]),
        item,
        mode === 'demo',
      );
      return {
        item,
        ...q,
        weight: a.weight,
        heldUnits: useRecorded ? (positions.find((p) => p.id === item.id)?.units ?? 0) : 0,
      };
    }) ?? [];
  let months: ContributionMonth[] = [],
    error = '';
  if (strategy && validation.success) {
    try {
      months = contributionPlan(
        pricing.map((p) => ({
          id: p.item.id,
          weight: p.weight,
          heldUnits: p.heldUnits,
          currency: p.item.currency,
          priceDkk: p.priceDkk,
        })),
        s,
      );
    } catch {
      error = 'Check allocation values, quote amounts and recorded unit totals.';
    }
  }
  const first = months[0];
  function change<K extends keyof ContributionSettings>(key: K, value: ContributionSettings[K]) {
    setSettings((old) => ({ ...old, [key]: value }));
  }
  async function saveBudget() {
    if (!strategy || !strategySchema.safeParse({ ...strategy, monthly: s.monthly }).success) return;
    if (
      await update((old) => ({
        ...old,
        strategies: old.strategies.map((plan) =>
          plan.id === strategy.id ? { ...plan, monthly: s.monthly } : plan,
        ),
      }))
    )
      notify('Strategy monthly budget saved.');
  }
  function csv() {
    if (!first || first.issue) return;
    const fields = [
      'strategy',
      'month_index',
      'monthly_dkk',
      'initial_cash_dkk',
      'unit_mode',
      'allocation_rule',
      'commission_percent',
      'minimum_commission_dkk',
      'fx_percent',
      'use_recorded_holdings',
      'instrument',
      'target_weight',
      'starting_units',
      'price_source',
      'quote_date',
      'native_quote',
      'fx_to_dkk',
      'fx_date',
      'price_dkk',
      'allocation_budget_dkk',
      'planned_units',
      'notional_dkk',
      'commission_dkk',
      'fx_cost_dkk',
      'order_total_dkk',
      'projected_invested_weight',
      'opening_cash_dkk',
      'available_cash_dkk',
      'remaining_cash_dkk',
      'quote_issue',
      'assumption',
    ];
    const rows = months.flatMap((m) =>
      m.orders.map((o, n) => {
        const p = pricing[n];
        return [
          strategy!.name,
          m.month,
          s.monthly,
          s.cash,
          s.units,
          s.allocation,
          s.feePercent,
          s.minimumFee,
          s.fxPercent,
          useRecorded,
          p.item.id,
          p.weight,
          p.heldUnits,
          p.quote?.source ?? '',
          p.quote?.quote.date ?? '',
          p.quote?.quote.close ?? '',
          p.quote?.fxToDkk ?? '',
          p.quote?.fxDate ?? '',
          p.priceDkk ?? '',
          o.budget,
          o.quantity,
          o.notional,
          o.commission,
          o.fxCost,
          o.spent,
          o.afterWeight ?? '',
          m.openingCash,
          m.available,
          m.closingCash,
          p.issue ?? '',
          'Fixed quotes; manual worksheet; no future returns or trades',
        ];
      }),
    );
    download(
      'eazyinvest-contributions.csv',
      Papa.unparse({ fields, data: rows }, { escapeFormulae: true }),
      'text/csv',
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="TURN A STRATEGY INTO A HABIT"
        title="Give each month a clear plan."
        description="Allocate your saved budget, estimate affordable units and keep track of money left as cash."
        action={
          <button className="button secondary" onClick={csv} disabled={!first || !!first.issue}>
            Export contribution worksheet
          </button>
        }
      />
      {!data.strategies.length ? (
        <Empty
          title="Start with a saved strategy"
          action={
            <Link className="button primary" to="/strategies">
              Build a strategy
            </Link>
          }
        >
          Save the investments, target weights and monthly budget you want to use.
        </Empty>
      ) : (
        <div className="planner-grid contributions-layout">
          <section className="card plan-controls" aria-label="Contribution assumptions">
            <h2>Your monthly routine</h2>
            <Field label="Contribution strategy">
              <select
                value={strategyId}
                onChange={(e) => {
                  setStrategyId(e.target.value);
                  const selected = data.strategies.find((p) => p.id === e.target.value);
                  if (selected) change('monthly', selected.monthly);
                }}
              >
                {data.strategies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Monthly budget (DKK)">
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={s.monthly}
                onChange={(e) => change('monthly', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Available cash carried in (DKK)"
              hint="Enter cash yourself. Sale and dividend proceeds are not inferred from the ledger."
            >
              <input
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                value={s.cash}
                onChange={(e) => change('cash', Number(e.target.value))}
              />
            </Field>
            <Field label="Unit sizing">
              <select
                value={s.units}
                onChange={(e) => change('units', e.target.value as ContributionSettings['units'])}
              >
                <option value="whole">Whole units</option>
                <option value="fractional">Fractional units · up to 6 decimals</option>
              </select>
            </Field>
            <Field label="Allocate new money">
              <select
                value={s.allocation}
                onChange={(e) =>
                  change('allocation', e.target.value as ContributionSettings['allocation'])
                }
              >
                <option value="target">By target contribution weights</option>
                <option value="gaps">Proportionally towards underweights</option>
              </select>
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={useRecorded}
                onChange={(e) => setUseRecorded(e.target.checked)}
              />
              Include my recorded strategy holdings
            </label>
            <h3>Your trading-cost assumptions</h3>
            <Field label="Broker commission (%)" hint="Zero excludes percentage commission.">
              <input
                type="number"
                min="0"
                max="5"
                step="0.01"
                value={s.feePercent}
                onChange={(e) => change('feePercent', Number(e.target.value))}
              />
            </Field>
            <Field label="Minimum commission per order (DKK)">
              <input
                type="number"
                min="0"
                max="10000"
                step="0.01"
                value={s.minimumFee}
                onChange={(e) => change('minimumFee', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Currency-conversion charge (%)"
              hint="Applied to EUR/USD purchases. DKK purchases use zero conversion charge."
            >
              <input
                type="number"
                min="0"
                max="5"
                step="0.01"
                value={s.fxPercent}
                onChange={(e) => change('fxPercent', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Months to rehearse"
              hint="Uses these same quotes for every month; does not forecast future prices."
            >
              <input
                type="number"
                min="1"
                max="12"
                value={s.months}
                onChange={(e) => change('months', Number(e.target.value))}
              />
            </Field>
            {!validation.success && (
              <p role="alert" className="form-error">
                Check non-negative budgets with at most two decimal places, 1–12 whole months and
                costs within the displayed limits.
              </p>
            )}
            <button
              className="button secondary"
              onClick={() => void saveBudget()}
              disabled={
                saving ||
                !strategy ||
                !validation.success ||
                strategy.monthly === s.monthly ||
                !strategySchema.safeParse({ ...strategy, monthly: s.monthly }).success
              }
            >
              Save monthly budget to strategy
            </button>
            <p className="text-small muted">
              Only the monthly budget is saved. Cash, sizing and fee assumptions are exploratory and
              included in the export.
            </p>
          </section>
          <div className="planner-results">
            <section className="card">
              <div className="section-heading">
                <h2>Your next contribution</h2>
                <button
                  className="button secondary"
                  disabled={refreshing}
                  onClick={() =>
                    void refreshMarket(strategy?.allocations.map((a) => a.instrumentId))
                  }
                >
                  {refreshing ? 'Refreshing…' : 'Refresh saved quotes'}
                </button>
              </div>
              {first ? (
                <>
                  <div className="result-breakdown">
                    <div>
                      <span>Cash available</span>
                      <strong>{cashMoney(first.available)}</strong>
                    </div>
                    <div>
                      <span>Estimated order totals</span>
                      <strong>{cashMoney(first.spent)}</strong>
                    </div>
                    <div>
                      <span>Cash carried forward</span>
                      <strong>{cashMoney(first.closingCash)}</strong>
                    </div>
                  </div>
                  {first.issue && (
                    <p role="alert" className="form-error">
                      {first.issue}
                    </p>
                  )}
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Next contribution orders"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Investment</th>
                          <th>Allocation budget</th>
                          <th>Units</th>
                          <th>Notional</th>
                          <th>Commission</th>
                          <th>FX charge</th>
                          <th>Order total</th>
                          <th>After invested weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {first.orders.map((o, n) => (
                          <tr key={o.id}>
                            <td>
                              {pricing[n].item.ticker}
                              <small className="block muted">
                                Target {number(pricing[n].weight, 2)}%
                              </small>
                              {!o.available && (
                                <small className="block form-error">
                                  Quote unavailable · allocation stays cash
                                </small>
                              )}
                            </td>
                            <td>{cashMoney(o.budget)}</td>
                            <td>{number(o.quantity, 6)}</td>
                            <td>{cashMoney(o.notional)}</td>
                            <td>{cashMoney(o.commission)}</td>
                            <td>{cashMoney(o.fxCost)}</td>
                            <td>{cashMoney(o.spent)}</td>
                            <td>
                              {o.afterWeight === null
                                ? 'Unavailable'
                                : `${number(o.afterWeight, 2)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-small muted">
                    Total modelled commission and conversion charges: {cashMoney(first.fees)}. No
                    order is charged when no unit fits. Remaining cash is included in the next
                    rehearsal month’s allocation.
                  </p>
                </>
              ) : (
                <p role={error ? 'alert' : undefined}>
                  {error || 'Check your contribution inputs to see affordable units.'}
                </p>
              )}
              {useRecorded && excluded.length > 0 && (
                <p className="text-small muted">
                  {excluded.length} recorded position(s) outside this strategy are excluded from its
                  weights.
                </p>
              )}
              {mode === 'demo' && (
                <Note>
                  Unit sizing uses illustrative demo quotes and FX, not current market prices.
                </Note>
              )}
              {strategy && (
                <p>
                  <Link to={`/holdings?strategy=${strategy.id}`}>
                    Review this strategy’s holdings overlap
                  </Link>{' '}
                  · <Link to={`/strategies?strategy=${strategy.id}`}>Edit target allocations</Link>
                </p>
              )}
            </section>
            <section className="card">
              <h2>Prices behind the worksheet</h2>
              {pricing.map((p) => (
                <div className="contribution-price" key={p.item.id}>
                  <h3>{p.item.name}</h3>
                  {p.quote ? (
                    <p>
                      {number(p.quote.quote.close, 6)} {p.item.currency} per unit · quote{' '}
                      {p.quote.quote.date} · {p.quote.source}. Conversion:{' '}
                      {number(p.quote.fxToDkk, 6)} DKK per {p.item.currency} · FX {p.quote.fxDate}
                      {p.quote.fxSource ? ` (${p.quote.fxSource})` : ''}.
                    </p>
                  ) : (
                    <p>{p.issue} Planned money for this investment remains cash.</p>
                  )}
                  <p className="text-small muted">
                    Recorded starting units used: {number(p.heldUnits, 6)}.
                  </p>
                </div>
              ))}
            </section>
            {months.length > 1 && (
              <section className="card">
                <button
                  className="disclosure-button"
                  aria-expanded={showMonths}
                  onClick={() => setShowMonths(!showMonths)}
                >
                  {showMonths ? 'Hide' : 'Show'} fixed-price monthly rehearsal
                </button>
                {showMonths && (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Monthly contribution rehearsal"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Starting cash</th>
                          <th>New contribution</th>
                          <th>Order totals</th>
                          <th>Costs</th>
                          <th>Remaining cash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((m) => (
                          <tr key={m.month}>
                            <td>{m.month}</td>
                            <td>{cashMoney(m.openingCash)}</td>
                            <td>{cashMoney(m.contribution)}</td>
                            <td>{cashMoney(m.spent)}</td>
                            <td>{cashMoney(m.fees)}</td>
                            <td>{cashMoney(m.closingCash)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            <section className="card assumptions">
              <h2>Before placing an order</h2>
              <ul>
                <li>
                  This is a manual worksheet at dated prices, not an executable order or an
                  expected-return projection. Verify price, instrument, account availability and
                  charges with your broker.
                </li>
                <li>
                  Cash equals your entered amount plus the monthly budget. Unit sizing reserves
                  notional, commission and FX costs in DKK, rounding reserves upwards to øre.
                  Fractional mode assumes six-decimal units are available.
                </li>
                <li>
                  Underweight allocation divides new money by positive gaps against target values
                  after adding the budget, before execution charges. It proposes no sales. After
                  weights describe investments alone, excluding retained cash.
                </li>
                <li>
                  Commission is the larger of the percentage amount and minimum per order. FX
                  charges are separate. Spread, market movement, tax, fund entry/exit charges and
                  ongoing fund expenses are excluded from execution estimates.
                </li>
                <li>
                  Rehearsal months keep quotes and FX fixed. Retained cash and planned units carry
                  forward; actual future purchases will differ.
                </li>
                <li>
                  Enter money already available to invest in this account. The worksheet does not
                  track ASK deposit room, account limits or investment eligibility.
                </li>
              </ul>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
