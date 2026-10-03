import { useRef, useState } from 'react';
import {
  Download,
  Upload,
  CheckCircle2,
  Circle,
  Database,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { useApp, friendlyError } from '../lib/store';
import { firebaseConfigured } from '../lib/firebase';
import { emptyWorkspace, demoWorkspace } from '../lib/demo';
import { parseWorkspace } from '../../shared/schema';
import type { Workspace } from '../../shared/schema';
import { PageHeading, Field, Modal, Note } from '../components/ui';
import { download, date } from '../lib/format';

export default function Settings() {
  const { data, mode, update, saving, notify, market } = useApp();
  const [name, setName] = useState(data.name);
  const [restore, setRestore] = useState<Workspace | null>(null);
  const [reset, setReset] = useState(false);
  const [confirm, setConfirm] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  async function read(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Choose a backup smaller than 1 MB.');
      setRestore(parseWorkspace(JSON.parse(await file.text())));
    } catch (err) {
      notify(friendlyError(err));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE THIS SPACE YOURS"
        title="A little housekeeping."
        description="Manage your workspace, keep a backup, and see what’s connected."
      />
      <div className="settings-grid">
        <div>
          <section className="card">
            <h2>Your workspace</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await update((old) => ({ ...old, name: name.trim() })))
                  notify('Workspace name saved.');
              }}
            >
              <Field label="Workspace name">
                <input
                  value={name}
                  maxLength={60}
                  minLength={1}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Investing context">
                <input value="Denmark · personal money after tax · DKK" readOnly />
              </Field>
              <button className="button primary" disabled={saving || name === data.name}>
                Save changes
              </button>
            </form>
          </section>
          <section className="card">
            <div className="section-heading">
              <h2>Your data belongs to you</h2>
              <Database size={20} />
            </div>
            <p>
              Download a complete JSON backup of your plan, holdings, watchlist notes, and learning
              progress. Backups contain financial information, so store them somewhere private.
            </p>
            <div className="button-group">
              <button
                className="button secondary"
                onClick={() =>
                  download(
                    `eazyinvest-backup-${new Date().toISOString().slice(0, 10)}.json`,
                    JSON.stringify(data, null, 2),
                  )
                }
              >
                <Download size={16} />
                Export backup
              </button>
              <button className="button secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={16} />
                Restore backup
              </button>
              <input
                ref={fileRef}
                className="sr-only"
                type="file"
                accept=".json,application/json"
                aria-label="Restore JSON backup"
                onChange={(e) => void read(e.target.files?.[0])}
              />
            </div>
            <Note>
              Restoring a backup replaces this workspace only after you review and confirm it.
              Market data is cached separately and is not part of the backup.
            </Note>
          </section>
          {mode === 'demo' && (
            <section className="card">
              <h2>Start with a clean demo</h2>
              <p>
                Clear the sample holdings, watchlist, and lesson progress while keeping the demo
                available. Nothing here is connected to a brokerage account.
              </p>
              <div className="button-group">
                <button
                  className="button secondary"
                  onClick={() => {
                    setConfirm('');
                    setReset(true);
                  }}
                >
                  Clear demo workspace
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setRestore(demoWorkspace());
                  }}
                >
                  Reload sample workspace
                </button>
              </div>
            </section>
          )}
        </div>
        <aside>
          <section className="card">
            <div className="section-heading">
              <h2>Connection status</h2>
              <ShieldCheck size={20} />
            </div>
            {[
              {
                label: 'Local demo',
                detail:
                  mode === 'demo'
                    ? 'Active · saved in this browser'
                    : 'Available on the sign-in screen',
                ready: mode === 'demo',
              },
              {
                label: 'Firebase',
                detail: firebaseConfigured
                  ? 'Public client configuration present'
                  : 'Connect in the setup stage',
                ready: firebaseConfigured,
              },
              {
                label: 'Private cloud workspace',
                detail:
                  mode === 'cloud'
                    ? 'Signed in · owner access verified'
                    : 'Not connected in demo mode',
                ready: mode === 'cloud',
              },
              {
                label: 'Market data',
                detail:
                  mode === 'cloud' && Object.keys(market).length
                    ? 'Cached provider data available'
                    : mode === 'cloud'
                      ? 'No provider data loaded yet'
                      : 'Generated examples in demo mode',
                ready: mode === 'cloud' && Object.keys(market).length > 0,
              },
            ].map((c) => (
              <div className="connection" key={c.label}>
                {c.ready ? <CheckCircle2 size={19} /> : <Circle size={19} />}
                <div>
                  <strong>{c.label}</strong>
                  <small>{c.detail}</small>
                </div>
              </div>
            ))}
            <p className="text-small muted">
              Your plan and records are separate from market data. Add investments to your
              watchlist, then refresh to request available provider prices.
            </p>
          </section>
          <section className="card">
            <h3>Data freshness</h3>
            {Object.values(market).length ? (
              <ul className="freshness-list">
                {Object.values(market).map((s) => (
                  <li key={s!.instrumentId}>
                    <strong>{s!.instrumentId.toUpperCase()}</strong>
                    <span>
                      {date(s!.points.at(-1)!.date)}
                      <small>{s!.source === 'demo' ? 'Generated example' : s!.source}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No market data is cached yet.</p>
            )}
            <p className="text-small muted">
              A retrieved timestamp is not the same as a market observation date. Check both when
              interpreting a price.
            </p>
          </section>
          <a
            className="settings-source"
            href="https://skat.dk/borger/aktier-og-andre-vaerdipapirer"
            target="_blank"
            rel="noreferrer"
          >
            Official Danish investment tax guidance <ArrowUpRight size={16} />
          </a>
        </aside>
      </div>
      {restore && (
        <Modal title="Replace this workspace?" onClose={() => setRestore(null)}>
          <p>
            You are about to restore <strong>{restore.name}</strong> with{' '}
            {restore.transactions.length} transactions, {restore.watchlist.length} watchlist
            entries, and {restore.completedLessons.length} completed lessons.
          </p>
          <p>
            Your current plan and records will be replaced. Export a backup first if you need to
            keep them.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setRestore(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={saving}
              onClick={async () => {
                if (await update(restore)) {
                  setName(restore.name);
                  setRestore(null);
                  notify('Workspace restored.');
                }
              }}
            >
              Replace workspace
            </button>
          </div>
        </Modal>
      )}
      {reset && (
        <Modal title="Clear your demo workspace?" onClose={() => setReset(false)}>
          <p>
            This removes saved demo holdings, notes, and learning progress from this browser. Export
            a backup first if you want to keep them.
          </p>
          <Field label="Type CLEAR to continue">
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setReset(false)}>
              Cancel
            </button>
            <button
              className="button danger"
              disabled={confirm !== 'CLEAR' || saving}
              onClick={async () => {
                const clean = emptyWorkspace();
                if (await update(clean)) {
                  setName(clean.name);
                  setReset(false);
                  notify('Demo workspace cleared.');
                }
              }}
            >
              Clear demo
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
