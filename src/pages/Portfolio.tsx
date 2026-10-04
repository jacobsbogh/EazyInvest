import { useRef, useState } from 'react';
import { Plus, Download, Upload, Trash2, RefreshCw } from 'lucide-react';
import { useApp, friendlyError } from '../lib/store';
import type { Transaction, InstrumentId } from '../../shared/schema';
import { transactionSchema, validateLedger } from '../../shared/schema';
import { portfolio } from '../../shared/finance';
import { exportTransactions, importTransactions } from '../lib/csv';
import { PageHeading, Stat, Empty, Modal, Field, Note } from '../components/ui';
import { date, money, number, download } from '../lib/format';

export default function Portfolio() {
  const {
    data,
    market,
    mode,
    update,
    saving,
    notify,
    refreshMarket,
    refreshing,
    instruments,
    getInstrument,
  } = useApp();
  const holdings = portfolio(data.transactions, market);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<Transaction[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function readFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Choose a CSV smaller than 1 MB.');
      setPreview(importTransactions(await file.text(), data.transactions, instruments));
    } catch (err) {
      notify(friendlyError(err));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function remove() {
    if (!deleting) return;
    if (
      await update((old) => ({
        ...old,
        transactions: old.transactions.filter((t) => t.id !== deleting),
      }))
    ) {
      setDeleting(null);
      notify('Transaction removed.');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR MONEY, WITH CONTEXT"
        title="See what you’re building."
        description="Keep a simple record of your investments and understand where your money goes."
        action={
          <button className="button primary" onClick={() => setAdding(true)}>
            <Plus size={17} />
            Add transaction
          </button>
        }
      />
      <div className="stat-grid">
        <Stat
          label="Investment value"
          value={money(holdings.value)}
          detail={mode === 'demo' ? 'At illustrative sample prices' : 'At latest available prices'}
        />
        <Stat
          label="Remaining cost basis"
          value={money(holdings.cost)}
          detail="Purchase costs of units still held"
        />
        <Stat
          label="Total gain / loss"
          value={money(holdings.profit)}
          detail="Includes sales & recorded dividends · before tax"
          accent
        />
        <Stat
          label="Recorded dividends"
          value={money(holdings.dividends)}
          detail="Net of fees entered · before tax"
        />
      </div>
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Your holdings</h2>
            <p>Investment values in DKK, including available FX conversion.</p>
          </div>
          <button
            className="button subtle small"
            disabled={refreshing}
            onClick={() => void refreshMarket()}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            Refresh prices
          </button>
        </div>
        {holdings.rows.filter((p) => p.units > 1e-8).length ? (
          <>
            <div className="allocation-bar">
              {holdings.rows
                .filter((p) => p.units > 0)
                .map((p) => (
                  <span
                    key={p.id}
                    style={{ background: getInstrument(p.id).color, flex: p.cost || 1 }}
                    title={`${getInstrument(p.id).ticker}: ${money(p.cost)} cost basis`}
                  />
                ))}
            </div>
            <p className="text-small muted">Allocation shown by remaining purchase cost.</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Investment</th>
                    <th>Units</th>
                    <th>Cost basis</th>
                    <th>Market value</th>
                    <th>Unrealized gain</th>
                    <th>Price date</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.rows
                    .filter((p) => p.units > 1e-8)
                    .map((p) => {
                      const i = getInstrument(p.id);
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="instrument-cell">
                              <span
                                className="instrument-mark small-mark"
                                style={{ background: i.color }}
                              >
                                {i.ticker.slice(0, 2)}
                              </span>
                              <span>
                                <strong>{i.shortName}</strong>
                                <small>{i.ticker}</small>
                              </span>
                            </div>
                          </td>
                          <td>{number(p.units, 6)}</td>
                          <td>{money(p.cost)}</td>
                          <td>{money(p.value)}</td>
                          <td className={p.value !== null && p.value < p.cost ? 'loss' : 'gain'}>
                            {money(p.value === null ? null : p.value - p.cost)}
                          </td>
                          <td className="muted">{p.quoteDate ? date(p.quoteDate) : 'No quote'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Empty
            title="A clear view starts with your first entry"
            action={
              <button className="button secondary" onClick={() => setAdding(true)}>
                Add a purchase
              </button>
            }
          >
            Record a purchase or import the supported CSV format. The app tracks investments; it
            does not place trades.
          </Empty>
        )}
        <Note>
          {mode === 'demo'
            ? 'Demo prices and FX rates are synthetic and dated; gains shown here are examples.'
            : 'Values use the latest loaded price and FX rate, which may be from different dates. Refresh data to check for newer observations.'}{' '}
          Gains use average purchase cost. This is a tracking ledger, not a Danish tax return or a
          broker cash balance.
        </Note>
      </section>
      <section className="card transactions-card">
        <div className="section-heading">
          <div>
            <h2>Transaction history</h2>
            <p>
              {data.transactions.length} recorded{' '}
              {data.transactions.length === 1 ? 'transaction' : 'transactions'}
            </p>
          </div>
          <div className="button-group">
            <button
              className="button subtle small"
              onClick={() =>
                download(
                  'eazyinvest-transactions.csv',
                  exportTransactions(data.transactions),
                  'text/csv',
                )
              }
            >
              <Download size={15} />
              Export
            </button>
            <button className="button secondary small" onClick={() => fileRef.current?.click()}>
              <Upload size={15} />
              Import CSV
            </button>
            <input
              ref={fileRef}
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              aria-label="Import transactions CSV"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
          </div>
        </div>
        {data.transactions.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Investment</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Unit price</th>
                  <th>FX to DKK</th>
                  <th>Fees (DKK)</th>
                  <th>Note</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...data.transactions]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((tx) => (
                    <tr key={tx.id}>
                      <td>{date(tx.date)}</td>
                      <td>
                        <strong>{getInstrument(tx.instrumentId).ticker}</strong>
                      </td>
                      <td>
                        <span className={`transaction-type ${tx.type}`}>{tx.type}</span>
                      </td>
                      <td>{number(tx.quantity, 6)}</td>
                      <td>
                        {number(tx.price)} {getInstrument(tx.instrumentId).currency}
                      </td>
                      <td>{number(tx.fx, 4)}</td>
                      <td>{money(tx.fees)}</td>
                      <td className="transaction-note" title={tx.note}>
                        {tx.note || '—'}
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Delete ${tx.type} ${getInstrument(tx.instrumentId).ticker} on ${tx.date}`}
                          onClick={() => setDeleting(tx.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-inline">Your transaction history will appear here.</p>
        )}
        <div className="table-footnote">
          CSV uses decimal points and dates in YYYY-MM-DD format.{' '}
          <button
            className="text-button"
            onClick={() =>
              download(
                'eazyinvest-import-template.csv',
                'id,date,instrument,type,quantity,price,fx_to_dkk,fees_dkk,note\n,2025-01-06,vwce,buy,1,100,7.46,29,Replace this example with your trade',
                'text/csv',
              )
            }
          >
            Download template
          </button>
        </div>
      </section>
      {adding && <TransactionForm onClose={() => setAdding(false)} />}
      {deleting && (
        <Modal title="Remove this transaction?" onClose={() => setDeleting(null)}>
          <p>
            This removes the entry from your ledger and recalculates your holdings. Export a backup
            first if you want to keep a copy.
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setDeleting(null)}>
              Keep transaction
            </button>
            <button className="button danger" disabled={saving} onClick={() => void remove()}>
              Remove transaction
            </button>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal title="Review your CSV import" onClose={() => setPreview(null)}>
          <p>
            {preview.length} valid transactions will be added to your existing ledger. Nothing has
            been saved yet.
          </p>
          <div className="table-scroll import-preview">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Investment</th>
                  <th>Type</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>{getInstrument(t.instrumentId).ticker}</td>
                    <td>{t.type}</td>
                    <td>{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={saving}
              onClick={async () => {
                if (
                  await update((old) => ({
                    ...old,
                    transactions: [...old.transactions, ...preview],
                  }))
                ) {
                  notify('Transactions imported.');
                  setPreview(null);
                }
              }}
            >
              Import {preview.length} transactions
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function TransactionForm({ onClose }: { onClose: () => void }) {
  const { update, saving, notify, market, instruments, getInstrument } = useApp();
  const [instrumentId, setInstrument] = useState<InstrumentId>('vwce');
  const [error, setError] = useState('');
  const [type, setType] = useState<Transaction['type']>('buy');
  const item = getInstrument(instrumentId);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fields = new FormData(e.currentTarget);
    try {
      const tx = transactionSchema.parse({
        id: crypto.randomUUID(),
        instrumentId,
        type,
        date: fields.get('date'),
        quantity: Number(fields.get('quantity')),
        price: Number(fields.get('price')),
        fx: Number(fields.get('fx')),
        fees: Number(fields.get('fees')),
        note: fields.get('note'),
      });
      if (
        await update((old) => {
          const transactions = [...old.transactions, tx];
          const problem = validateLedger(transactions);
          if (problem) throw new Error(problem);
          return { ...old, transactions };
        })
      ) {
        notify('Transaction saved.');
        onClose();
      }
    } catch {
      setError('Check the date and numeric fields. Quantity, price, and FX rate must be positive.');
    }
  }
  return (
    <Modal title="Add a transaction" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-row">
          <Field label="Investment">
            <select
              value={instrumentId}
              onChange={(e) => setInstrument(e.target.value as InstrumentId)}
            >
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ticker} · {i.shortName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Transaction type">
            <select value={type} onChange={(e) => setType(e.target.value as Transaction['type'])}>
              <option value="buy">Purchase</option>
              <option value="sell">Sale</option>
              <option value="dividend">Cash dividend</option>
            </select>
          </Field>
        </div>
        <Field label="Trade / payment date">
          <input
            required
            name="date"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <div className="form-row">
          <Field label="Number of units">
            <input
              required
              name="quantity"
              type="number"
              min="0.000001"
              max="10000000"
              step="any"
              placeholder="e.g. 10"
            />
          </Field>
          <Field
            label={`${type === 'dividend' ? 'Dividend per unit' : 'Price per unit'} (${item.currency})`}
          >
            <input
              required
              name="price"
              type="number"
              min="0.000001"
              max="10000000"
              step="any"
              placeholder="e.g. 100"
            />
          </Field>
        </div>
        <div className="form-row">
          <Field
            label={`DKK per 1 ${item.currency}`}
            hint="Use the exchange rate on the transaction date."
          >
            <input
              key={instrumentId}
              required
              name="fx"
              type="number"
              min="0.000001"
              max="100000"
              step="any"
              defaultValue={item.currency === 'DKK' ? 1 : undefined}
              placeholder={market[instrumentId]?.fxToDkk.toString() ?? 'Historical FX rate'}
              readOnly={item.currency === 'DKK'}
            />
          </Field>
          <Field label="Total fees (DKK)">
            <input
              required
              name="fees"
              type="number"
              min="0"
              max="100000000"
              step="any"
              defaultValue="0"
            />
          </Field>
        </div>
        <Field label="Note (optional)">
          <textarea name="note" maxLength={500} rows={2} />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save transaction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
