import * as C from "./constants";
import type { DeepReadonly } from "ts-essentials";
import type { CoreState, SegmentState, VoluteState, VisualEvent } from "./game";
export type State = DeepReadonly<VoluteState>;
export type CueSink = (cue: C.CueName) => void;
const silent: CueSink = () => {};
const EPS = 1e-7;
export const normalize = (a: number) => ((a % 360) + 360) % 360;
export const radians = (a: number) => (a * Math.PI) / 180;
export const clampPressure = (n: number) =>
  Math.max(C.PRESSURE_MIN, Math.min(C.PRESSURE_MAX, n));
export function geometry(s: number) {
  let remaining = Math.max(0, Math.min(C.PATH_LENGTH, s));
  for (let i = 0; i < C.CHANNEL.length - 1; i++) {
    const a = C.CHANNEL[i],
      b = C.CHANNEL[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const forward = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    if (remaining < len || i === C.CHANNEL.length - 2)
      return {
        x: a.x + forward.x * remaining,
        y: a.y + forward.y * remaining,
        forward,
      };
    remaining -= len;
  }
  throw new Error("Channel has no legs");
}
export const connected = (a: CoreState, b: CoreState) =>
  Math.abs(a.s - b.s - C.SPACING) < EPS;
export function segments(
  cores: readonly CoreState[],
  holds: readonly number[] = [],
): SegmentState[] {
  const result: SegmentState[] = [];
  cores.forEach((c, i) => {
    if (i && connected(cores[i - 1], c)) {
      const last = result[result.length - 1];
      result[result.length - 1] = { ...last, count: last.count + 1 };
    } else result.push({ count: 1, hold: holds[i] ?? 0 });
  });
  return result;
}
function coreHolds(s: State): number[] {
  return s.segments.flatMap((g) => Array<number>(g.count).fill(g.hold));
}
export const feedSpeed = (s: State) =>
  C.LEVELS[s.level - 1].feedSpeed *
  (1 + s.pressure / C.PRESSURE_MAX) *
  (s.machinery?.kind === "choke" ? C.CHOKE_FEED_MULTIPLIER : 1);
export const danger = (s: State) => (s.cores[0]?.s ?? -Infinity) >= C.DANGER_S;
export function fresh(s?: State): VoluteState {
  return {
    screen: "title",
    score: 0,
    level: 1,
    cells: C.CELLS,
    quotaRemaining: C.LEVELS[0].quota,
    pressure: 0,
    chainStep: 1,
    chainTimer: 0,
    machinery: null,
    cores: [],
    segments: [],
    projectiles: [],
    loaded: null,
    queued: null,
    aim: C.AIM_START,
    fireCooldown: 0,
    interlude: 0,
    simTime: 0,
    accumulator: 0,
    emission: s?.emission ?? true,
    feed: s?.feed ?? true,
    nextEmitted: null,
    muted: s?.muted ?? false,
    visuals: [],
  };
}
export function drawCharge(s: State): C.ChargeId {
  const choices = s.cores.length
    ? [...new Set(s.cores.map((c) => c.charge))]
    : C.LEVELS[s.level - 1].charges;
  return choices[Math.floor(Math.random() * choices.length)];
}
export function markFor(n: number): C.MachineryKind | null {
  return n > 0 && n % C.MARK_INTERVAL === 0
    ? C.MACHINERY_KINDS[(n / C.MARK_INTERVAL - 1) % C.MACHINERY_KINDS.length]
    : null;
}
export function startLevel(s: State, level: number): VoluteState {
  const def = C.LEVELS[level - 1];
  const cores = Array.from({ length: C.SEEDED_CORES }, (_, i) => ({
    s: C.SEEDED_HEAD_S - C.SPACING * i,
    charge: def.charges[Math.floor(Math.random() * def.charges.length)],
    mark: markFor(i + 1),
  }));
  const next: VoluteState = {
    ...s,
    screen: "playing",
    level,
    cores,
    segments: segments(cores),
    projectiles: [],
    quotaRemaining: def.quota - C.SEEDED_CORES,
    pressure: 0,
    chainStep: 1,
    chainTimer: 0,
    machinery: null,
    fireCooldown: 0,
    interlude: 0,
    accumulator: 0,
    visuals: [],
  };
  return { ...next, loaded: drawCharge(next), queued: drawCharge(next) };
}
export function launch(s: State): VoluteState {
  return {
    ...s,
    loaded: s.queued ?? drawCharge(s),
    queued: drawCharge(s),
    fireCooldown: C.FIRE_COOLDOWN,
    projectiles: [
      ...s.projectiles,
      {
        charge: s.loaded ?? drawCharge(s),
        x: C.INJECTOR_X,
        y: C.INJECTOR_Y,
        angle: s.aim,
      },
    ],
  };
}
function visual(s: State, event: Omit<VisualEvent, "age">): VoluteState {
  return { ...s, visuals: [...(s.visuals ?? []), { ...event, age: 0 }] };
}
/** Remove simultaneously, then recoil using the pre-recoil gaps of surviving groups. */
function remove(
  s: State,
  indices: readonly number[],
  identities?: Map<CoreState, number>,
): VoluteState {
  if (!indices.length) return s;
  const removed = new Set(indices),
    front = s.cores[Math.min(...indices)].s;
  const oldHolds = coreHolds(s);
  const survivors = s.cores.filter((_, i) => !removed.has(i));
  const holds = oldHolds.filter((_, i) => !removed.has(i));
  const groups = segments(survivors, holds);
  let offset = 0;
  const cores: CoreState[] = [],
    nextHolds: number[] = [];
  for (const g of groups) {
    const group = survivors.slice(offset, offset + g.count);
    const tail = group[group.length - 1],
      behind = survivors[offset + g.count];
    const trailing = group[0].s < front;
    const room = Math.min(
      tail.s,
      behind ? tail.s - behind.s - C.SPACING : C.RECOIL,
    );
    const moved = trailing ? Math.max(0, Math.min(C.RECOIL, room)) : 0;
    cores.push(
      ...group.map((c) => {
        const next = { ...c, s: c.s - moved };
        const id = identities?.get(c);
        if (id !== undefined) identities?.set(next, id);
        return next;
      }),
    );
    nextHolds.push(...group.map(() => (trailing ? C.RECOIL_HOLD : g.hold)));
    offset += g.count;
  }
  return {
    ...s,
    cores,
    segments: segments(cores, nextHolds),
    pressure: clampPressure(
      s.pressure - indices.length * C.PRESSURE_DROP_PER_CORE,
    ),
    score: s.score + C.SCORE_PER_CORE * indices.length * s.chainStep,
  };
}
interface Grant {
  kind: C.MachineryKind;
  x: number;
  y: number;
}
function extract(
  s: State,
  at: number,
  merge: boolean,
  grants: Grant[],
  cue: CueSink,
  identities?: Map<CoreState, number>,
): VoluteState {
  if (!s.cores[at]) return s;
  let first = at,
    last = at;
  while (
    first > 0 &&
    connected(s.cores[first - 1], s.cores[first]) &&
    s.cores[first - 1].charge === s.cores[at].charge
  )
    first--;
  while (
    last + 1 < s.cores.length &&
    connected(s.cores[last], s.cores[last + 1]) &&
    s.cores[last + 1].charge === s.cores[at].charge
  )
    last++;
  if (last - first + 1 < C.MIN_RUN) return s;
  const step = merge ? s.chainStep + 1 : 1;
  let next: VoluteState = { ...s, chainStep: step, chainTimer: C.CHAIN_RESET };
  for (let i = first; i <= last; i++) {
    const c = s.cores[i],
      p = geometry(c.s);
    next = visual(next, {
      kind: "extraction",
      x: p.x,
      y: p.y,
      charge: c.charge,
    });
    if (c.mark) grants.push({ kind: c.mark, x: p.x, y: p.y });
  }
  cue(C.EXTRACT_CUES[Math.min(step, C.EXTRACT_CUES.length) - 1]);
  return remove(
    next,
    Array.from({ length: last - first + 1 }, (_, i) => first + i),
    identities,
  );
}
function advance(s: State, grants: Grant[], cue: CueSink): VoluteState {
  if (!s.feed) return s;
  if (s.machinery?.kind === "backflow") {
    const cores = [...s.cores];
    for (let i = cores.length - 1; i >= 0; i--) {
      const c = cores[i];
      if (c.s >= 0)
        cores[i] = {
          ...c,
          s: Math.max(
            i === cores.length - 1 ? 0 : cores[i + 1].s + C.SPACING,
            c.s - C.BACKFLOW_SPEED * C.TICK_DT,
          ),
        };
    }
    return { ...s, cores, segments: segments(cores, coreHolds(s)) };
  }
  // Keep original object identities only within this tick to walk its original groups
  // even when a preceding join removes cores or changes segment boundaries.
  let offset = 0;
  const original = s.segments.map((g) => {
    const members = s.cores.slice(offset, offset + g.count);
    offset += g.count;
    return members;
  });
  const identities = new Map<CoreState, number>();
  original.forEach((members, id) =>
    members.forEach((c) => identities.set(c, id)),
  );
  let next: VoluteState = s;
  for (const [id] of original.entries()) {
    const first = next.cores.findIndex((c) => identities.get(c) === id);
    if (first < 0) continue;
    let end = first;
    while (
      end + 1 < next.cores.length &&
      identities.get(next.cores[end + 1]) === id
    )
      end++;
    const holds = coreHolds(next);
    const movement =
      holds[first] > 0
        ? 0
        : (first === 0 ? feedSpeed(next) : C.CATCHUP_SPEED) * C.TICK_DT;
    const gap =
      first > 0
        ? next.cores[first - 1].s - C.SPACING - next.cores[first].s
        : Infinity;
    const joined = first > 0 && movement + EPS >= gap;
    const amount = Math.min(movement, gap);
    const cores = next.cores.map((c, i) => {
      if (i < first || i > end) return c;
      const moved = { ...c, s: c.s + amount };
      identities.set(moved, id);
      return moved;
    });
    if (joined) for (let i = first; i <= end; i++) holds[i] = holds[first - 1];
    next = { ...next, cores, segments: segments(cores, holds) };
    if (joined && cores[first - 1].charge === cores[first].charge)
      next = extract(next, first, true, grants, cue, identities);
  }
  return next;
}
function projectiles(s: State, grants: Grant[], cue: CueSink): VoluteState {
  let next: VoluteState = { ...s, projectiles: [] };
  for (const old of s.projectiles) {
    const a = radians(old.angle),
      p = {
        ...old,
        x: old.x + Math.cos(a) * C.PROJECTILE_SPEED * C.TICK_DT,
        y: old.y + Math.sin(a) * C.PROJECTILE_SPEED * C.TICK_DT,
      };
    if (p.x < 0 || p.x > C.FIELD_W || p.y < 0 || p.y > C.FIELD_H) continue;
    let hit = -1,
      distance = Infinity;
    next.cores.forEach((c, i) => {
      const pos = geometry(c.s),
        d = Math.hypot(pos.x - p.x, pos.y - p.y);
      if (d <= C.STRIKE_DISTANCE && d < distance - EPS) {
        hit = i;
        distance = d;
      }
    });
    if (hit < 0) {
      next = { ...next, projectiles: [...next.projectiles, p] };
      continue;
    }
    const c = next.cores[hit],
      pos = geometry(c.s);
    const ahead =
      (p.x - pos.x) * pos.forward.x + (p.y - pos.y) * pos.forward.y > 0;
    const arc = c.s - (ahead ? 0 : C.SPACING);
    const holds = coreHolds(next);
    const entries = next.cores.map((v, i) => ({
      core: v.s <= arc ? { ...v, s: v.s - C.SPACING } : v,
      hold: holds[i],
    }));
    const inserted: CoreState = { charge: p.charge, s: arc, mark: null };
    entries.push({ core: inserted, hold: holds[hit] ?? 0 });
    entries.sort((a, b) => b.core.s - a.core.s);
    const cores = entries.map((e) => e.core);
    next = {
      ...next,
      cores,
      segments: segments(
        cores,
        entries.map((e) => e.hold),
      ),
    };
    cue(C.CUES.seat);
    next = extract(next, cores.indexOf(inserted), false, grants, cue);
  }
  return next;
}
export function tick(s: State, cue: CueSink = silent): VoluteState {
  const dt = C.TICK_DT;
  if (s.screen === "cleared" || s.screen === "setback") {
    const interlude = Math.max(0, s.interlude - dt);
    return interlude < EPS
      ? startLevel(s, s.level + (s.screen === "cleared" ? 1 : 0))
      : {
          ...s,
          interlude,
          visuals: (s.visuals ?? [])
            .map((v) => ({ ...v, age: v.age + dt }))
            .filter((v) => v.age < 0.8),
        };
  }
  if (s.screen !== "playing") return s;
  const chainTimer = Math.max(0, s.chainTimer - dt);
  let next: VoluteState = {
    ...s,
    chainTimer,
    chainStep: chainTimer < EPS ? 1 : s.chainStep,
    fireCooldown: Math.max(0, s.fireCooldown - dt),
    machinery:
      s.machinery && s.machinery.remaining > dt + EPS
        ? { ...s.machinery, remaining: s.machinery.remaining - dt }
        : null,
    segments: s.segments.map((g) => ({
      ...g,
      hold: g.hold <= dt + EPS ? 0 : g.hold - dt,
    })),
    visuals: (s.visuals ?? [])
      .map((v) => ({ ...v, age: v.age + dt }))
      .filter((v) => v.age < 0.8),
  };
  const grants: Grant[] = [];
  next = advance(next, grants, cue);
  next = projectiles(next, grants, cue);
  for (const g of grants) {
    cue(C.CUES.machinery);
    next = visual(next, { kind: "pickup", x: g.x, y: g.y, charge: null });
    if (g.kind === "bore") {
      next = visual(next, { kind: "bore", x: g.x, y: g.y, charge: null });
      const indices = next.cores.flatMap((c, i) => {
        const p = geometry(c.s);
        return Math.hypot(p.x - g.x, p.y - g.y) <= C.BORE_RADIUS ? [i] : [];
      });
      next = remove(next, indices);
    } else
      next = {
        ...next,
        machinery: { kind: g.kind, remaining: C.MACHINERY_DURATIONS[g.kind] },
      };
  }
  const count = next.cores.length;
  next = {
    ...next,
    pressure: clampPressure(
      next.pressure +
        (Math.max(0, count - C.PRESSURE_FREE) * C.PRESSURE_RISE_PER_CORE -
          (count <= C.PRESSURE_FREE ? C.PRESSURE_BLEED : 0)) *
          dt,
    ),
  };
  if ((next.cores[0]?.s ?? -Infinity) >= C.INTAKE_S) {
    cue(C.CUES.intake);
    cue(C.CUES.cellLost);
    const cells = Math.max(0, next.cells - 1),
      p = geometry(C.INTAKE_S);
    return visual(
      {
        ...next,
        cells,
        screen: cells ? "setback" : "gameover",
        interlude: cells ? C.INTERLUDE : 0,
        cores: [],
        segments: [],
        projectiles: [],
        pressure: 0,
        machinery: null,
        chainStep: 1,
        chainTimer: 0,
        quotaRemaining: C.LEVELS[next.level - 1].quota - C.SEEDED_CORES,
      },
      { kind: "intake", x: p.x, y: p.y, charge: null },
    );
  }
  if (!next.cores.length && next.quotaRemaining === 0) {
    cue(C.CUES.levelClear);
    return {
      ...next,
      score: next.score + C.CLEAR_SCORE,
      screen: next.level === C.LEVEL_COUNT ? "victory" : "cleared",
      interlude: next.level === C.LEVEL_COUNT ? 0 : C.INTERLUDE,
    };
  }
  if (
    next.emission &&
    next.quotaRemaining > 0 &&
    next.machinery?.kind !== "backflow" &&
    (!next.cores.length || next.cores[next.cores.length - 1].s >= C.SPACING)
  ) {
    const cores = [
      ...next.cores,
      {
        s: 0,
        charge: next.nextEmitted ?? drawCharge(next),
        mark: markFor(C.LEVELS[next.level - 1].quota - next.quotaRemaining + 1),
      },
    ];
    next = {
      ...next,
      cores,
      segments: segments(cores, coreHolds(next)),
      quotaRemaining: next.quotaRemaining - 1,
      nextEmitted: null,
    };
  }
  return next;
}
