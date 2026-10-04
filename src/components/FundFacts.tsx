import type { Instrument } from '../../shared/catalog';
import { fundFacts, isFundLike, skatSnapshot } from '../../shared/fund-facts';
import { number } from '../lib/format';
export function FundFacts({ item }: { item: Instrument }) {
  const facts = fundFacts(item);
  return (
    <div className="fund-facts">
      <p>
        <strong>ISIN:</strong> {item.isin || 'Not verified'}
      </p>
      {isFundLike(item) && (
        <>
          <p>
            <strong>Annual fund cost:</strong>{' '}
            {facts.cost ? (
              <>
                {number(facts.cost.percent, 2)}% (
                {facts.cost.basis === 'TER' ? 'TER' : 'ongoing charge'}) ·{' '}
                <a href={facts.cost.source} target="_blank" rel="noreferrer">
                  Issuer source
                </a>{' '}
                · checked {facts.cost.checkedAt}
              </>
            ) : (
              'Not verified'
            )}
          </p>
          {facts.incomeTreatment && (
            <p>
              <strong>Income treatment:</strong>{' '}
              {facts.incomeTreatment === 'distributing' ? 'Distributing' : 'Accumulating'}
            </p>
          )}
          {facts.transactionCost && (
            <p>
              <strong>Fund transaction costs:</strong> {number(facts.transactionCost.percent, 2)}%
              per year (issuer estimate) ·{' '}
              <a href={facts.transactionCost.source} target="_blank" rel="noreferrer">
                Cost source
              </a>{' '}
              · checked {facts.transactionCost.checkedAt}
            </p>
          )}
          {facts.entryCost && facts.exitCost && (
            <p>
              <strong>Maximum fund entry / exit charges:</strong>{' '}
              {number(facts.entryCost.percent, 2)}% / {number(facts.exitCost.percent, 2)}% ·{' '}
              <a href={facts.entryCost.source} target="_blank" rel="noreferrer">
                Issuer charges
              </a>{' '}
              · checked {facts.entryCost.checkedAt}
            </p>
          )}
          <p>
            <strong>
              Ordinary-account tax ({facts.taxTreatment.year ?? new Date().getUTCFullYear()}):
            </strong>{' '}
            {facts.taxTreatment.kind === 'equity-realisation-distributions'
              ? 'Share income: gains taxed on sale; distributions taxed when paid.'
              : facts.taxTreatment.kind === 'equity-annual'
                ? 'Share income: gains and losses assessed annually (lager taxation).'
                : 'Classification not verified.'}
            {facts.taxTreatment.source && (
              <>
                {' '}
                ·{' '}
                <a href={facts.taxTreatment.source} target="_blank" rel="noreferrer">
                  Tax classification source
                </a>{' '}
                · checked {facts.taxTreatment.checkedAt}
              </>
            )}
          </p>
          <p>
            <strong>SKAT {skatSnapshot.year} equity-investment-company list:</strong>{' '}
            {facts.taxStatus === 'listed'
              ? 'Exact ISIN match'
              : facts.taxStatus === 'not-found'
                ? 'ISIN not found in the reviewed list'
                : 'Unverified for the current tax year'}
          </p>
          <p className="text-small muted">
            <a href={skatSnapshot.source} target="_blank" rel="noreferrer">
              Official list
            </a>{' '}
            published {skatSnapshot.publishedAt}; reviewed {skatSnapshot.reviewedAt}. Absence does
            not establish another tax classification or account eligibility.{' '}
            <a
              href="https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber"
              target="_blank"
              rel="noreferrer"
            >
              SKAT fund tax rules
            </a>
            .
          </p>
          <p className="text-small muted">
            Fund costs exclude broker and currency-conversion charges. Historical fund returns
            already reflect fund expenses. Ongoing charges exclude separately shown transaction
            costs and entry/exit charges. ASK eligibility and broker availability require separate
            checks.
          </p>
          {facts.incomeTreatment === 'distributing' && (
            <p className="text-small muted">
              Historical adjusted returns assume reinvested distributions before personal tax. The
              future planner does not model distribution tax for an ordinary account.
            </p>
          )}
          {facts.historyNote && (
            <p className="text-small muted">
              {facts.historyNote.text}{' '}
              <a href={facts.historyNote.source} target="_blank" rel="noreferrer">
                Issuer history note
              </a>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
