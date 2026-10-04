import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApp } from '../lib/store';
import { PageHeading, Field, Note } from '../components/ui';
import { FundFacts } from '../components/FundFacts';
import { money, number, download } from '../lib/format';
import { fundFacts } from '../../shared/fund-facts';
import {
  calculateFundScenario,
  comparisonModel,
  fundScenarioSchema,
  type FundScenario,
  type FundYear,
} from '../../shared/fund-comparison';
import { tax2026 } from '../../shared/tax';

export default function FundComparison() {
  const { instruments, data } = useApp();
  const [params] = useSearchParams();
  const funds = instruments.filter((item) => !!fundFacts(item).cost);
  const requested = funds.find((item) => item.id === params.get('investment'))?.id;
  const [ids, setIds] = useState([
    requested ?? 'sparindex-global',
    requested === 'eunl' ? 'sparindex-global' : 'eunl',
  ]);
  const [yields, setYields] = useState(['', '']);
  const [s, setScenario] = useState<FundScenario>({
    initial: data.plan.initial,
    monthly: data.plan.monthly,
    years: data.plan.years,
    returnRate: data.plan.returnRate,
    account: 'ordinary',
    married: false,
    otherIncome: 0,
    reinvest: true,
    includeTransactionCosts: false,
    includeEntryExitCosts: false,
  });
  const [table, setTable] = useState(false);
  function change<K extends keyof FundScenario>(key: K, value: FundScenario[K]) {
    setScenario((old) => ({ ...old, [key]: value }));
  }
  const valid = fundScenarioSchema.safeParse(s);
  const options = ids.map((id, i) => {
    const item = funds.find((f) => f.id === id)!;
    const facts = fundFacts(item);
    const resolved = comparisonModel(item, s, yields[i] === '' ? null : Number(yields[i]));
    let points: FundYear[] = [];
    let issue = !valid.success ? 'Check the scenario input limits.' : resolved.issue;
    if (!issue && resolved.model) {
      try {
        points = calculateFundScenario(s, resolved.model);
      } catch {
        issue = 'These inputs exceed the supported scenario range.';
      }
    }
    return { item, facts, model: resolved.model, points, issue, end: points.at(-1) };
  });
  const ready = options.every((o) => !!o.end);
  const chart = ready
    ? options[0].points.map((p, i) => ({
        year: p.year,
        first: p.afterSale,
        second: options[1].points[i].afterSale,
        contributed: p.contributed,
      }))
    : [];
  function csv() {
    if (!ready) return;
    const rows = [
      'record,fund_isin,year,initial_dkk,monthly_dkk,gross_return_percent,distribution_yield_percent,account,reinvest,married,other_income_dkk,transaction_costs,max_entry_exit,tax_rule_year,tax_classification,ongoing_charge_percent,applied_transaction_percent,applied_entry_percent,applied_exit_percent,issuer_cost_checked_at,contributed_dkk,accepted_dkk,fund_dkk,inside_cash_dkk,outside_cash_dkk,basis_dkk,distribution_dkk,distribution_tax_dkk,annual_tax_dkk,tax_paid_dkk,fees_paid_dkk,wealth_dkk,sale_tax_adjustment_dkk,exit_fee_dkk,after_sale_dkk,loss_carry_dkk',
      ...options.flatMap((o, i) =>
        o.points.map((p) =>
          [
            'scenario',
            o.item.isin,
            p.year,
            s.initial,
            s.monthly,
            s.returnRate,
            o.facts.incomeTreatment === 'accumulating' ? 0 : Number(yields[i]),
            s.account,
            s.reinvest,
            s.married,
            s.otherIncome,
            s.includeTransactionCosts,
            s.includeEntryExitCosts,
            tax2026.year,
            o.facts.taxTreatment.kind,
            o.model!.ongoing,
            o.model!.transaction,
            o.model!.entry,
            o.model!.exit,
            o.facts.cost!.checkedAt,
            p.contributed,
            p.accepted,
            p.fund,
            p.cash,
            p.outsideCash,
            p.basis,
            p.distribution,
            p.distributionTax,
            p.annualTax,
            p.taxPaid,
            p.feesPaid,
            p.wealth,
            p.saleTax,
            p.exitFee,
            p.afterSale,
            p.lossCarry,
          ]
            .map((v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v))
            .join(','),
        ),
      ),
    ];
    download('eazyinvest-fund-comparison.csv', rows.join('\n'), 'text/csv');
  }
  return (
    <>
      <PageHeading
        eyebrow="COSTS, CASH FLOWS AND DANISH TAX"
        title="Compare funds on equal terms."
        description="Explore how charges, distributions and account rules affect the same investment budget."
        action={
          <button className="button secondary" onClick={csv} disabled={!ready}>
            <Download size={16} />
            Export comparison
          </button>
        }
      />
      <div className="planner-grid fund-comparison">
        <section className="card plan-controls" aria-label="Shared fund scenario">
          <h2>One shared scenario</h2>
          <Field label="Starting investment (DKK)">
            <input
              type="number"
              min="0"
              max="100000000"
              value={s.initial}
              onChange={(e) => change('initial', Number(e.target.value))}
            />
          </Field>
          <Field label="Monthly contribution (DKK)">
            <input
              type="number"
              min="0"
              max="1000000"
              value={s.monthly}
              onChange={(e) => change('monthly', Number(e.target.value))}
            />
          </Field>
          <Field label="Horizon (years)">
            <input
              type="number"
              min="1"
              max="40"
              value={s.years}
              onChange={(e) => change('years', Number(e.target.value))}
            />
          </Field>
          <Field
            label="Gross annual total return (%)"
            hint="Your assumption before fund charges and tax. Includes distributions; independent of past returns."
          >
            <input
              type="number"
              min="-10"
              max="20"
              step="0.1"
              value={s.returnRate}
              onChange={(e) => change('returnRate', Number(e.target.value))}
            />
          </Field>
          <Field label="Comparison account">
            <select
              value={s.account}
              onChange={(e) => change('account', e.target.value as FundScenario['account'])}
            >
              <option value="ordinary">Ordinary account · verified fund rules</option>
              <option value="ask">New Aktiesparekonto · 17% annually</option>
              <option value="none">Before personal tax</option>
            </select>
          </Field>
          {s.account === 'ordinary' && (
            <>
              <Field
                label="Other annual share income (DKK)"
                hint="Consumes tax-band room. This income and its own tax are outside the fund totals."
              >
                <input
                  type="number"
                  min="0"
                  max="100000000"
                  value={s.otherIncome}
                  onChange={(e) => change('otherIncome', Number(e.target.value))}
                />
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={s.married}
                  onChange={(e) => change('married', e.target.checked)}
                />
                Use full eligible spouses’ combined threshold
              </label>
            </>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.reinvest}
              onChange={(e) => change('reinvest', e.target.checked)}
            />
            Reinvest net distributions
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.includeTransactionCosts}
              onChange={(e) => change('includeTransactionCosts', e.target.checked)}
            />
            Include published fund transaction-cost estimates
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.includeEntryExitCosts}
              onChange={(e) => change('includeEntryExitCosts', e.target.checked)}
            />
            Assume issuer maximum entry and terminal exit charges
          </label>
          <p className="text-small muted">
            Ongoing charges / TER are always included. Unpublished transaction and entry/exit
            charges are excluded. Maximum charges may differ from what you pay. Broker fees and
            currency-conversion charges are excluded.
          </p>
          {!valid.success && (
            <p role="alert" className="form-error">
              Use 1–40 whole years, a return between −10% and 20%, and non-negative amounts within
              the displayed limits.
            </p>
          )}
        </section>
        <div className="planner-results">
          <div className="fund-comparison-options">
            {options.map((o, i) => (
              <section
                className="card fund-comparison-option"
                key={i}
                aria-label={`Fund ${i === 0 ? 'A' : 'B'} result`}
              >
                <div className="eyebrow">ALTERNATIVE {i === 0 ? 'A' : 'B'}</div>
                <Field label={`Fund ${i === 0 ? 'A' : 'B'}`}>
                  <select
                    value={ids[i]}
                    onChange={(e) => {
                      setIds((old) => old.map((id, n) => (n === i ? e.target.value : id)));
                      setYields((old) => old.map((v, n) => (n === i ? '' : v)));
                    }}
                  >
                    {funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="text-small muted">{o.item.description}</p>
                <p>
                  <strong>
                    {number(o.facts.cost!.percent, 2)}% annual{' '}
                    {o.facts.cost!.basis === 'TER' ? 'TER' : 'ongoing charge'}
                  </strong>{' '}
                  · {o.facts.incomeTreatment === 'accumulating' ? 'Accumulating' : 'Distributing'}
                </p>
                <p className="text-small muted">
                  {o.facts.transactionCost
                    ? `Fund transaction estimate: ${s.includeTransactionCosts ? 'included' : 'excluded'}.`
                    : 'Fund transaction-cost estimate: unpublished; excluded.'}{' '}
                  {o.facts.entryCost && o.facts.exitCost
                    ? `Maximum entry/exit charges: ${s.includeEntryExitCosts ? 'included' : 'excluded'}.`
                    : 'Maximum entry/exit charges: unverified; excluded.'}
                </p>
                {o.facts.incomeTreatment === 'distributing' && (
                  <Field
                    label={`Distribution yield ${i === 0 ? 'A' : 'B'} (%)`}
                    hint="Your assumption: percentage of year-end fund value before payout. No historical yield is inferred."
                  >
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.1"
                      placeholder="Enter your assumption"
                      value={yields[i]}
                      onChange={(e) =>
                        setYields((old) => old.map((v, n) => (n === i ? e.target.value : v)))
                      }
                    />
                  </Field>
                )}
                {o.issue ? (
                  <Note>{o.issue}</Note>
                ) : (
                  o.end && (
                    <>
                      <div className="fund-comparison-total">
                        <span>After a sale in year {s.years}</span>
                        <strong>{money(o.end.afterSale)}</strong>
                        <small>Includes investment and all retained cash</small>
                      </div>
                      <dl className="fund-comparison-breakdown">
                        <div>
                          <dt>Total budget contributed</dt>
                          <dd>{money(o.end.contributed)}</dd>
                        </div>
                        <div>
                          <dt>Accepted into account</dt>
                          <dd>{money(o.end.accepted)}</dd>
                        </div>
                        <div>
                          <dt>Fund value before sale</dt>
                          <dd>{money(o.end.fund)}</dd>
                        </div>
                        <div>
                          <dt>Retained distribution cash</dt>
                          <dd>{money(o.end.cash)}</dd>
                        </div>
                        <div>
                          <dt>Cash outside account</dt>
                          <dd>{money(o.end.outsideCash)}</dd>
                        </div>
                        <div>
                          <dt>Tax paid during holding</dt>
                          <dd>{money(o.end.taxPaid)}</dd>
                        </div>
                        <div>
                          <dt>Tax on sale / same-year adjustment</dt>
                          <dd>{money(o.end.saleTax)}</dd>
                        </div>
                        <div>
                          <dt>Modelled charges including sale</dt>
                          <dd>{money(o.end.feesPaid + o.end.exitFee)}</dd>
                        </div>
                        <div>
                          <dt>Unrelieved loss for future years</dt>
                          <dd>{money(o.end.lossCarry)}</dd>
                        </div>
                      </dl>
                    </>
                  )
                )}
                <details>
                  <summary>Verified fund facts and sources</summary>
                  <FundFacts item={o.item} />
                </details>
                <Link to={`/explore?investment=${o.item.id}`}>Explore this fund’s history</Link>
              </section>
            ))}
          </div>
          {ready && (
            <section className="card">
              <h2>Same budget, different cash flows</h2>
              <p className="text-small muted">
                Each point shows a hypothetical sale at that year end. These sales are separate
                illustrations and do not reduce the following year’s holdings.
              </p>
              <div
                className="chart"
                role="img"
                aria-label="Annual fund comparison after a hypothetical sale, including retained cash, versus contributions in DKK"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#e8ebe3" vertical={false} />
                    <XAxis
                      dataKey="year"
                      tickFormatter={(v) => `${v} yr`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      width={65}
                      tickFormatter={(v) => `${number(v / 1000, 0)}k`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Line
                      dataKey="first"
                      name="Fund A after sale"
                      stroke="#3e6950"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="second"
                      name="Fund B after sale"
                      stroke="#506579"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="contributed"
                      name="Total budget / cash at 0%"
                      stroke="#777769"
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot green" />
                  Fund A
                </span>
                <span>
                  <i className="legend-dot" style={{ background: '#506579' }} />
                  Fund B
                </span>
                <span>
                  <i className="legend-dash" />
                  Total budget
                </span>
              </div>
              <button
                className="disclosure-button"
                onClick={() => setTable(!table)}
                aria-expanded={table}
              >
                {table ? 'Hide' : 'Show'} annual cash flows <span>{table ? '−' : '+'}</span>
              </button>
              {table && (
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Scrollable annual cash flows"
                >
                  <table>
                    <caption>
                      Annual cash flows in DKK; A and B follow the selected alternatives
                    </caption>
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>Fund</th>
                        <th>Budget</th>
                        <th>Gross distribution</th>
                        <th>Tax paid to date</th>
                        <th>Acquisition cost</th>
                        <th>After sale incl. cash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {options[0].points.flatMap((_, n) =>
                        options.map((o, i) => {
                          const p = o.points[n];
                          return (
                            <tr key={`${n}-${i}`}>
                              <td>{p.year}</td>
                              <td>{i === 0 ? 'A' : 'B'}</td>
                              <td>{money(p.contributed)}</td>
                              <td>{money(p.distribution)}</td>
                              <td>{money(p.taxPaid)}</td>
                              <td>
                                {s.account === 'ordinary' &&
                                o.facts.taxTreatment.kind === 'equity-realisation-distributions'
                                  ? money(p.basis)
                                  : 'Not used'}
                              </td>
                              <td>{money(p.afterSale)}</td>
                            </tr>
                          );
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          <section className="card assumptions">
            <h2>How to read this comparison</h2>
            <ul>
              <li>
                Both funds receive the same gross total-return assumption. Their markets and risks
                can differ; matching assumptions do not predict matching returns. Values are nominal
                future DKK.
              </li>
              <li>
                Contributions enter at month end. Returns and charges compound monthly; assumed
                distributions arrive at year end and are removed from fund value once. Net
                reinvestment increases acquisition cost. Retained cash earns 0%.
              </li>
              <li>
                Ordinary-account distributions and realised sale gains share the year’s progressive
                bands. Annual-tax funds include distributions and price changes in one annual gain.
                Losses carry within this isolated model; a terminal loss can reverse that year’s
                tax, without refunding earlier years.
              </li>
              <li>
                A new ASK uses the frozen DKK 174,200 ceiling and previous closing value including
                cash. Excess contributions remain outside the account. Annual tax is funded
                internally, with no extra tax-payment deposits. Classification checks do not
                establish availability at your broker.
              </li>
              <li>
                Reviewed 2026 classifications, 27%/42% share-income rates and 17% ASK tax stay fixed
                throughout the scenario. Foreign withholding, changing tax law, other holdings,
                cross-account offsets and intermediate sales are excluded. Maximum exit charges
                apply only to the illustrated terminal sale.
              </li>
              <li>
                These exploratory settings are not saved to your workspace. Export includes the
                assumptions and annual cash flows. Historical adjusted returns remain before
                personal tax.
              </li>
            </ul>
            <p>
              <Link to={`/holdings?first=${ids[0]}&second=${ids[1]}`}>
                Review these funds’ holdings overlap
              </Link>
              {' · '}
              <a href={tax2026.fundSource} target="_blank" rel="noreferrer">
                SKAT fund rules
              </a>{' '}
              ·{' '}
              <a href={tax2026.equitySource} target="_blank" rel="noreferrer">
                Share income
              </a>{' '}
              ·{' '}
              <a href={tax2026.askSource} target="_blank" rel="noreferrer">
                ASK rules
              </a>{' '}
              · verified 4 October 2026
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
