import { applyOps, handleInput, newItem, type CoreSettings, type EngineContext, type EngineState, type Item, type Outcome } from '../src';

/** Local time. Month is 1-based for readability. 2026-09-30 is a Wednesday. */
export function at(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  return new Date(y, mo - 1, d, h, mi);
}

export const WED_2PM = at(2026, 9, 30, 14, 0);

export function makeCtx(now: Date, settings: Partial<CoreSettings> = {}): EngineContext {
  let n = 0;
  return { now, settings: { defaultDuration: 30, eventAlerts: [15], ...settings }, newId: () => `id${++n}` };
}

export function emptyState(): EngineState {
  return { items: [], series: [], pending: null };
}

export function seed(now: Date, ...items: (Partial<Item> & { title: string })[]): EngineState {
  let n = 0;
  return { items: items.map((f) => newItem({ id: `seed${++n}`, ...f }, now)), series: [], pending: null };
}

/** A tiny session: feeds inputs through handleInput and applies each outcome. */
export class Session {
  state: EngineState;
  last!: Outcome;
  constructor(public ctx: EngineContext, state: EngineState = emptyState()) {
    this.state = state;
  }
  say(text: string): Outcome {
    this.last = handleInput(this.state, text, this.ctx);
    this.state = { ...applyOps(this.state, this.last.ops), pending: this.last.pending };
    return this.last;
  }
  /** Items created by the last outcome. */
  created(): Item[] {
    return this.last.ops.flatMap((o) => (o.op === 'putItem' ? [o.item] : []));
  }
  one(): Item {
    const c = this.created();
    if (c.length !== 1) throw new Error(`expected 1 item, got ${c.length}: ${this.last.message}`);
    return c[0]!;
  }
  find(title: RegExp): Item[] {
    return this.state.items.filter((i) => title.test(i.title));
  }
}
