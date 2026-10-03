import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Star, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/store';
import { instruments, getInstrument } from '../../shared/catalog';
import type { InstrumentId } from '../../shared/schema';
import { maxDrawdown } from '../../shared/finance';
import { historicalComparison, latestQuote } from '../../shared/market';
import { PageHeading, Empty, Note, Field } from '../components/ui';
import { PriceChart } from '../components/charts';
import { date, number, percent } from '../lib/format';

export default function Explore() {
  const { data, market, mode, update, saving, notify, refreshMarket, refreshing } = useApp();
  const [params] = useSearchParams();
  const requested = params.get('investment');
  const [selected, setSelected] = useState<InstrumentId>(
    instruments.find((i) => i.id === requested)?.id ?? 'vwce',
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All investments');
  const [compare, setCompare] = useState<InstrumentId[]>([]);
  const [years, setYears] = useState<number | 'all'>(20);
  const item = getInstrument(selected);
  const series = market[selected];
  const watch = data.watchlist.find((w) => w.instrumentId === selected);
  const [note, setNote] = useState(watch?.note ?? '');
  const rows = instruments.filter(
    (i) =>
      `${i.name} ${i.ticker} ${i.isin}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'All investments' ||
        (filter === 'ETFs' && i.kind === 'ETF') ||
        (filter === 'Stocks' && i.kind === 'Stock') ||
        (filter === 'Watchlist' && data.watchlist.some((w) => w.instrumentId === i.id))),
  );
  const selectedIds = [selected, ...compare.filter((id) => id !== selected)].slice(0, 3);
  const {
    available,
    monthly,
    adjusted,
    data: chartData,
    points,
  } = historicalComparison(market, selectedIds, years);
  const last = latestQuote(series);
  const historyLast = points.at(-1);
  const first = points[0];
  async function toggleWatch(id: InstrumentId) {
    const exists = data.watchlist.some((w) => w.instrumentId === id);
    if (
      await update((old) => ({
        ...old,
        watchlist: exists
          ? old.watchlist.filter((w) => w.instrumentId !== id)
          : [...old.watchlist, { instrumentId: id, note: '' }],
      }))
    )
      notify(exists ? 'Removed from your watchlist.' : 'Added to your watchlist.');
  }
  function choose(id: InstrumentId) {
    setSelected(id);
    setNote(data.watchlist.find((w) => w.instrumentId === id)?.note ?? '');
  }
  return (
    <>
      <PageHeading
        eyebrow="CURIOSITY IS A GOOD START"
        title="Get to know your options."
        description="Explore a starter universe of investments. Compare their behavior and keep notes."
        action={
          <button
            className="button secondary"
            disabled={refreshing}
            onClick={() => void refreshMarket(selectedIds)}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Checking data…' : 'Refresh data'}
          </button>
        }
      />
      <section className="card explorer-list">
        <div className="explorer-toolbar">
          <div className="tabs" aria-label="Investment filters">
            {['All investments', 'ETFs', 'Stocks', 'Watchlist'].map((tab) => (
              <button
                key={tab}
                className={filter === tab ? 'active' : ''}
                onClick={() => setFilter(tab)}
                aria-pressed={filter === tab}
              >
                {tab}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Search investments"
              placeholder="Name, ticker or ISIN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="investment-table">
              <thead>
                <tr>
                  <th>Investment</th>
                  <th>Market</th>
                  <th>Latest price</th>
                  <th>Data date</th>
                  <th>
                    <span className="sr-only">Watchlist</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const price = latestQuote(market[i.id]);
                  const saved = data.watchlist.some((w) => w.instrumentId === i.id);
                  return (
                    <tr key={i.id} className={selected === i.id ? 'selected-row' : ''}>
                      <td>
                        <button
                          className="instrument-button"
                          onClick={() => choose(i.id)}
                          aria-label={`View ${i.name}`}
                        >
                          <span className="instrument-mark" style={{ background: i.color }}>
                            {i.ticker.slice(0, 2)}
                          </span>
                          <span>
                            <strong>{i.shortName}</strong>
                            <small>
                              {i.ticker} · {i.kind}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{i.region}</td>
                      <td>{price ? `${number(price.close)} ${i.currency}` : 'Not loaded'}</td>
                      <td className="muted">{price ? date(price.date) : '—'}</td>
                      <td>
                        <button
                          className={`icon-button star-button ${saved ? 'saved' : ''}`}
                          aria-label={`${saved ? 'Remove' : 'Add'} ${i.ticker} ${saved ? 'from' : 'to'} watchlist`}
                          aria-pressed={saved}
                          disabled={saving}
                          onClick={() => void toggleWatch(i.id)}
                        >
                          <Star size={18} fill={saved ? 'currentColor' : 'none'} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No investments found">
            Try another search or filter. This starter catalog contains six investments.
          </Empty>
        )}
        <div className="table-footnote">
          A research starting point, not a recommended portfolio. Fund overlap and concentration
          matter.
        </div>
      </section>
      <div className="explore-detail-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {item.ticker} · {item.exchange}
              </div>
              <h2>{item.shortName}</h2>
              <p>
                {available.length > 1
                  ? `${adjusted ? 'Adjusted return' : 'Price change'} indexed to 100 · common ${monthly ? 'months' : 'dates'} only`
                  : `${adjusted ? 'Adjusted monthly history' : 'Price history'} in ${item.currency}`}
              </p>
            </div>
            <div className="segmented" aria-label="Chart time range">
              {([1, 3, 5, 10, 20, 'all'] as const).map((y) => (
                <button
                  key={y}
                  className={years === y ? 'active' : ''}
                  onClick={() => setYears(y)}
                  aria-pressed={years === y}
                >
                  {y === 'all' ? 'All' : `${y}Y`}
                </button>
              ))}
            </div>
          </div>
          {series ? (
            <>
              <div className="detail-metrics">
                <div>
                  <span>Latest price</span>
                  <strong>
                    {last ? number(last.close) : '—'} <small>{item.currency}</small>
                  </strong>
                </div>
                <div>
                  <span>{adjusted ? 'Period adjusted return' : 'Period price change'}</span>
                  <strong>
                    {first && historyLast ? percent(historyLast.close / first.close - 1) : '—'}
                  </strong>
                </div>
                <div>
                  <span>Largest observed fall</span>
                  <strong className="loss">
                    {points.length > 1 ? percent(maxDrawdown(points)) : '—'}
                  </strong>
                </div>
              </div>
              {chartData.length ? (
                <PriceChart
                  data={chartData}
                  keys={available.map((id) => ({
                    id,
                    name: getInstrument(id).ticker,
                    color: getInstrument(id).color,
                  }))}
                  currency={available.length === 1}
                  adjusted={adjusted}
                />
              ) : (
                <Empty title="No overlapping history">
                  Choose investments with overlapping observations to compare them.
                </Empty>
              )}
              {first && historyLast && (
                <p className="muted text-small">
                  Showing {date(first.date)}–{date(historyLast.date)} · {points.length}{' '}
                  {monthly ? 'monthly' : 'price'} observations. Available history starts{' '}
                  {date(series.points[0].date)}. Younger funds and listings have shorter histories.
                </p>
              )}
            </>
          ) : (
            <Empty
              title="Ready for real market data"
              action={
                <button
                  className="button secondary"
                  onClick={() => void refreshMarket([selected])}
                  disabled={refreshing}
                >
                  Load this investment
                </button>
              }
            >
              This listing has no saved provider data yet. The free source may not cover every
              exchange. Missing data is never replaced with sample prices.
            </Empty>
          )}
          <div className="compare-options">
            <strong>Compare with</strong>
            {instruments
              .filter((i) => i.id !== selected)
              .map((i) => (
                <label className="compare-chip" key={i.id}>
                  <input
                    type="checkbox"
                    checked={compare.includes(i.id)}
                    disabled={
                      !compare.includes(i.id) && compare.filter((id) => id !== selected).length >= 2
                    }
                    onChange={(e) =>
                      setCompare((old) =>
                        e.target.checked ? [...old, i.id] : old.filter((id) => id !== i.id),
                      )
                    }
                  />
                  {i.ticker}
                </label>
              ))}
          </div>
          {selectedIds.some((id) => !market[id]) && (
            <p className="muted text-small">
              Some selected investments have no data and cannot appear in the comparison.
            </p>
          )}
          <Note>
            {mode === 'demo'
              ? 'All prices, performance, FX rates, and drawdowns shown here are generated examples, not market history.'
              : adjusted
                ? 'Historical returns use provider adjusted closes, accounting for splits and dividends. Latest prices used for holdings are separate, unadjusted quotes. Returns are before personal taxes and trading costs.'
                : 'Provider price history excludes dividends and is not total return. Provider adjustments and available history may differ by exchange.'}{' '}
            Comparisons use trading currencies, so they do not show your DKK return. Drawdown is
            measured only at the available observations.
          </Note>
          {series && (
            <div className="source-line">
              Source: {series.source === 'demo' ? 'Generated demonstration' : series.source} ·
              {series.providerSymbol && <>{series.providerSymbol} · </>}
              Retrieved {date(series.fetchedAt)} · Quote {date(last!.date)} ·{' '}
              {series.fxSource ?? 'Provider'} FX {date(series.fxDate)}
            </div>
          )}
        </section>
        <aside className="detail-aside">
          <section className="card">
            <div className="eyebrow">UNDERSTAND WHAT YOU OWN</div>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <dl className="detail-list">
              <div>
                <dt>Type</dt>
                <dd>{item.kind}</dd>
              </div>
              <div>
                <dt>Trading currency</dt>
                <dd>{item.currency}</dd>
              </div>
              <div>
                <dt>ISIN</dt>
                <dd className="mono">{item.isin}</dd>
              </div>
              <div>
                <dt>Danish tax status</dt>
                <dd>
                  <span className="pill amber">VERIFY WITH SKAT</span>
                </dd>
              </div>
            </dl>
            <p className="text-small muted">
              Confirm current costs, the fund’s key information document, and Danish tax
              classification before investing. Trading currency does not describe all underlying
              currency exposure.
            </p>
            <a className="text-link" href={item.source} target="_blank" rel="noreferrer">
              Visit the issuer <ArrowUpRight size={15} />
            </a>
          </section>
          <section className="card">
            <h3>Your investment notes</h3>
            {watch ? (
              <>
                <Field label="Why are you following this?">
                  <textarea
                    rows={5}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What I understand, what I still need to learn…"
                  />
                </Field>
                <button
                  className="button secondary full-width"
                  disabled={saving || note === watch.note}
                  onClick={async () => {
                    if (
                      await update((old) => ({
                        ...old,
                        watchlist: old.watchlist.map((w) =>
                          w.instrumentId === selected ? { ...w, note } : w,
                        ),
                      }))
                    )
                      notify('Research note saved.');
                  }}
                >
                  Save note
                </button>
              </>
            ) : (
              <>
                <p>Add this investment to your watchlist to keep a research journal.</p>
                <button
                  className="button secondary"
                  disabled={saving}
                  onClick={() => void toggleWatch(selected)}
                >
                  <Star size={16} />
                  Follow investment
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
