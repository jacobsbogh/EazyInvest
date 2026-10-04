import { useState } from 'react';
import { discoverInvestments } from '../lib/firebase';
import { friendlyError, useApp } from '../lib/store';
import { searchQuerySchema, type Discovery } from '../../shared/discovery';
import type { Instrument } from '../../shared/catalog';

export function MarketSearch({
  query,
  choose,
}: {
  query: string;
  choose: (item: Instrument) => void;
}) {
  const { mode, addDiscovered } = useApp();
  const [result, setResult] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function search() {
    setBusy(true);
    setError('');
    try {
      const response = await discoverInvestments(query);
      setResult(response);
      if (response.results) addDiscovered(response.results);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="market-search">
      <div className="market-search-action">
        <p className="muted text-small">
          Looking for another listing? Search US shares, Xetra ETFs and Danish shares where the free
          provider has coverage.
        </p>
        <button
          className="button secondary"
          onClick={() => void search()}
          disabled={busy || mode === 'demo' || !searchQuerySchema.safeParse(query).success}
        >
          {busy
            ? 'Searching…'
            : result?.status === 'pending' && result.query === query.trim().toLowerCase()
              ? 'Check search results'
              : 'Search markets'}
        </button>
      </div>
      {mode === 'demo' && (
        <p className="text-small muted">
          Market search and history requests are available when signed in.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <div aria-live="polite">
          <p className="text-small">
            {result.status === 'pending'
              ? `“${result.query}” is queued for the next daily data update. Check here afterwards; larger queues can take several updates.`
              : result.status === 'unavailable'
                ? `No supported listing was found for “${result.query}”. Try its ticker or a different spelling.`
                : result.status === 'error'
                  ? 'The search could not finish. The data update will retry it.'
                  : `${result.results?.length ?? 0} supported listing(s) found for “${result.query}”.`}
          </p>
          {result.results?.map((item) => (
            <button key={item.id} className="button secondary" onClick={() => choose(item)}>
              {item.shortName} · {item.ticker} · {item.exchange} · {item.currency}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
