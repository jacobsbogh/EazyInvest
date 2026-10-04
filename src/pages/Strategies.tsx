import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp, useHistories } from '../lib/store';
import { strategySchema, type Strategy } from '../../shared/strategy';
import {
  commonStrategyHistory,
  backtestStrategy,
  strategyReturnObservations,
  type StrategyResult,
} from '../../shared/portfolio-history';
import { analyzeHistory } from '../../shared/history-analysis';
import { PageHeading, Field, Note, Empty, Modal } from '../components/ui';
import { HoldingPeriodAnalysis } from '../components/HoldingPeriodAnalysis';
import { StrategyChart } from '../components/charts';
import { FundFacts } from '../components/FundFacts';
import { weightedFundCost, strategyTaxIssue } from '../../shared/fund-facts';
import { money, number, percent } from '../lib/format';

export default function Strategies() {
  const {
    data,
    instruments,
    market,
    historyStatus,
    mode,
    update,
    saving,
    notify,
    getInstrument,
    refreshing,
    refreshMarket,
  } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const create = (): Strategy => ({
    id: crypto.randomUUID(),
    name: 'My investment strategy',
    allocations: [
      {
        instrumentId: instruments.find((i) => i.id === params.get('investment'))?.id ?? 'vwce',
        weight: 100,
      },
    ],
    initial: data.plan.initial,
    monthly: data.plan.monthly,
    goal: data.plan.goal,
    account: 'none',
    rebalance: 'none',
    note: '',
    startMonth: null,
    endMonth: null,
  });
  const [draft, setDraft] = useState<Strategy>(() => {
    const requested = data.strategies.find((s) => s.id === params.get('strategy'));
    const investment = instruments.find((i) => i.id === params.get('investment'));
    if (
      requested &&
      investment &&
      !requested.allocations.some((a) => a.instrumentId === investment.id) &&
      requested.allocations.length < 5
    )
      return {
        ...requested,
        allocations: [...requested.allocations, { instrumentId: investment.id, weight: 10 }],
      };
    return (
      requested ??
      (params.has('investment')
        ? create()
        : (data.strategies.find((s) => s.id === data.preferredStrategyId) ??
          data.strategies[0] ??
          create()))
    );
  });
  const [compareId, setCompareId] = useState('');
  const [remove, setRemove] = useState(false);
  const [table, setTable] = useState(false);
  const saved = data.strategies.find((s) => s.id === draft.id);
  const dirty = !saved || JSON.stringify(saved) !== JSON.stringify(draft);
  const validation = strategySchema.safeParse(draft);
  const fundCost = weightedFundCost(draft, instruments);
  const taxIssue = strategyTaxIssue(draft, instruments);
  const competitor = data.strategies.find((s) => s.id === compareId && s.id !== draft.id);
  let results: StrategyResult[] = [];
  let months: string[] = [];
  let issue = validation.success ? '' : validation.error.issues[0].message;
  const selected = competitor ? [draft, competitor] : [draft];
  const historyIds = selected.flatMap((s) => s.allocations.map((a) => a.instrumentId));
  useHistories(historyIds);
  if (validation.success) {
    try {
      const history = commonStrategyHistory(selected, market, { demo: mode === 'demo' });
      months = history.months.map((p) => p.month);
      results = selected.map((s) =>
        backtestStrategy(s, history, {
          initial: draft.initial,
          monthly: draft.monthly,
          startMonth: draft.startMonth ?? months[0],
          endMonth: draft.endMonth ?? months.at(-1),
        }),
      );
    } catch (err) {
      issue = err instanceof Error ? err.message : 'The historical comparison is unavailable.';
    }
  }
  if (historyIds.some((id) => historyStatus[id] === 'loading'))
    issue = 'Loading selected histories…';
  function change<K extends keyof Strategy>(key: K, value: Strategy[K]) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!validation.success) {
      notify(validation.error.issues[0].message);
      return;
    }
    if (
      await update((old) => ({
        ...old,
        strategies: saved
          ? old.strategies.map((s) => (s.id === draft.id ? validation.data : s))
          : [...old.strategies, validation.data],
        preferredStrategyId: old.preferredStrategyId ?? draft.id,
      }))
    )
      notify('Investment strategy saved.');
  }
  async function prefer() {
    if (dirty) {
      notify('Save your changes before choosing this strategy.');
      return;
    }
    if (await update((old) => ({ ...old, preferredStrategyId: draft.id })))
      notify('Preferred strategy saved.');
  }
  async function useInPlanner() {
    if (dirty) {
      notify('Save your strategy before using it in the future planner.');
      return;
    }
    if (
      await update((old) => ({
        ...old,
        plan: {
          ...old.plan,
          initial: draft.initial,
          monthly: draft.monthly,
          goal: draft.goal,
          account: draft.account,
          fee: fundCost ?? old.plan.fee,
        },
      }))
    ) {
      notify('Strategy budget loaded. Set your future return and cost assumptions in the planner.');
      navigate('/planner');
    }
  }
  async function deleteStrategy() {
    if (
      await update((old) => ({
        ...old,
        strategies: old.strategies.filter((s) => s.id !== draft.id),
        preferredStrategyId: old.preferredStrategyId === draft.id ? null : old.preferredStrategyId,
      }))
    ) {
      setRemove(false);
      setDraft(create());
      setCompareId('');
      notify('Strategy removed.');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="RESEARCH INTO A PLAN"
        title="Build your investment strategy."
        description="Allocate your budget, compare real historical outcomes and save your reasoning."
        action={
          <button
            className="button secondary"
            onClick={() => {
              setDraft(create());
              setCompareId('');
            }}
            disabled={saving || data.strategies.length >= 10}
          >
            New strategy
          </button>
        }
      />
      {data.strategies.length > 0 && (
        <section className="card strategy-library" aria-label="Saved strategies">
          {data.strategies.map((s) => (
            <button
              key={s.id}
              className={`button ${draft.id === s.id ? 'primary' : 'secondary'}`}
              aria-pressed={draft.id === s.id}
              disabled={saving}
              onClick={() => {
                setDraft(s);
                setCompareId('');
              }}
            >
              {s.name}
              {s.id === data.preferredStrategyId ? ' · Preferred' : ''}
            </button>
          ))}
        </section>
      )}
      <div className="strategy-layout">
        <form className="card strategy-editor" onSubmit={(e) => void save(e)}>
          <h2>Your strategy</h2>
          <Field label="Strategy name">
            <input
              required
              maxLength={80}
              value={draft.name}
              onChange={(e) => change('name', e.target.value)}
            />
          </Field>
          <h3>Investments and allocation</h3>
          {draft.allocations.map((a, i) => (
            <div className="strategy-allocation" key={i}>
              <Field label={`Investment ${i + 1}`}>
                <select
                  value={a.instrumentId}
                  onChange={(e) =>
                    change(
                      'allocations',
                      draft.allocations.map((entry, j) =>
                        j === i ? { ...entry, instrumentId: e.target.value } : entry,
                      ),
                    )
                  }
                >
                  {instruments.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.ticker} · {item.shortName} · {item.exchange}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Allocation ${i + 1} (%)`}>
                <input
                  type="number"
                  required
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={a.weight}
                  onChange={(e) =>
                    change(
                      'allocations',
                      draft.allocations.map((entry, j) =>
                        j === i ? { ...entry, weight: Number(e.target.value) } : entry,
                      ),
                    )
                  }
                />
              </Field>
              {draft.allocations.length > 1 && (
                <button
                  type="button"
                  className="button subtle small"
                  aria-label={`Remove investment ${i + 1}`}
                  onClick={() =>
                    change(
                      'allocations',
                      draft.allocations.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <p className="text-small">
            Allocated: {number(draft.allocations.reduce((sum, a) => sum + a.weight, 0))}% of 100%
          </p>
          {draft.allocations.length < 5 && (
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                const next = instruments.find(
                  (item) => !draft.allocations.some((a) => a.instrumentId === item.id),
                );
                if (next)
                  change('allocations', [
                    ...draft.allocations,
                    { instrumentId: next.id, weight: 10 },
                  ]);
              }}
            >
              Add investment
            </button>
          )}
          {saved && !dirty ? (
            <Link className="text-small strategy-explore-link" to={`/explore?strategy=${draft.id}`}>
              Find another investment in Explore
            </Link>
          ) : (
            <p className="text-small muted">
              Save your strategy before opening Explore to add another investment.
            </p>
          )}
          <div className="form-divider" />
          <Field label="Strategy starting money (DKK)">
            <input
              type="number"
              required
              min="0"
              max="100000000"
              value={draft.initial}
              onChange={(e) => change('initial', Number(e.target.value))}
            />
          </Field>
          <Field label="Strategy monthly contribution (DKK)">
            <input
              type="number"
              required
              min="0"
              max="1000000"
              value={draft.monthly}
              onChange={(e) => change('monthly', Number(e.target.value))}
            />
          </Field>
          <Field label="Strategy goal (DKK)">
            <input
              type="number"
              required
              min="1"
              max="100000000"
              value={draft.goal}
              onChange={(e) => change('goal', Number(e.target.value))}
            />
          </Field>
          <Field label="Rebalancing">
            <select
              value={draft.rebalance}
              onChange={(e) => change('rebalance', e.target.value as Strategy['rebalance'])}
            >
              <option value="none">Allocate deposits only</option>
              <option value="annual">Rebalance each December</option>
            </select>
          </Field>
          {taxIssue && (
            <p className="form-error" role="alert">
              {taxIssue}
            </p>
          )}
          <p className="text-small muted">
            Weighted annual fund costs:{' '}
            {fundCost === null ? 'not fully verified' : `${number(fundCost, 2)}%`}. These can be
            used in the future planner. Fund transaction costs, entry/exit charges and broker fees
            remain separate; historical returns already include fund expenses.
          </p>
          <Field
            label="Future tax illustration"
            hint="Historical results remain before personal tax. Verify each fund’s classification before choosing a tax model."
          >
            <select
              value={draft.account}
              onChange={(e) => change('account', e.target.value as Strategy['account'])}
            >
              <option value="none">Before tax</option>
              <option value="ask">Aktiesparekonto</option>
              <option value="annual">Equity investment company · annual tax</option>
              <option value="general">Shares · tax on sale</option>
            </select>
          </Field>
          <Field label="Why this strategy?">
            <textarea
              maxLength={2000}
              rows={4}
              value={draft.note}
              onChange={(e) => change('note', e.target.value)}
              placeholder="What are you investing for? What risks and overlap have you considered?"
            />
          </Field>
          {!validation.success && (
            <p className="form-error" role="alert">
              {validation.error.issues[0].message}
            </p>
          )}
          <button
            className="button primary full-width"
            disabled={
              saving || !dirty || !validation.success || (!saved && data.strategies.length >= 10)
            }
          >
            {saving ? 'Saving…' : dirty ? 'Save strategy' : 'Strategy saved'}
          </button>
          {saved && (
            <div className="strategy-actions">
              <button
                type="button"
                className="button secondary"
                disabled={saving || dirty || data.preferredStrategyId === draft.id}
                onClick={() => void prefer()}
              >
                Make preferred
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={saving || dirty || !!taxIssue}
                onClick={() => void useInPlanner()}
              >
                Use budget in planner
              </button>
              <button
                type="button"
                className="button subtle"
                disabled={saving}
                onClick={() => setRemove(true)}
              >
                Delete strategy
              </button>
            </div>
          )}
        </form>
        <div className="strategy-results">
          <section className="card">
            <div className="section-heading">
              <div>
                <h2>Historical comparison</h2>
                <p>
                  {mode === 'demo'
                    ? 'Generated examples in DKK'
                    : 'Observed adjusted returns in DKK'}
                </p>
              </div>
              <button
                className="button secondary small"
                disabled={refreshing}
                onClick={() =>
                  void refreshMarket([
                    ...new Set(selected.flatMap((s) => s.allocations.map((a) => a.instrumentId))),
                  ])
                }
              >
                Load latest history
              </button>
            </div>
            <Field label="Compare with saved strategy">
              <select value={competitor?.id ?? ''} onChange={(e) => setCompareId(e.target.value)}>
                <option value="">Compare with cash only</option>
                {data.strategies
                  .filter((s) => s.id !== draft.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
            {months.length > 0 && (
              <>
                <div className="form-row">
                  <Field label="Strategy start month">
                    <select
                      value={draft.startMonth ?? months[0]}
                      onChange={(e) => change('startMonth', e.target.value)}
                    >
                      {draft.startMonth && !months.includes(draft.startMonth) && (
                        <option>{draft.startMonth}</option>
                      )}
                      {months.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Strategy end month">
                    <select
                      value={draft.endMonth ?? months.at(-1)}
                      onChange={(e) => change('endMonth', e.target.value)}
                    >
                      {draft.endMonth && !months.includes(draft.endMonth) && (
                        <option>{draft.endMonth}</option>
                      )}
                      {months.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="text-small muted">
                  Common history: {months[0]} to {months.at(-1)}. Both strategies use{' '}
                  {money(draft.initial)} initially and {money(draft.monthly)} each month.
                </p>
                <button
                  className="button subtle small"
                  onClick={() => setDraft((s) => ({ ...s, startMonth: null, endMonth: null }))}
                >
                  Use full common history
                </button>
              </>
            )}
            {issue ? (
              <Empty title="Historical comparison unavailable">
                {issue} <Link to="/explore">Check investment coverage</Link>
              </Empty>
            ) : (
              <>
                <div className="strategy-outcomes">
                  {results.map((r, i) => (
                    <article className="strategy-outcome" key={selected[i].id}>
                      <h3>{selected[i].name}</h3>
                      <strong>{money(r.value)}</strong>
                      <dl>
                        <div>
                          <dt>Contributed</dt>
                          <dd>{money(r.contributed)}</dd>
                        </div>
                        <div>
                          <dt>Gain / loss</dt>
                          <dd>{money(r.gain)}</dd>
                        </div>
                        <div>
                          <dt>Largest investment fall</dt>
                          <dd>{percent(r.drawdown)}</dd>
                        </div>
                        <div>
                          <dt>Recovery from peak</dt>
                          <dd>
                            {r.drawdown === 0
                              ? 'No observed fall'
                              : r.recoveryMonths === null
                                ? 'Not recovered by period end'
                                : `${r.recoveryMonths} months`}
                          </dd>
                        </div>
                        <div>
                          <dt>Worst month</dt>
                          <dd>{percent(r.worstMonth)}</dd>
                        </div>
                      </dl>
                      {r.peakMonth && (
                        <p className="text-small muted">
                          Peak {r.peakMonth}; trough {r.troughMonth}
                          {r.recoveryMonth ? `; recovered ${r.recoveryMonth}` : ''}.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
                {results[0] && (
                  <>
                    <StrategyChart results={results} names={selected.map((s) => s.name)} />
                    <p className="chart-caption">
                      Cash baseline: {money(results[0].contributed)} at 0% interest. Monthly
                      observations can miss larger falls between closes.
                    </p>
                  </>
                )}
                <button
                  className="disclosure-button"
                  aria-expanded={table}
                  onClick={() => setTable(!table)}
                >
                  {table ? 'Hide' : 'Show'} portfolio monthly values
                </button>
                {table && (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Historical portfolio monthly values"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Contributions / cash</th>
                          {selected.map((s, i) => (
                            <th key={s.id}>{i === 0 ? 'Primary' : 'Alternative'} value</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results[0]?.points.map((p, i) => (
                          <tr key={p.month}>
                            <td>{p.month}</td>
                            <td>{money(p.contributed)}</td>
                            {results.map((r, j) => (
                              <td key={j}>{money(r.points[i].value)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <Note>
              Deposits arrive at each monthly close, including the first. Fractional exposure and
              reinvested dividends are assumed. Fund expenses are already reflected in observed fund
              returns. Personal tax, trading and currency-conversion charges are excluded.
              Rebalancing assumes trades without costs. These are historical outcomes, not
              forecasts.
            </Note>
          </section>
          {draft.allocations.map((a) => (
            <section className="card strategy-facts" key={a.instrumentId}>
              <h3>
                {getInstrument(a.instrumentId).ticker} · {a.weight}%
              </h3>
              <p>{getInstrument(a.instrumentId).description}</p>
              <FundFacts item={getInstrument(a.instrumentId)} />
              <Link to={`/explore?investment=${a.instrumentId}`}>
                Review history, fund facts and listing
              </Link>
            </section>
          ))}
          {results[0] && (
            <HoldingPeriodAnalysis
              points={strategyReturnObservations(results[0])}
              currency="DKK"
              adjusted={mode !== 'demo'}
              demo={mode === 'demo'}
            />
          )}
          {results[0] && (
            <p className="text-small muted">
              Investment return statistics use a deposit-adjusted return index for this strategy and
              period. Allocations can drift, and your deposits affect their weights. Rolling windows
              describe this observed path; they are not separately restarted saving simulations.
            </p>
          )}
          {results[0] &&
            analyzeHistory(strategyReturnObservations(results[0])).headline?.annualizedReturn !==
              null && (
              <p className="text-small muted">
                Past annualized returns are not copied into the future planner.
              </p>
            )}
        </div>
      </div>
      {remove && (
        <Modal title="Delete this strategy?" onClose={() => setRemove(false)}>
          <p>Remove “{draft.name}” and its research notes from your workspace.</p>
          <div className="button-group">
            <button className="button secondary" onClick={() => setRemove(false)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={saving}
              onClick={() => void deleteStrategy()}
            >
              Remove strategy
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
