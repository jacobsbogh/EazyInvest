import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  auth,
  firebaseConfigured,
  onAuthStateChanged,
  loadCloud,
  saveCloud,
  logout,
  fetchMarket,
  loadCachedMarket,
} from './firebase';
import { demoWorkspace, emptyWorkspace, demoMarket } from './demo';
import { parseWorkspace } from '../../shared/schema';
import type { Workspace, InstrumentId, MarketSeries } from '../../shared/schema';

type Status = 'loading' | 'signed-out' | 'ready' | 'error';
type AppContextValue = {
  data: Workspace;
  mode: 'demo' | 'cloud';
  status: Status;
  saving: boolean;
  error: string;
  notice: string;
  market: Partial<Record<InstrumentId, MarketSeries>>;
  refreshing: boolean;
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
  const [refreshing, setRefreshing] = useState(false);
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
    setMarket(demoMarket());
    setStatus('ready');
    setError('');
  }
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (user) => {
      const session = ++sessionRef.current;
      setMarket({});
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
        setStatus('ready');
        setError('');
        try {
          const cached = await loadCachedMarket();
          if (session === sessionRef.current)
            setMarket(Object.fromEntries(cached.map((item) => [item.instrumentId, item])));
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
      const parsed = parseWorkspace(typeof next === 'function' ? next(dataRef.current) : next);
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
      for (const id of unique) {
        try {
          const result = await fetchMarket(id);
          if (session === sessionRef.current)
            setMarket((previous) => ({ ...previous, [id]: result }));
        } catch {
          failed++;
        }
      }
      setNotice(
        failed
          ? `${failed} instrument(s) have no available update. Existing data is retained. Check the market-data workflow on GitHub.`
          : unique.length
            ? 'Latest synced market data loaded. Provider updates run separately on GitHub.'
            : 'Add an investment to your watchlist or portfolio first.',
      );
    } finally {
      setRefreshing(false);
    }
  }
  async function leave() {
    sessionRef.current++;
    await logout();
    replace(emptyWorkspace());
    setMarket({});
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
        refreshing,
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
