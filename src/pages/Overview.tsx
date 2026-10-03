import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Plus, Leaf, BookOpen, Target, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/store';
import { PageHeading, Stat, Empty } from '../components/ui';
import { ProjectionChart } from '../components/charts';
import { portfolio, scenarios } from '../../shared/finance';
import { getInstrument } from '../../shared/catalog';
import { money, number, percent } from '../lib/format';

export default function Overview() {
  const { data, market, mode, refreshing, refreshMarket } = useApp();
  const holdings = portfolio(data.transactions, market);
  const projection = scenarios(data.plan);
  const end = projection.at(-1)!;
  const progress = Math.min(100, Math.max(0, ((holdings.value ?? 0) / data.plan.goal) * 100));
  return (
    <>
      <PageHeading
        eyebrow="THE LONG VIEW"
        title="Your future starts here."
        description="A little clarity today. A little more confidence for tomorrow."
        action={
          <Link className="button primary" to="/planner">
            Build your plan <ArrowUpRight size={17} />
          </Link>
        }
      />
      <div className="stat-grid">
        <Stat
          label="Portfolio value"
          value={money(holdings.value)}
          detail={
            mode === 'demo' ? 'Illustrative holdings · sample prices' : 'At latest available prices'
          }
        />
        <Stat
          label="Monthly contribution"
          value={money(data.plan.monthly)}
          detail="Your planned investing habit"
        />
        <Stat
          label={`Potential in ${data.plan.years} years`}
          value={money(end.value)}
          detail={`${data.plan.returnRate}% assumed return · ${data.plan.realTerms ? 'today’s money' : 'future DKK'}`}
          accent
        />
        <Stat
          label="Your learning journey"
          value={
            <>
              {data.completedLessons.length}
              <span className="stat-suffix"> / 6 lessons</span>
            </>
          }
          detail={
            <Link to="/learn">
              Build your investing confidence <ArrowRight size={13} />
            </Link>
          }
        />
      </div>
      <div className="overview-main-grid">
        <section className="card growth-card">
          <div className="section-heading">
            <div>
              <div className="eyebrow">SMALL HABITS, BIGGER POSSIBILITIES</div>
              <h2>Give your money time.</h2>
              <p>Your plan over the next {data.plan.years} years</p>
            </div>
            <Link to="/planner" className="button subtle small">
              Adjust plan <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="chart-headline">
            <strong>{money(end.value)}</strong>
            <span>base scenario after estimated tax</span>
          </div>
          <ProjectionChart plan={data.plan} />
          <div className="chart-legend">
            <span>
              <i className="legend-dot green" /> Base scenario
            </span>
            <span>
              <i className="legend-dot gray" /> Contributions
            </span>
            <span>
              <i className="legend-dash" /> Lower & higher assumptions
            </span>
          </div>
          <div className="chart-caption">
            Scenarios use assumed returns, not predictions.{' '}
            {data.plan.realTerms
              ? 'Values adjusted for assumed inflation.'
              : 'Values are in future DKK.'}{' '}
            {end.cash > 0
              ? `${money(end.cash)} outside the ASK is excluded.`
              : 'Fees and your selected tax model are included.'}
          </div>
        </section>
        <aside className="overview-side">
          <section className="goal-card">
            <div className="section-heading">
              <span className="round-icon">
                <Target size={21} />
              </span>
              <span className="pill">YOUR BIG PICTURE</span>
            </div>
            <h2>Something worth growing towards.</h2>
            <p>Your long-term investment goal</p>
            <strong className="goal-amount">{money(data.plan.goal)}</strong>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Progress toward investment goal"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="goal-progress">
              <span>{number(progress, 1)}% of your goal</span>
              <Leaf size={16} />
            </div>
            <Link to="/planner">
              Shape your goal <ArrowRight size={17} />
            </Link>
          </section>
          <Link to="/learn" className="lesson-teaser">
            <span className="lesson-icon">
              <BookOpen size={22} />
            </span>
            <div>
              <span className="eyebrow">A 3-MINUTE START</span>
              <h3>What is investing, really?</h3>
              <p>Get comfortable with the basics.</p>
            </div>
            <ArrowUpRight size={20} />
          </Link>
        </aside>
      </div>
      <section className="card watch-card">
        <div className="section-heading">
          <div>
            <h2>On your radar</h2>
            <p>A few possibilities to get to know better.</p>
          </div>
          <div className="button-group">
            <button
              className="icon-button"
              onClick={() => void refreshMarket()}
              disabled={refreshing}
              aria-label="Refresh watchlist data"
            >
              <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            </button>
            <Link className="button subtle small" to="/explore">
              <Plus size={15} />
              Explore investments
            </Link>
          </div>
        </div>
        {data.watchlist.length === 0 ? (
          <Empty
            title="Start with a little curiosity"
            action={
              <Link className="button secondary" to="/explore">
                Explore investments
              </Link>
            }
          >
            Save an investment to follow it here.
          </Empty>
        ) : (
          <div className="watch-grid">
            {data.watchlist.map((w) => {
              const item = getInstrument(w.instrumentId);
              const series = market[item.id];
              const first = series?.points[0].close;
              const last = series?.points.at(-1)?.close;
              return (
                <Link to={`/explore?investment=${item.id}`} className="watch-item" key={item.id}>
                  <span className="instrument-mark" style={{ background: item.color }}>
                    {item.ticker.slice(0, 2)}
                  </span>
                  <div>
                    <strong>{item.shortName}</strong>
                    <span>
                      {item.ticker} · {item.kind}
                    </span>
                  </div>
                  <div className="watch-price">
                    <strong>{last ? `${number(last)} ${item.currency}` : 'No data'}</strong>
                    <span>
                      {first && last
                        ? `${percent(last / first - 1)} · ${mode === 'demo' ? 'sample' : 'period'}`
                        : 'Connect data'}{' '}
                      <ArrowUpRight size={12} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <div className="bottom-note">
        <Leaf size={16} />
        <span>
          A good plan gives you room to live today, too. Start with what feels sustainable.
        </span>
      </div>
    </>
  );
}
