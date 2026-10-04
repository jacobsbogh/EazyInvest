import type { MarketSeries } from '../../shared/schema';

export type HistoryState = 'loading' | 'ready' | 'missing' | 'error';

/** One in-memory loader per authenticated session; missing caches are remembered. */
export class HistoryLoader {
  private states = new Map<string, HistoryState>();
  private pending = new Map<string, Promise<HistoryState>>();
  constructor(
    private fetch: (id: string) => Promise<MarketSeries | null>,
    private state: (id: string, value: HistoryState) => void,
    private publish: (series: MarketSeries) => void,
    private active: () => boolean,
  ) {}
  async load(ids: string[], force = false): Promise<HistoryState[]> {
    return Promise.all(
      [...new Set(ids)].map((id) => {
        if (!this.active()) return Promise.resolve('error' as const);
        const pending = this.pending.get(id);
        if (pending) return pending;
        const existing = this.states.get(id);
        if (existing && !force) return Promise.resolve(existing);
        this.states.set(id, 'loading');
        this.state(id, 'loading');
        const task = (async (): Promise<HistoryState> => {
          let result: HistoryState;
          try {
            const series = await this.fetch(id);
            result = series ? 'ready' : 'missing';
            if (series && this.active()) this.publish(series);
          } catch {
            result = 'error';
          }
          this.states.set(id, result);
          if (this.active()) this.state(id, result);
          this.pending.delete(id);
          return result;
        })();
        this.pending.set(id, task);
        return task;
      }),
    );
  }
}
