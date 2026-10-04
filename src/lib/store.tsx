import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  auth,
  firebaseConfigured,
  onAuthStateChanged,
  loadCloud,
  saveCloud,
  logout,
  fetchMarket,
  fetchQuotes,
  fetchRegistry,
  fetchHistoryRequests,
  requestHistory,
} from './firebase';
import {
  instruments as referenceInstruments,
  getInstrument as resolveInstrument,
  type Instrument,
} from '../../shared/catalog';
import type { HistoryRequest } from '../../shared/discovery';
import { demoWorkspace, emptyWorkspace, demoMarket } from './demo';
import { parseWorkspace } from '../../shared/schema';
import type { Workspace, InstrumentId, MarketSeries } from '../../shared/schema';
import { quoteFromSeries, mergeQuotes, type MarketQuote } from '../../shared/quote';
import { HistoryLoader, type HistoryState } from './history-loader';

type Status = 'loading' | 'signed-out' | 'ready' | 'error';
type AppContextValue = {
  data: Workspace;
  mode: 'demo' | 'cloud';
  status: Status;
  saving: boolean;
  error: string;
  notice: string;
  market: Partial<Record<InstrumentId, MarketSeries>>;
  quotes: Partial<Record<InstrumentId, MarketQuote>>;
  historyStatus: Record<string, HistoryState>;
  ensureHistory: (ids: string[]) => Promise<HistoryState[]>;
  refreshing: boolean;
  instruments: Instrument[];
  getInstrument: (id: string) => Instrument;
  historyRequests: Record<string, HistoryRequest>;
  queueHistory: (id: string) => Promise<void>;
  addDiscovered: (items: Instrument[]) => void;
  enterDemo: () => void;
  leave: () => Promise<void>;
  update: (next: Workspace | ((old: Workspace) => Workspace)) => Promise<boolean>;
  notify: (message: string) => void;
  refreshMarket: (ids?: InstrumentId[]) => Promise<void>;
  reload: () => void;
};
const Context = createContext<AppContextValue | null>(null);
const storageKey = 'eazyinvest.demo.v1';
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const dataRef = useRef(data);
  const revisionRef = useRef(0);
  const busyRef = useRef(false);
  const sessionRef = useRef(0);
  const [mode, setMode] = useState<'demo' | 'cloud'>('cloud');
  const [status, setStatus] = useState<Status>(firebaseConfigured ? 'loading' : 'signed-out');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [market, setMarket] = useState<Partial<Record<InstrumentId, MarketSeries>>>({});
  const [quotes, setQuotes] = useState<Partial<Record<InstrumentId, MarketQuote>>>({});
  const [historyStatus, setHistoryStatus] = useState<Record<string, HistoryState>>({});
  const historyLoaderRef = useRef<HistoryLoader | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [discovered, setDiscovered] = useState<Instrument[]>([]);
  const [historyRequests, setHistoryRequests] = useState<Record<string, HistoryRequest>>({});
  const instruments = [
    ...new Map(
      [...referenceInstruments, ...discovered, ...data.customInstruments].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
  const catalogRef = useRef(instruments);
  catalogRef.current = instruments;
  const ensureHistory = useCallback(
    (ids: string[]) => historyLoaderRef.current?.load(ids) ?? Promise.resolve([]),
    [],
  );
  function replace(next: Workspace) {
    dataRef.current = next;
    setData(next);
  }
  function enterDemo() {
    if (auth?.currentUser) {
      setNotice('Sign out before opening the demo.');
      return;
    }
    sessionRef.current++;
    let next = demoWorkspace();
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) next = parseWorkspace(JSON.parse(stored));
    } catch {
      setNotice(
        'Saved demo could not be read. Sample data was loaded; the original remains in browser storage until you save.',
      );
    }
    replace(next);
    setMode('demo');
    const samples = demoMarket();
    setMarket(samples);
    setQuotes(
      Object.fromEntries(
        Object.values(samples).flatMap((series) => {
          const quote = quoteFromSeries(series);
          return quote ? [[quote.instrumentId, quote]] : [];
        }),
      ),
    );
    historyLoaderRef.current = null;
    setHistoryStatus({});
    setStatus('ready');
    setError('');
  }
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (user) => {
      const session = ++sessionRef.current;
      setMarket({});
      setQuotes({});
      setHistoryStatus({});
      historyLoaderRef.current = null;
      setRefreshing(false);
      setDiscovered([]);
      setHistoryRequests({});
      replace(emptyWorkspace());
      if (!user) {
        setStatus('signed-out');
        return;
      }
      setStatus('loading');
      setMode('cloud');
      try {
        const stored = await loadCloud(user.uid);
        if (session !== sessionRef.current) return;
        replace(stored ? parseWorkspace(stored.data) : emptyWorkspace());
        revisionRef.current = stored?.revision ?? 0;
        historyLoaderRef.current = new HistoryLoader(
          async (id) => {
            const [series, requests] = await Promise.all([
              fetchMarket(id, catalogRef.current),
              fetchHistoryRequests([id]).catch(() => []),
            ]);
            if (session === sessionRef.current)
              setHistoryRequests((old) => ({
                ...old,
                ...Object.fromEntries(requests.map((item) => [item.instrumentId, item])),
              }));
            return series;
          },
          (id, state) => setHistoryStatus((old) => ({ ...old, [id]: state })),
          (series) => setMarket((old) => ({ ...old, [series.instrumentId]: series })),
          () => session === sessionRef.current,
        );
        setStatus('ready');
        setError('');
        try {
          const registry = await fetchRegistry().catch(() => []);
          if (session !== sessionRef.current) return;
          const catalog = [
            ...new Map(
              [...referenceInstruments, ...registry, ...(stored?.data.customInstruments ?? [])].map(
                (item) => [item.id, item],
              ),
            ).values(),
          ];
          if (session === sessionRef.current)
            setDiscovered((old) => [
              ...new Map([...registry, ...old].map((item) => [item.id, item])).values(),
            ]);
          const cached = await fetchQuotes(catalog);
          if (session === sessionRef.current) {
            setQuotes((old) => mergeQuotes(old, cached));
          }
        } catch {
          if (session === sessionRef.current)
            setNotice('Your workspace loaded, but cached market data is unavailable.');
        }
      } catch (err) {
        if (session === sessionRef.current) {
          setStatus('error');
          setError(friendlyError(err));
        }
      }
    });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function update(next: Workspace | ((old: Workspace) => Workspace)) {
    if (busyRef.current) {
      setNotice('A save is still in progress. Try again in a moment.');
      return false;
    }
    busyRef.current = true;
    setSaving(true);
    const session = sessionRef.current;
    try {
      const candidate = typeof next === 'function' ? next(dataRef.current) : next;
      const needed = new Set(
        [
          ...candidate.watchlist,
          ...candidate.transactions,
          ...candidate.strategies.flatMap((s) => s.allocations),
        ].map((item) => item.instrumentId),
      );
      const parsed = parseWorkspace({
        ...candidate,
        customInstruments: [
          ...candidate.customInstruments,
          ...instruments.filter(
            (item) =>
              needed.has(item.id) &&
              !referenceInstruments.some((entry) => entry.id === item.id) &&
              !candidate.customInstruments.some((entry) => entry.id === item.id),
          ),
        ],
      });
      if (mode === 'demo') {
        localStorage.setItem(storageKey, JSON.stringify(parsed));
        replace(parsed);
      } else {
        const stored = await saveCloud(parsed, revisionRef.current);
        if (session === sessionRef.current) {
          revisionRef.current = stored.revision;
          replace(stored.data);
        }
      }
      return true;
    } catch (err) {
      setNotice(friendlyError(err));
      return false;
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }
  async function refreshMarket(
    ids: InstrumentId[] = dataRef.current.watchlist.map((w) => w.instrumentId),
  ) {
    if (mode === 'demo') {
      setNotice(
        'Demo charts use generated examples. Live updates become available after Firebase and the data provider are connected.',
      );
      return;
    }
    if (refreshing) return;
    setRefreshing(true);
    const session = sessionRef.current;
    const unique = [
      ...new Set([...ids, ...dataRef.current.transactions.map((t) => t.instrumentId)]),
    ];
    let failed = 0;
    try {
      const latest = await fetchQuotes(catalogRef.current);
      if (session !== sessionRef.current) return;
      setQuotes((old) => mergeQuotes(old, latest));
      // Refresh only histories that the user has already opened, or selected explicitly.
      const historyIds = ids.filter((id) => historyStatus[id] !== undefined);
      const states = (await historyLoaderRef.current?.load(historyIds, true)) ?? [];
      failed = states.filter((state) => state === 'error').length;
      if (session !== sessionRef.current) return;
      setNotice(
        failed
          ? `${failed} instrument(s) have no available update. Existing data is retained. Check the market-data workflow on GitHub.`
          : unique.length
            ? 'Latest synced market data loaded. Provider updates run separately on GitHub.'
            : 'Add an investment to your watchlist or portfolio first.',
      );
    } catch {
      if (session === sessionRef.current)
        setNotice('Saved prices could not be refreshed. Existing data is retained.');
    } finally {
      if (session === sessionRef.current) setRefreshing(false);
    }
  }
  async function queueHistory(id: string) {
    if (mode === 'demo') {
      setNotice('History requests are available in your signed-in workspace.');
      return;
    }
    const session = sessionRef.current;
    try {
      const request = await requestHistory(id);
      if (session === sessionRef.current) {
        setHistoryRequests((old) => ({ ...old, [id]: request }));
        setNotice('History queued for the next data update.');
      }
    } catch (err) {
      setNotice(friendlyError(err));
    }
  }
  async function leave() {
    sessionRef.current++;
    await logout();
    replace(emptyWorkspace());
    setMarket({});
    setQuotes({});
    setHistoryStatus({});
    historyLoaderRef.current = null;
    setDiscovered([]);
    setHistoryRequests({});
    setStatus('signed-out');
  }
  return (
    <Context.Provider
      value={{
        data,
        mode,
        status,
        saving,
        error,
        notice,
        market,
        quotes,
        historyStatus,
        ensureHistory,
        refreshing,
        instruments,
        getInstrument: (id) => resolveInstrument(id, instruments),
        historyRequests,
        queueHistory,
        addDiscovered: (items) =>
          setDiscovered((old) => [
            ...new Map([...old, ...items].map((item) => [item.id, item])).values(),
          ]),
        enterDemo,
        leave,
        update,
        notify: setNotice,
        refreshMarket,
        reload: () => location.reload(),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('AppProvider is missing');
  return value;
}
export function useHistories(ids: string[]) {
  const { ensureHistory } = useApp();
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (key) void ensureHistory(key.split(','));
  }, [key, ensureHistory]);
}
export function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code?.includes('permission-denied'))
    return 'This account does not have access. The owner allowlist must be configured in Firebase.';
  if (code?.includes('aborted'))
    return 'This workspace changed in another tab. Reload before saving again; your edit was not saved.';
  if (
    code &&
    [
      'auth/invalid-credential',
      'auth/invalid-login-credentials',
      'auth/wrong-password',
      'auth/user-not-found',
      'auth/invalid-email',
    ].includes(code)
  )
    return 'The email or password is incorrect. Please try again.';
  if (code === 'auth/too-many-requests')
    return 'Too many sign-in attempts. Please wait a while before trying again.';
  if (code === 'auth/user-disabled')
    return 'This account is disabled. Contact the workspace owner.';
  if (code?.includes('unavailable') || code?.includes('network'))
    return 'The connection is unavailable. Your change was not saved. Please try again.';
  if (code?.startsWith('auth/')) return 'Could not sign in. Please try again later.';
  if (err instanceof Error && err.name !== 'ZodError') return err.message;
  return 'The data is invalid or could not be saved. Check the values and try again.';
}
