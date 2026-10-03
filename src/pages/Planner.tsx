import { useState } from 'react';
import { Save, RotateCcw, ArrowUpRight, Download } from 'lucide-react';
import { useApp } from '../lib/store';
import { PageHeading, Field, Note } from '../components/ui';
import { ProjectionChart } from '../components/charts';
import { scenarios } from '../../shared/finance';
import { planSchema } from '../../shared/schema';
import type { Plan } from '../../shared/schema';
import { money, number, download } from '../lib/format';
import { tax2026 } from '../../shared/tax';

export default function Planner() {
  const { data, update, saving, notify } = useApp();
  const [plan, setPlan] = useState<Plan>(data.plan);
  const [crash, setCrash] = useState(false);
  const [table, setTable] = useState(false);
  const points = scenarios(plan, crash);
  const end = points.at(-1)!;
  const dirty = JSON.stringify(plan) !== JSON.stringify(data.plan);
  function change<K extends keyof Plan>(key: K, value: Plan[K]) {
    setPlan((p) => ({ ...p, [key]: value }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const result = planSchema.safeParse(plan);
    if (!result.success) {
      notify('Check your plan values before saving.');
      return;
    }
    if (await update((old) => ({ ...old, plan: result.data })))
      notify('Your investment plan is saved.');
  }
  function csv() {
    download(
      'eazyinvest-projection.csv',
      [
        'year,contributions_dkk,lower_dkk,base_dkk,higher_dkk,tax_dkk,uninvested_cash_dkk',
        ...points.map((p) =>
          [p.year, p.contributed, p.low, p.value, p.high, p.tax, p.cash]
            .map((n) => Number(n.toFixed(2)))
            .join(','),
        ),
      ].join('\n'),
      'text/csv',
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR FUTURE, EXPLORED"
        title="Make room for possibility."
        description="Change the inputs. Understand the trade-offs. Find a plan that fits your life."
        action={
          <button className="button secondary" onClick={csv}>
            <Download size={16} />
            Export projection
          </button>
        }
      />
      <div className="planner-grid">
        <form className="card plan-controls" onSubmit={(e) => void save(e)}>
          <div className="section-heading">
            <h2>Your starting point</h2>
            <button
              className="icon-button"
              type="button"
              title="Restore saved plan"
              aria-label="Restore saved plan"
              onClick={() => {
                setPlan(data.plan);
                setCrash(false);
              }}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <Field label="Starting investment (DKK)">
            <input
              type="number"
              min="0"
              max="100000000"
              step="100"
              value={plan.initial}
              onChange={(e) =>
                change('initial', Math.min(100000000, Math.max(0, Number(e.target.value))))
              }
            />
          </Field>
          <Field label="Monthly contribution (DKK)">
            <input
              type="number"
              min="0"
              max="1000000"
              step="100"
              value={plan.monthly}
              onChange={(e) =>
                change('monthly', Math.min(1000000, Math.max(0, Number(e.target.value))))
              }
            />
          </Field>
          <Field label={`Time to grow: ${plan.years} years`}>
            <input
              type="range"
              min="1"
              max="40"
              value={plan.years}
              onChange={(e) => change('years', Number(e.target.value))}
            />
            <div className="range-labels">
              <span>1 year</span>
              <span>40 years</span>
            </div>
          </Field>
          <Field label="Your goal (DKK)">
            <input
              type="number"
              min="1"
              max="100000000"
              value={plan.goal}
              onChange={(e) =>
                change('goal', Math.min(100000000, Math.max(1, Number(e.target.value))))
              }
            />
          </Field>
          <div className="form-divider" />
          <h3>Make the assumptions yours</h3>
          <Field
            label={`Annual return: ${number(plan.returnRate, 1)}%`}
            hint="A modeling assumption before fees and tax, not an expected or guaranteed return."
          >
            <input
              type="range"
              min="-10"
              max="20"
              step="0.5"
              value={plan.returnRate}
              onChange={(e) => change('returnRate', Number(e.target.value))}
            />
          </Field>
          <div className="form-row">
            <Field label="Annual fees (%)">
              <input
                type="number"
                min="0"
                max="5"
                step="0.05"
                value={plan.fee}
                onChange={(e) => change('fee', Math.min(5, Math.max(0, Number(e.target.value))))}
              />
            </Field>
            <Field label="Inflation (%)">
              <input
                type="number"
                min="0"
                max="15"
                step="0.1"
                value={plan.inflation}
                onChange={(e) =>
                  change('inflation', Math.min(15, Math.max(0, Number(e.target.value))))
                }
              />
            </Field>
          </div>
          <Field label="Tax model">
            <select
              value={plan.account}
              onChange={(e) => change('account', e.target.value as Plan['account'])}
            >
              <option value="general">Shares · tax on sale</option>
              <option value="ask">Aktiesparekonto · annual 17%</option>
              <option value="annual">Equity investment company · annual</option>
              <option value="none">Before tax · comparison only</option>
            </select>
          </Field>
          {(plan.account === 'general' || plan.account === 'annual') && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={plan.married}
                onChange={(e) => change('married', e.target.checked)}
              />
              Use full combined spouses’ threshold
            </label>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={plan.realTerms}
              onChange={(e) => change('realTerms', e.target.checked)}
            />
            Show purchasing power in today’s DKK
          </label>
          <button className="button primary full-width" disabled={saving || !dirty}>
            <Save size={16} />
            {saving ? 'Saving…' : dirty ? 'Save my plan' : 'Plan saved'}
          </button>
        </form>
        <div className="planner-results">
          <section className="card">
            <div className="section-heading">
              <div>
                <div className="eyebrow">LOOKING {plan.years} YEARS AHEAD</div>
                <h2>Your possible future</h2>
              </div>
              <span className="pill">{plan.realTerms ? 'TODAY’S DKK' : 'FUTURE DKK'}</span>
            </div>
            <div className="scenario-stats">
              <div>
                <span>Lower · {number(plan.returnRate - 4, 1)}%</span>
                <strong>{money(end.low)}</strong>
              </div>
              <div className="base-scenario">
                <span>Base · {number(plan.returnRate, 1)}%</span>
                <strong>{money(end.value)}</strong>
              </div>
              <div>
                <span>Higher · {number(plan.returnRate + 4, 1)}%</span>
                <strong>{money(end.high)}</strong>
              </div>
            </div>
            <ProjectionChart plan={plan} crash={crash} />
            <div className="chart-legend">
              <span>
                <i className="legend-dot green" />
                Base scenario
              </span>
              <span>
                <i className="legend-dot gray" />
                Contributions
              </span>
              <span>
                <i className="legend-dash" />
                Alternative assumptions
              </span>
            </div>
            <div className="result-breakdown">
              <div>
                <span>Contributed to investments</span>
                <strong>{money(end.contributed)}</strong>
              </div>
              <div>
                <span>Estimated tax paid / due</span>
                <strong>{money(end.tax)}</strong>
              </div>
              <div>
                <span>Cash outside account</span>
                <strong>{money(end.cash)}</strong>
              </div>
            </div>
            <Note>
              These are three fixed-return scenarios, not probability bands. Real returns vary year
              to year and can be worse than the lower scenario. Your goal is {money(plan.goal)} in{' '}
              {plan.realTerms ? 'today’s' : 'future'} DKK.
            </Note>
          </section>
          <section className="stress-card">
            <div>
              <span className="eyebrow">GET TO KNOW THE DOWNSIDE</span>
              <h3>What if markets fall early on?</h3>
              <p>
                Add a one-off 35% drop at the start of year two, with the same return assumptions
                afterwards.
              </p>
            </div>
            <label className="toggle">
              <input
                aria-label="Include a market crash"
                type="checkbox"
                checked={crash}
                onChange={(e) => setCrash(e.target.checked)}
              />
              <span />
            </label>
          </section>
          <section className="card assumptions">
            <h3>What’s behind the numbers?</h3>
            <ul>
              <li>
                Contributions arrive at month end. Returns and annual fees compound monthly; the
                contribution stays fixed in nominal DKK.
              </li>
              <li>
                {plan.account === 'general'
                  ? 'Tax is estimated on all gains if you sell at each chart year. No interim sales or dividends are modeled, so this is a simplified tax-on-sale illustration.'
                  : plan.account === 'ask'
                    ? 'A new ASK is assumed. Each year’s deposit room uses the previous closing value and the frozen 2026 ceiling. Excess planned deposits remain separate cash, earning 0%. Tax is paid from the account; no extra deposits for tax are modeled.'
                    : plan.account === 'annual'
                      ? 'An equity-income investment company is assumed. Gains are taxed annually; losses offset subsequent modeled gains. Actual loss-offset rules depend on classification and other income.'
                      : 'This comparison excludes all taxes.'}
              </li>
              <li>
                2026 tax rates and thresholds are held constant. Other investment income,
                withholding taxes, broker fees, and currency movements are excluded. Annual losses
                receive no immediate cash refund.
              </li>
              <li>
                In today’s-money mode, every year’s values, including cumulative contributions and
                tax, are deflated to present purchasing power.
              </li>
            </ul>
            <a href={tax2026.askSource} target="_blank" rel="noreferrer">
              Check the official Danish rules <ArrowUpRight size={14} />
            </a>
          </section>
          <section className="card">
            <button
              className="disclosure-button"
              onClick={() => setTable(!table)}
              aria-expanded={table}
            >
              {table ? 'Hide' : 'Show'} year-by-year values <span>{table ? '−' : '+'}</span>
            </button>
            {table && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Contributions</th>
                      <th>Base scenario</th>
                      <th>Separate cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.year}>
                        <td>{p.year}</td>
                        <td>{money(p.contributed)}</td>
                        <td>{money(p.value)}</td>
                        <td>{money(p.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
