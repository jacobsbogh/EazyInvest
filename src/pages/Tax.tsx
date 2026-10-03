import { useState } from 'react';
import { ArrowUpRight, Landmark, Calculator } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeading, Field, Note } from '../components/ui';
import { tax2026, askRoom, equityTax } from '../../shared/tax';
import { money } from '../lib/format';

export default function Tax() {
  const [previous, setPrevious] = useState(0);
  const [deposits, setDeposits] = useState(0);
  const [gain, setGain] = useState(50000);
  const [married, setMarried] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="YOUR DANISH STARTING POINT"
        title="Same investment. Different rules."
        description="Understand how account type and tax classification affect what you keep."
        action={<span className="pill">2026 RULES · PERSONAL INVESTING</span>}
      />
      <div className="tax-intro">
        <Landmark size={30} />
        <p>
          These tools illustrate Danish personal investment rules. The right treatment depends on
          the account, the exact investment, and your wider tax situation. Each rule links to its
          official source.
        </p>
      </div>
      <div className="tax-card-grid">
        <section className="card tax-account">
          <div className="eyebrow">AKTIESPAREKONTO</div>
          <strong className="tax-rate">
            17<span>%</span>
          </strong>
          <h2>Annual tax on returns</h2>
          <p>
            Returns are taxed each year, including unrealized gains. The bank normally calculates
            the tax. Losses create a tax offset for future positive ASK returns.
          </p>
          <dl className="detail-list">
            <div>
              <dt>2026 deposit ceiling</dt>
              <dd>{money(tax2026.askLimit)}</dd>
            </div>
            <div>
              <dt>Tax method</dt>
              <dd>Lagerbeskatning</dd>
            </div>
            <div>
              <dt>Who handles tax?</dt>
              <dd>Usually your bank</dd>
            </div>
          </dl>
          <a className="text-link" href={tax2026.askSource} target="_blank" rel="noreferrer">
            SKAT: Aktiesparekonto <ArrowUpRight size={15} />
          </a>
        </section>
        <section className="card tax-account">
          <div className="eyebrow">ORDINARY SHARE INCOME</div>
          <strong className="tax-rate">
            27<span>% / </span>42<span>%</span>
          </strong>
          <h2>A progressive tax rate</h2>
          <p>
            In 2026, the first {money(tax2026.equityThreshold)} of share income is taxed at 27%, and
            the amount above at 42%. Eligible cohabiting spouses can use a combined threshold.
          </p>
          <dl className="detail-list">
            <div>
              <dt>What counts?</dt>
              <dd>Relevant gains & dividends</dd>
            </div>
            <div>
              <dt>Timing</dt>
              <dd>Depends on investment</dd>
            </div>
            <div>
              <dt>Other income matters</dt>
              <dd>Threshold is shared</dd>
            </div>
          </dl>
          <a className="text-link" href={tax2026.equitySource} target="_blank" rel="noreferrer">
            SKAT: Tax on shares <ArrowUpRight size={15} />
          </a>
        </section>
      </div>
      <div className="tax-calculators">
        <section className="card">
          <div className="section-heading">
            <h2>Estimate your ASK deposit room</h2>
            <Calculator size={20} />
          </div>
          <Field label="Account value on 31 December 2025 (DKK)">
            <input
              type="number"
              min="0"
              max="100000000"
              value={previous}
              onChange={(e) => setPrevious(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          <Field
            label="Net deposits during 2026 (DKK)"
            hint="Deposits minus withdrawals. Can be negative."
          >
            <input
              type="number"
              min="-100000000"
              max="100000000"
              value={deposits}
              onChange={(e) => setDeposits(Number(e.target.value))}
            />
          </Field>
          <div className="calculator-result">
            <span>Illustrative remaining deposit room</span>
            <strong>{money(askRoom(previous, deposits))}</strong>
          </div>
          <p className="text-small muted">
            Excludes special deposits to pay ASK tax and account-specific corrections. Growth above
            the ceiling does not itself require a sale. Confirm actual room with your bank.
          </p>
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Estimate tax on share income</h2>
            <Calculator size={20} />
          </div>
          <Field label="Total positive share income in 2026 (DKK)">
            <input
              type="number"
              min="0"
              max="100000000"
              value={gain}
              onChange={(e) => setGain(Math.max(0, Number(e.target.value)))}
            />
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              checked={married}
              onChange={(e) => setMarried(e.target.checked)}
            />
            Use the full combined spouses’ threshold
          </label>
          <div className="calculator-result">
            <span>Illustrative tax before credits</span>
            <strong>{money(equityTax(gain, married))}</strong>
          </div>
          <p className="text-small muted">
            Assumes the entered amount is the total relevant income for the person or couple.
            Excludes losses, foreign tax credits, other adjustments, and ASK income.
          </p>
        </section>
      </div>
      <section className="card">
        <div className="section-heading">
          <div>
            <div className="eyebrow">TWO TERMS YOU’LL SEE OFTEN</div>
            <h2>When is the gain taxed?</h2>
          </div>
        </div>
        <div className="two-column">
          <div>
            <h3>Realisationsbeskatning</h3>
            <p>
              Gains and losses are generally recognized when you sell. Dividends may still be
              taxable as they are paid. Ordinary listed shares outside an ASK are a common example.
            </p>
          </div>
          <div>
            <h3>Lagerbeskatning</h3>
            <p>
              Value changes are measured annually, including investments you still hold. An
              investment company can use annual taxation even if it does not pay out dividends.
            </p>
          </div>
        </div>
        <Note>
          A distributing or accumulating label alone does not determine Danish tax treatment. Verify
          whether the investment is taxed as share income or capital income, and under which method.
        </Note>
        <a className="text-link" href={tax2026.fundSource} target="_blank" rel="noreferrer">
          SKAT: Investment funds and companies <ArrowUpRight size={15} />
        </a>
      </section>
      <section className="positive-list-card">
        <div>
          <div className="eyebrow">CHECK THE EXACT FUND</div>
          <h2>Get familiar with the positivliste.</h2>
          <p>
            SKAT publishes an annual list of equity-based investment companies. Match the fund’s
            ISIN and tax year, not just its name. This app does not automatically certify list
            membership or ASK eligibility.
          </p>
          <a
            className="button secondary"
            href={tax2026.listSource}
            target="_blank"
            rel="noreferrer"
          >
            Open SKAT’s official list <ArrowUpRight size={16} />
          </a>
        </div>
        <Link to="/explore" className="positive-list-link">
          Find an investment’s ISIN <ArrowUpRight size={18} />
        </Link>
      </section>
      <p className="source-line">
        Rules recorded {tax2026.checked}. Calculations use the 2026 snapshot and do not update
        automatically when legislation changes.
      </p>
    </>
  );
}
