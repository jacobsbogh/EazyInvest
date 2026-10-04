import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Star, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useApp, useHistories } from '../lib/store';
import { MarketSearch } from '../components/MarketSearch';
import { FundFacts } from '../components/FundFacts';
import type { InstrumentId } from '../../shared/schema';
import { maxDrawdown } from '../../shared/finance';
import { historicalComparison } from '../../shared/market';
import { historicalObservations } from '../../shared/historical-series';
import { HoldingPeriodAnalysis } from '../components/HoldingPeriodAnalysis';
import { HistoricalSavings } from '../components/HistoricalSavings';
import { PageHeading, Empty, Note, Field } from '../components/ui';
import { PriceChart } from '../components/charts';
import { date, number, percent } from '../lib/format';
import { danishCatalogDate } from '../../shared/catalog';
import { historyIsStale, ecbHistoryStart } from '../../shared/market-policy';
import { currentQuote, quoteIsStale } from '../../shared/quote';
import { fundFacts } from '../../shared/fund-facts';

export default function Explore() {
  const {
    data,
    market,
    quotes,
    historyStatus,
    mode,
    update,
    saving,
    notify,
    refreshMarket,
    refreshing,
    instruments,
    getInstrument,
    historyRequests,
    queueHistory,
  } = useApp();
  const [params] = useSearchParams();
  const requested = params.get('investment');
  const [targetStrategy, setTargetStrategy] = useState(params.get('strategy') ?? '');
  const [selected, setSelected] = useState<InstrumentId>(
    instruments.find((i) => i.id === requested)?.id ?? 'vwce',
  );
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All investments');
  const [page, setPage] = useState(0);
  const [compare, setCompare] = useState<InstrumentId[]>([]);
  const [years, setYears] = useState<number | 'all'>(20);
  const [analysisCurrency, setAnalysisCurrency] = useState<'native' | 'DKK'>('DKK');
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
        (filter === 'Danish stocks' && i.kind === 'Stock' && i.mic !== undefined) ||
        (filter === 'Danish funds' && i.kind === 'Fund' && i.mic === 'XCSE') ||
        (filter === 'First North' && ['DSME', 'FNDK'].includes(i.mic ?? '')) ||
        (filter === 'Watchlist' && data.watchlist.some((w) => w.instrumentId === i.id))),
  );
  const selectedIds = [selected, ...compare.filter((id) => id !== selected)].slice(0, 3);
  useHistories(selectedIds);
  const pageSize = 20;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  const visibleRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const {
    available,
    monthly,
    adjusted,
    data: chartData,
    points,
  } = historicalComparison(market, selectedIds, years, analysisCurrency);
  const fullHistory = historicalObservations(series, analysisCurrency);
  const dkkHistory = historicalObservations(series, 'DKK');
  const chartCurrency = analysisCurrency === 'DKK' ? 'DKK' : item.currency;
  const pricing = currentQuote(series, quotes[selected]);
  const last = pricing?.quote;
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
        description="Find a listing, check its history and build your investment strategy."
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
            {[
              'All investments',
              'Danish funds',
              'Danish stocks',
              'First North',
              'ETFs',
              'Stocks',
              'Watchlist',
            ].map((tab) => (
              <button
                key={tab}
                className={filter === tab ? 'active' : ''}
                onClick={() => {
                  setFilter(tab);
                  setPage(0);
                }}
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
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
                {visibleRows.map((i) => {
                  const pricing = currentQuote(market[i.id], quotes[i.id]);
                  const price = pricing?.quote;
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
                              {i.referenceStatus === 'retained' && ' · Historical listing'}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        {i.exchange} · {i.currency}
                      </td>
                      <td>{price ? `${number(price.close)} ${i.currency}` : 'Not loaded'}</td>
                      <td className="muted">
                        {price
                          ? `${date(price.date)}${mode === 'cloud' && pricing && quoteIsStale(pricing) ? ' · Stale' : ''}`
                          : i.mic && !i.yahooSymbol
                            ? 'History unavailable'
                            : '—'}
                      </td>
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
            Try another name, ticker or ISIN, or search the supported markets below.
          </Empty>
        )}
        {query.trim().length >= 2 && (
          <MarketSearch
            query={query}
            choose={(investment) => {
              choose(investment.id);
              setQuery('');
            }}
          />
        )}
        {rows.length > pageSize && (
          <nav className="button-group table-footnote" aria-label="Investment pages">
            <button
              className="button secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span aria-live="polite">
              {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, rows.length)} of{' '}
              {rows.length} listings
            </span>
            <button
              className="button secondary"
              disabled={(currentPage + 1) * pageSize >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </nav>
        )}
        <div className="table-footnote">
          {instruments.filter((i) => i.kind === 'Stock' && i.mic).length} Danish share listings ·
          Main Market and First North · ESMA reference snapshot {danishCatalogDate}. Price coverage
          varies by listing.
        </div>
      </section>
      <section className="card coverage-card">
        <div>
          <h2>{item.ticker}: history coverage</h2>
          <p>
            {historyStatus[selected] === 'loading'
              ? 'Loading saved history…'
              : historyStatus[selected] === 'error'
                ? 'Saved history could not be loaded. Retry with Refresh data.'
                : series
                  ? `${mode === 'demo' ? 'Generated sample' : series.source} history: ${series.points[0].date} to ${series.points.at(-1)!.date}.${mode === 'cloud' && historyIsStale(series) ? ' Data is over a week old; the last available cache is shown.' : ''}`
                  : item.mic && !item.yahooSymbol
                    ? 'This official listing has no unambiguous free history mapping yet. It remains available for your watchlist and research.'
                    : historyRequests[selected]?.status === 'pending'
                      ? 'History is queued. Check after the next scheduled data update.'
                      : historyRequests[selected]?.status === 'unavailable'
                        ? 'The free source does not support this exact listing.'
                        : 'Historical data has not been requested for this listing.'}
          </p>
          <p className="text-small muted">
            {item.isin || 'ISIN not verified'} · {item.exchange} · {item.currency}
          </p>
          {mode === 'cloud' && (
            <p className="text-small muted">
              Quotes are checked each scheduled trading-day update; history refreshes weekly. Prices
              and monthly observations show their actual dates.
            </p>
          )}
          {pricing && (
            <p className="text-small muted">
              Latest quote: {number(pricing.quote.close)} {item.currency} · observed{' '}
              {date(pricing.quote.date)} · checked {date(pricing.fetchedAt)}
              {mode === 'cloud' && quoteIsStale(pricing) ? ' · Stale' : ''}.
            </p>
          )}
          {series?.reportedTrade && (
            <p className="text-small muted">
              <a
                href="https://tradereports.nasdaq.com/shares/trade-reports/post-trade"
                target="_blank"
                rel="noreferrer"
              >
                Nasdaq reported exchange trade
              </a>
              : {number(series.reportedTrade.close)} DKK ·{' '}
              {new Date(series.reportedTrade.dateTime).toLocaleString('da-DK')} ·{' '}
              {series.reportedTrade.mic}. Closing-session sample; historical analysis uses{' '}
              {series.source}.
            </p>
          )}
        </div>
        <div className="button-group">
          {fundFacts(item).cost && (
            <Link className="button secondary" to={`/compare-funds?investment=${selected}`}>
              Compare costs and tax
            </Link>
          )}
          {!series && (
            <button
              className="button secondary"
              disabled={
                mode === 'demo' ||
                historyStatus[selected] === 'loading' ||
                (item.mic !== undefined && !item.yahooSymbol) ||
                historyRequests[selected]?.status === 'pending'
              }
              onClick={() => void queueHistory(selected)}
            >
              Request history
            </button>
          )}
          <Link className="button primary" to={`/strategies?investment=${selected}`}>
            Build a strategy
          </Link>
        </div>
      </section>
      {data.strategies.length > 0 && (
        <section className="card coverage-card">
          <Field label="Add investment to saved strategy">
            <select value={targetStrategy} onChange={(e) => setTargetStrategy(e.target.value)}>
              <option value="">Choose a strategy</option>
              {data.strategies
                .filter(
                  (s) =>
                    s.allocations.length < 5 ||
                    s.allocations.some((a) => a.instrumentId === selected),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          {data.strategies.some(
            (s) =>
              s.id === targetStrategy &&
              (s.allocations.length < 5 || s.allocations.some((a) => a.instrumentId === selected)),
          ) && (
            <Link
              className="button secondary"
              to={`/strategies?strategy=${targetStrategy}&investment=${selected}`}
            >
              Use this investment
            </Link>
          )}
        </section>
      )}
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
                  : `${adjusted ? 'Adjusted monthly history' : 'Price history'} in ${chartCurrency}`}
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
          <div className="history-currency-controls" role="group" aria-label="Analysis currency">
            <span>View returns in</span>
            <div className="segmented">
              <button
                aria-pressed={analysisCurrency === 'DKK'}
                className={analysisCurrency === 'DKK' ? 'active' : ''}
                onClick={() => setAnalysisCurrency('DKK')}
              >
                DKK
              </button>
              <button
                aria-pressed={analysisCurrency === 'native'}
                className={analysisCurrency === 'native' ? 'active' : ''}
                onClick={() => setAnalysisCurrency('native')}
              >
                Trading currency
              </button>
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
                  <span>
                    {adjusted ? 'Period adjusted return' : 'Period price change'} · {chartCurrency}
                  </span>
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
              {fullHistory.missingFx ? (
                <Empty
                  title="Historical DKK conversion unavailable"
                  action={
                    <button
                      className="button secondary"
                      onClick={() => setAnalysisCurrency('native')}
                    >
                      View trading currency
                    </button>
                  }
                >
                  Dated exchange rates are missing for this cached history. Load an updated market
                  cache to analyze it in DKK.
                </Empty>
              ) : chartData.length ? (
                <PriceChart
                  data={chartData}
                  keys={available.map((id) => ({
                    id,
                    name: getInstrument(id).ticker,
                    color: getInstrument(id).color,
                  }))}
                  currency={available.length === 1}
                  adjusted={adjusted}
                  unit={
                    analysisCurrency === 'DKK'
                      ? 'DKK'
                      : available.length === 1
                        ? item.currency
                        : 'trading currencies'
                  }
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
              title={
                historyStatus[selected] === 'loading'
                  ? 'Loading history'
                  : historyStatus[selected] === 'error'
                    ? 'History unavailable'
                    : 'Ready for real market data'
              }
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
              {historyStatus[selected] === 'loading'
                ? 'The saved price series is loading.'
                : historyStatus[selected] === 'error'
                  ? 'The saved cache could not be read. Existing data is retained; retry to check again.'
                  : 'This listing has no saved provider history yet. The free source may not cover every exchange. Missing data is never replaced with sample prices.'}
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
          {selectedIds.some((id) => !available.includes(id)) && (
            <p className="muted text-small">
              Some selected investments have no usable history in this currency and cannot appear in
              the comparison.
            </p>
          )}
          <Note>
            {analysisCurrency === 'DKK' &&
              series?.currency !== 'DKK' &&
              series?.fxSource === 'ECB' &&
              series.points[0].date < ecbHistoryStart && (
                <>
                  DKK history starts where ECB rates are available, from January 1999. Older history
                  remains available in trading currency.{' '}
                </>
              )}
            {mode === 'demo'
              ? 'All prices, performance, FX rates, and drawdowns shown here are generated examples, not market history.'
              : adjusted
                ? 'Historical returns use provider adjusted closes, accounting for splits and dividends. Latest prices used for holdings are separate, unadjusted quotes. Returns are before personal taxes and trading costs.'
                : 'Provider price history excludes dividends and is not total return. Provider adjustments and available history may differ by exchange.'}{' '}
            {analysisCurrency === 'DKK'
              ? 'DKK returns include currency movements using dated reference FX, before broker conversion costs.'
              : 'Comparisons use trading currencies, so they do not show your DKK return.'}{' '}
            Drawdown is measured only at the available observations.
          </Note>
          {series && (
            <div className="source-line">
              History source: {series.source === 'demo' ? 'Generated demonstration' : series.source}
              {series.providerSymbol && <> · {series.providerSymbol}</>} · History retrieved{' '}
              {date(series.fetchedAt)} · Quote source:{' '}
              {pricing?.source === 'demo'
                ? 'Generated demonstration'
                : (pricing?.source ?? 'unavailable')}
              {pricing?.providerSymbol && <> · {pricing.providerSymbol}</>} · Quote{' '}
              {last ? date(last.date) : 'unavailable'} · Quote checked{' '}
              {pricing ? date(pricing.fetchedAt) : 'unavailable'} ·{' '}
              {pricing?.fxSource ?? 'Provider'} FX {pricing ? date(pricing.fxDate) : 'unavailable'}
              {series.closeAdjustment === 'splits' && (
                <> · Historical Close is split-adjusted; Adj Close also includes dividends.</>
              )}
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
                <dd className="mono">{item.isin || 'Not verified'}</dd>
              </div>
              <div>
                <dt>Danish tax status</dt>
                <dd>
                  <span className="pill amber">VERIFY WITH SKAT</span>
                </dd>
              </div>
            </dl>
            <FundFacts item={item} />
            <p className="text-small muted">
              Confirm current costs, the fund’s key information document, and Danish tax
              classification before investing. Trading currency does not describe all underlying
              currency exposure.
            </p>
            <a className="text-link" href={item.source} target="_blank" rel="noreferrer">
              {item.sourceKind === 'regulator'
                ? 'View official listing source'
                : item.sourceKind === 'provider'
                  ? 'View listing source'
                  : 'Visit the issuer'}{' '}
              <ArrowUpRight size={15} />
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
      <div className="history-analysis-grid">
        <HoldingPeriodAnalysis
          key={`${selected}-${analysisCurrency}`}
          points={fullHistory.points}
          currency={fullHistory.currency}
          adjusted={fullHistory.adjusted}
          demo={mode === 'demo'}
          unavailableReason={
            fullHistory.missingFx
              ? 'Dated exchange rates are missing. Switch to trading currency or load an updated market cache.'
              : undefined
          }
        />
        <HistoricalSavings
          key={selected}
          points={dkkHistory.points}
          adjusted={dkkHistory.adjusted}
          demo={mode === 'demo'}
          unavailableReason={
            dkkHistory.missingFx
              ? 'Dated exchange rates are missing for this investment. Load an updated market cache to simulate saving in DKK.'
              : undefined
          }
        />
      </div>
    </>
  );
}
