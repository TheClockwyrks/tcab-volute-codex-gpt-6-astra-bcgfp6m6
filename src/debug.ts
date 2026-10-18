import * as C from "./constants";
import type { VoluteDebugApi } from "./game";
import {
  fresh,
  startLevel,
  launch,
  normalize,
  segments,
  geometry,
  feedSpeed,
  danger,
  type State,
} from "./simulation";
function number(
  n: number,
  min = -Infinity,
  max = Infinity,
  integer = false,
): number {
  if (
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new RangeError(`Invalid numeric argument: ${n}`);
  return n;
}
function member<T>(v: T, values: readonly T[]): T {
  if (!values.includes(v)) throw new RangeError(`Unknown value: ${String(v)}`);
  return v;
}
function boolean(v: boolean): boolean {
  if (typeof v !== "boolean") throw new TypeError("Expected boolean");
  return v;
}
function snapshot(s: State) {
  let group = 0;
  return {
    version: C.VOLUTE_DEBUG_VERSION,
    screen: s.screen,
    score: s.score,
    level: s.level,
    cells: s.cells,
    quotaRemaining: s.quotaRemaining,
    emitted: C.LEVELS[s.level - 1].quota - s.quotaRemaining,
    pressure: s.pressure,
    feedSpeed: feedSpeed(s),
    chainStep: s.chainStep,
    chainTimer: s.chainTimer,
    interlude: s.interlude,
    danger: danger(s),
    train: s.cores.map((c, i) => {
      if (i && Math.abs(s.cores[i - 1].s - c.s - C.SPACING) > 1e-7) group++;
      const p = geometry(c.s);
      return { ...c, x: p.x, y: p.y, segment: group };
    }),
    segments: s.segments.map((g) => ({ ...g })),
    injector: {
      aim: s.aim,
      cooldown: s.fireCooldown,
      loaded: s.loaded,
      queued: s.queued,
    },
    projectiles: s.projectiles.map((p) => ({ ...p })),
    machinery: s.machinery ? { ...s.machinery } : null,
    emission: s.emission,
    feed: s.feed,
    nextEmitted: s.nextEmitted,
    muted: s.muted,
    simTime: s.simTime,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;
export const debug: VoluteDebugApi = {
  version: C.VOLUTE_DEBUG_VERSION,
  reset: fresh,
  reconcile: (s) => ({
    ...s,
    segments: segments(
      s.cores,
      s.segments.flatMap((g) => Array<number>(g.count).fill(g.hold)),
    ),
  }),
  snapshot,
  setScreen: (s, screen) => ({ ...s, screen: member(screen, C.SCREENS) }),
  setLevel: (s, level) => ({
    ...s,
    level: number(level, 1, C.LEVEL_COUNT, true),
  }),
  setScore: (s, score) => ({ ...s, score: number(score, 0, Infinity, true) }),
  setCells: (s, cells) => ({ ...s, cells: number(cells, 0, C.CELLS, true) }),
  setChainStep: (s, chainStep) => ({
    ...s,
    chainStep: number(chainStep, 1, Infinity, true),
    chainTimer: C.CHAIN_RESET,
  }),
  startLevel: (s, level) =>
    startLevel(s, number(level, 1, C.LEVEL_COUNT, true)),
  poseTrain: (s, values) => {
    const cores = values
      .map(([arc, charge, mark]) => ({
        s: number(arc, -Infinity, C.PATH_LENGTH),
        charge: member(charge, C.CHARGE_IDS),
        mark: mark === null ? null : member(mark, C.MACHINERY_KINDS),
      }))
      .sort((a, b) => b.s - a.s);
    return { ...s, cores, segments: segments(cores), visuals: [] };
  },
  clearTrain: (s) => ({ ...s, cores: [], segments: [], projectiles: [] }),
  setLoaded: (s, loaded) => ({ ...s, loaded: member(loaded, C.CHARGE_IDS) }),
  setQueued: (s, queued) => ({ ...s, queued: member(queued, C.CHARGE_IDS) }),
  setAim: (s, angle) => ({ ...s, aim: normalize(number(angle)) }),
  fire: launch,
  setPressure: (s, pressure) => ({
    ...s,
    pressure: number(pressure, C.PRESSURE_MIN, C.PRESSURE_MAX),
  }),
  setQuotaRemaining: (s, quotaRemaining) => ({
    ...s,
    quotaRemaining: number(quotaRemaining, 0, Infinity, true),
  }),
  setEmission: (s, emission) => ({ ...s, emission: boolean(emission) }),
  setFeed: (s, feed) => ({ ...s, feed: boolean(feed) }),
  setNextEmitted: (s, nextEmitted) => ({
    ...s,
    nextEmitted:
      nextEmitted === null ? null : member(nextEmitted, C.CHARGE_IDS),
  }),
  grantMachinery: (s, kind) => {
    member(kind, ["choke", "backflow", "sightline"]);
    return {
      ...s,
      machinery: { kind, remaining: C.MACHINERY_DURATIONS[kind] },
    };
  },
  pause: (s) => ({ ...s, screen: "paused" }),
  resume: (s) => ({ ...s, screen: "playing" }),
};
