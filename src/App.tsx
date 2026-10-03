import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation, Link } from 'react-router-dom';
import {
  BarChart3,
  LayoutDashboard,
  Telescope,
  Wallet,
  BookOpen,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowRight,
  Leaf,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  CircleHelp,
  Landmark,
} from 'lucide-react';
import { useApp, friendlyError } from './lib/store';
import { firebaseConfigured, firebasePartial, login } from './lib/firebase';
import Overview from './pages/Overview';
import Planner from './pages/Planner';
import Explore from './pages/Explore';
import Portfolio from './pages/Portfolio';
import Learn from './pages/Learn';
import Tax from './pages/Tax';
import Settings from './pages/Settings';

const nav = [
  ['/', 'Overview', LayoutDashboard],
  ['/planner', 'Future planner', BarChart3],
  ['/explore', 'Explore investments', Telescope],
  ['/portfolio', 'My portfolio', Wallet],
  ['/learn', 'Learn to invest', BookOpen],
  ['/tax', 'Investing in Denmark', Landmark],
] as const;
function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <BarChart3 size={22} strokeWidth={2.5} />
      </span>
      EazyInvest<span className="brand-dot">.</span>
    </span>
  );
}
function Welcome() {
  const { enterDemo, status, error, reload, leave } = useApp();
  const [pending, setPending] = useState(false);
  const [loginError, setLoginError] = useState('');
  async function signIn() {
    setPending(true);
    setLoginError('');
    try {
      await login();
    } catch (err) {
      setLoginError(friendlyError(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="welcome">
      <header>
        <Brand />
        <span className="welcome-location">Made for your future · Denmark</span>
      </header>
      <main className="welcome-content">
        <div className="welcome-copy">
          <div className="eyebrow">
            <span className="tiny-dot" /> SMALL STEPS. LONG HORIZONS.
          </div>
          <h1>
            A little today.
            <br />
            More <span>possibility</span>
            <br />
            tomorrow.
          </h1>
          <p>
            A calm space to understand investing, explore your options, and build a plan you can
            believe in. In Danish kroner, at your own pace.
          </p>
          {status === 'loading' ? (
            <div className="loading-inline">Opening your workspace…</div>
          ) : status === 'error' ? (
            <div className="error-box" role="alert">
              <p>{error}</p>
              <button className="button" onClick={reload}>
                Retry
              </button>{' '}
              <button className="button" onClick={() => void leave()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="welcome-actions">
              {firebaseConfigured && (
                <button className="button primary" onClick={() => void signIn()} disabled={pending}>
                  {pending ? 'Signing in…' : 'Sign in with Google'}
                  <ArrowRight size={18} />
                </button>
              )}
              <button
                className={`button ${firebaseConfigured ? 'secondary' : 'primary'}`}
                onClick={enterDemo}
              >
                Explore the demo
                <ArrowRight size={18} />
              </button>
              <small>
                {firebaseConfigured
                  ? 'Your private workspace is restricted to the owner account.'
                  : 'No account needed. Sample data stays in this browser.'}
              </small>
            </div>
          )}
          {(loginError || firebasePartial) && (
            <p className="form-error" role="alert">
              {loginError ||
                'Firebase configuration is incomplete. Finish all four public configuration fields before signing in.'}
            </p>
          )}
          <div className="welcome-assurances">
            <span>
              <ShieldCheck size={16} /> Your own space
            </span>
            <span>
              <Landmark size={16} /> Denmark in mind
            </span>
          </div>
        </div>
        <div className="welcome-art">
          <div className="art-label">
            <Leaf size={18} /> Give your future room to grow
          </div>
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="growth-bars">
            {[20, 32, 44, 57, 73, 95].map((h, i) => (
              <div key={h} style={{ height: `${h}%`, opacity: 0.45 + i * 0.1 }} />
            ))}
          </div>
          <div className="art-caption">
            <span>CONSISTENCY OVER TIME</span>
            <strong>
              Small habits.
              <br />
              Lasting potential.
            </strong>
            <ArrowUpRight size={36} />
          </div>
          <span className="art-footnote">An illustration of growth, not a forecast.</span>
        </div>
      </main>
      <footer className="welcome-footer">
        Understand the possibilities. Know the risks. Make your own decisions.
      </footer>
    </div>
  );
}
export default function App() {
  const { data, status, mode, notice, saving, leave } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const location = useLocation();
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const change = () => setIsMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  if (status !== 'ready')
    return (
      <>
        <Welcome />
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </>
    );
  const pageName = nav.find(([path]) => path === location.pathname)?.[1] ?? 'Settings';
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} inert={isMobile && !mobileOpen}>
        <Link
          to="/"
          className="brand-link"
          onClick={() => setMobileOpen(false)}
          aria-label="EazyInvest home"
        >
          <Brand />
        </Link>
        <button
          className="mobile-close icon-button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <div className="workspace-label">YOUR INVESTING SPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end={path === '/'} onClick={() => setMobileOpen(false)}>
              <Icon size={19} />
              <span>{label}</span>
              {path === '/learn' && <span className="nav-new">START HERE</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Leaf size={20} />
            </span>
            <strong>Progress, at your pace.</strong>
            <p>You don’t need to know everything to start learning.</p>
            <Link to="/learn" onClick={() => setMobileOpen(false)}>
              Take your first step <ArrowUpRight size={15} />
            </Link>
          </div>
          <NavLink className="settings-link" to="/settings" onClick={() => setMobileOpen(false)}>
            <SlidersHorizontal size={18} />
            Settings & data
          </NavLink>
          <button className="profile" onClick={() => void leave()} disabled={saving}>
            <span className="avatar">{mode === 'demo' ? 'D' : 'ME'}</span>
            <span>
              <strong>{mode === 'demo' ? 'Demo workspace' : 'Private workspace'}</strong>
              <small>{mode === 'demo' ? 'Saved on this device' : 'Connected to Firebase'}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <div className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>{data.name}</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{pageName}</strong>
          </div>
          <div className="topbar-right">
            <span className="currency-badge">
              <span className="danish-flag" /> DKK
            </span>
            <span className="save-status">
              <span className="tiny-dot" />
              {saving ? 'Saving…' : mode === 'demo' ? 'Local demo' : 'Private'}
            </span>
            <Link to="/learn" className="icon-button" aria-label="Investing help">
              <CircleHelp size={18} />
            </Link>
          </div>
        </div>
        {mode === 'demo' && (
          <div className="demo-banner">
            <span>
              <strong>Demo mode</strong>
              <span className="banner-long">
                {' '}
                · Prices and holdings are illustrative. Your changes stay in this browser.
              </span>
            </span>
            <Link to="/settings">
              Manage demo <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main id="main-content" className="page-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/planner" element={<Planner />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/tax" element={<Tax />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>EazyInvest · Built for the long view.</span>
          <span>Scenarios are estimates. Investments can lose value.</span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
