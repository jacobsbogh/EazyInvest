import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/store';
import { loadHoldings } from '../lib/holdings';
import {
  strategyExposure,
  securityOverlap,
  type HoldingsSnapshot,
  type Exposure,
} from '../../shared/holdings';
import { PageHeading, Field, Note } from '../components/ui';
import { number } from '../lib/format';

function Distribution({ values, title }: { values: Map<string, number>; title: string }) {
  const rows = [...values].sort((a, b) => b[1] - a[1]),
    shown = rows.slice(0, 8);
  const covered = rows.reduce((s, r) => s + r[1], 0);
  return (
    <section className="card exposure-distribution">
      <h3>{title}</h3>
      <p className="text-small muted">
        Share of the full allocation, using reported equity labels.
      </p>
      {shown.map(([name, value]) => (
        <div className="exposure-bar" key={name}>
          <span>{name}</span>
          <strong>{number(value, 2)}%</strong>
          <div>
            <i style={{ width: `${Math.min(100, value)}%` }} />
          </div>
        </div>
      ))}
      {rows.length > shown.length && (
        <p>Other resolved labels: {number(covered - shown.reduce((s, r) => s + r[1], 0), 2)}%</p>
      )}
      <p>
        <strong>Unclassified / unresolved: {number(Math.max(0, 100 - covered), 2)}%</strong>
      </p>
    </section>
  );
}
function Summary({ exposure, title }: { exposure: Exposure; title: string }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="exposure-total">{number(exposure.covered, 2)}% identified security weight</p>
      <p>{number(exposure.unknown, 2)}% unresolved, unclassified cash or derivatives.</p>
      <div
        className="table-scroll"
        role="region"
        aria-label={`${title} top securities`}
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Largest identified securities</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {[...exposure.holdings]
              .sort((a, b) => b[1].weight - a[1].weight)
              .slice(0, 10)
              .map(([id, h]) => (
                <tr key={id}>
                  <td>
                    {h.name}
                    <small className="block muted">{id}</small>
                  </td>
                  <td>{number(h.weight, 2)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!exposure.holdings.size && <p>Verified holdings are unavailable for this selection.</p>}
    </section>
  );
}
export default function Holdings() {
  const { data, instruments } = useApp();
  const [params] = useSearchParams();
  const [ids, setIds] = useState([
    instruments.find((i) => i.id === (params.get('first') ?? params.get('investment')))?.id ??
      'eunl',
    instruments.find((i) => i.id === params.get('second'))?.id ?? 'sxr8',
  ]);
  const [strategyId, setStrategyId] = useState(
    params.get('strategy') ?? data.preferredStrategyId ?? '',
  );
  const [snapshots, setSnapshots] = useState<HoldingsSnapshot[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const strategy = data.strategies.find((s) => s.id === strategyId);
  const requested = [
    ...new Set([...ids, ...(strategy?.allocations.map((a) => a.instrumentId) ?? []), 'eunl']),
  ];
  const key = requested.join('|');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all(key.split('|').map(loadHoldings))
      .then((values) => {
        if (active) setSnapshots(values.filter((s): s is HoldingsSnapshot => !!s));
      })
      .catch(() => {
        if (active) {
          setSnapshots([]);
          setError('Reviewed holdings could not be loaded. Please retry.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, retry]);
  const selections = ids.map((id) =>
    strategyExposure([{ instrumentId: id, weight: 100 }], instruments, snapshots),
  );
  const overlap = securityOverlap(selections[0], selections[1]);
  const combined = strategy
    ? strategyExposure(strategy.allocations, instruments, snapshots)
    : undefined;
  const used = [
    ...new Map(
      [...selections.flatMap((s) => s.sources), ...(combined?.sources ?? [])].map((s) => [
        s.instrumentId,
        s,
      ]),
    ).values(),
  ];
  return (
    <>
      <PageHeading
        eyebrow="LOOK INSIDE YOUR INVESTMENTS"
        title="Know what you already own."
        description="Compare shared securities and see the exposure behind a saved strategy."
        action={
          <Link className="button secondary" to="/contributions">
            Plan monthly contributions
          </Link>
        }
      />
      <section className="card">
        <h2>Compare holdings</h2>
        <div className="form-row">
          {ids.map((id, n) => (
            <Field key={n} label={`Holdings investment ${n === 0 ? 'A' : 'B'}`}>
              <select
                value={id}
                onChange={(e) => setIds((old) => old.map((v, i) => (i === n ? e.target.value : v)))}
              >
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        {loading ? (
          <p role="status">Loading reviewed holdings…</p>
        ) : error ? (
          <p role="alert">
            {error}{' '}
            <button className="button secondary" onClick={() => setRetry((v) => v + 1)}>
              Retry holdings
            </button>
          </p>
        ) : (
          <>
            <div className="overlap-result" aria-label="Security overlap result">
              <strong>{number(overlap.observed, 2)}% observed security overlap</strong>
              <p>
                Possible total range: {number(overlap.observed, 2)}%–{number(overlap.upper, 2)}%.
                Unresolved holdings can add overlap; the range is a bound, not an estimate.
              </p>
            </div>
            {overlap.shared.length ? (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Shared securities"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Shared security</th>
                      <th>A weight</th>
                      <th>B weight</th>
                      <th>Common weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overlap.shared.slice(0, 15).map((h) => (
                      <tr key={h.isin}>
                        <td>
                          {h.name}
                          <small className="block muted">{h.isin}</small>
                        </td>
                        <td>{number(h.first, 2)}%</td>
                        <td>{number(h.second, 2)}%</td>
                        <td>{number(h.shared, 2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Note>
                No common securities have been verified in the available data. This does not
                establish zero overlap.
              </Note>
            )}
          </>
        )}
      </section>
      {!loading && !error && (
        <div className="exposure-grid">
          {selections.map((e, n) => (
            <Summary
              exposure={e}
              title={`Investment ${n === 0 ? 'A' : 'B'} · ${instruments.find((i) => i.id === ids[n])!.ticker}`}
              key={n}
            />
          ))}
        </div>
      )}
      <section className="card">
        <h2>Your strategy’s exposure</h2>
        <Field label="Exposure strategy">
          <select value={strategy?.id ?? ''} onChange={(e) => setStrategyId(e.target.value)}>
            <option value="">Choose a saved strategy</option>
            {data.strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {!strategy ? (
          <p>
            <Link to="/strategies">Save an investment strategy</Link> to inspect its weighted
            underlying securities.
          </p>
        ) : (
          <p>
            Uses target allocation weights for “{strategy.name}”, rather than the value of recorded
            portfolio positions.{' '}
            <Link to={`/contributions?strategy=${strategy.id}`}>Plan its contributions</Link>
          </p>
        )}
      </section>
      {combined && !loading && !error && (
        <>
          <Summary exposure={combined} title={`${strategy!.name} · target exposure`} />
          <div className="exposure-grid">
            <Distribution values={combined.countries} title="Reported countries" />
            <Distribution values={combined.sectors} title="Issuer sector labels" />
          </div>
        </>
      )}
      {!loading && !error && (
        <section className="card">
          <h2>Dates and source coverage</h2>
          {used.length ? (
            used.map((s) => (
              <div className="exposure-source" key={s.instrumentId}>
                <h3>{instruments.find((i) => i.id === s.instrumentId)!.name}</h3>
                <p>
                  Holdings as of {s.asOf}; checked {s.checkedAt}. {s.holdings.length} identified
                  securities ·{' '}
                  {s.method === 'reviewed-subset'
                    ? 'Partial reviewed subset'
                    : 'Issuer ISIN holdings'}
                  .
                </p>
                <p>
                  <a href={s.source} target="_blank" rel="noreferrer">
                    Issuer holdings source
                  </a>
                  {s.identitySource && (
                    <>
                      {' '}
                      ·{' '}
                      <a href={s.identitySource} target="_blank" rel="noreferrer">
                        Security identity reference
                      </a>
                    </>
                  )}
                  {s.rescaled && ' · Small rounding excess was proportionally scaled to 100%.'}
                </p>
                {Date.now() - Date.parse(s.asOf) > 45 * 86400000 && (
                  <p className="text-small muted">
                    This snapshot is more than 45 days old. Weights may have changed.
                  </p>
                )}
              </div>
            ))
          ) : (
            <p>No reviewed fund source is available for this selection.</p>
          )}
        </section>
      )}
      <section className="card assumptions">
        <h2>What these numbers mean</h2>
        <ul>
          <li>
            Observed overlap sums the smaller weight for each matching ISIN. Different share classes
            and ADRs remain separate securities.
          </li>
          <li>
            All percentages use the full fund or target strategy allocation. Unresolved weight is
            not normalized away and does not prove diversification.
          </li>
          <li>
            Country and sector labels come from issuer holdings. They describe the identified equity
            portion, not revenues or currency exposure. Sector labels retain issuer names because
            classification schemes can differ.
          </li>
          <li>
            Sources have their own reporting dates. Reviewed snapshots are published with app
            releases and are not live holdings feeds.
          </li>
          <li>
            Direct shares use their catalog ISIN or an unambiguous ticker and exchange match in a
            listed issuer source. Issuer snapshots are real in demo mode; demo strategies and
            portfolio positions remain illustrative.
          </li>
        </ul>
        <Link to="/compare-funds">Compare costs, distributions and tax assumptions</Link>
      </section>
    </>
  );
}
