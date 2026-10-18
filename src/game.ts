import type { ChargeId, MachineryKind, ScreenName } from "./constants";

export type { ChargeId, MachineryKind, ScreenName };

export interface CoreState {
  readonly charge: ChargeId;
  readonly s: number;
  readonly mark: MachineryKind | null;
}

export interface SegmentState {
  readonly count: number;
  readonly hold: number;
}

export interface ProjectileState {
  readonly charge: ChargeId;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface MachineryState {
  readonly kind: MachineryKind;
  readonly remaining: number;
}

export interface VoluteState {
  readonly screen: ScreenName;

  readonly score: number;
  readonly level: number;
  readonly cells: number;
  readonly quotaRemaining: number;

  readonly pressure: number;
  readonly chainStep: number;
  readonly chainTimer: number;
  readonly machinery: MachineryState | null;

  readonly cores: readonly CoreState[];
  readonly segments: readonly SegmentState[];
  readonly projectiles: readonly ProjectileState[];

  readonly loaded: ChargeId | null;
  readonly queued: ChargeId | null;
  readonly aim: number;
  readonly fireCooldown: number;

  readonly interlude: number;
  readonly simTime: number;
  readonly accumulator: number;
  readonly emission: boolean;
  readonly feed: boolean;
  readonly nextEmitted: ChargeId | null;
  readonly muted: boolean;
}

import type { DeepReadonly } from "ts-essentials";
import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  fresh,
  startLevel,
  launch,
  tick,
  normalize,
  danger,
} from "./simulation";
import { debug, type Snapshot } from "./debug";
import { initializeArt, renderHall } from "./presentation";

/** Presentation-only cache of events derived from simulation transitions. */
export interface VisualEvent {
  readonly kind: "extraction" | "bore" | "pickup" | "intake";
  readonly x: number;
  readonly y: number;
  readonly charge: ChargeId | null;
  readonly age: number;
}
export interface VoluteState {
  readonly visuals?: readonly VisualEvent[];
}
type ReadState = DeepReadonly<VoluteState>;
export interface VoluteDebugApi {
  readonly version: number;
  reset(s: ReadState): VoluteState;
  reconcile(s: ReadState): VoluteState;
  snapshot(s: ReadState): Snapshot;
  setScreen(s: ReadState, name: ScreenName): VoluteState;
  setLevel(s: ReadState, level: number): VoluteState;
  setScore(s: ReadState, n: number): VoluteState;
  setCells(s: ReadState, n: number): VoluteState;
  setChainStep(s: ReadState, k: number): VoluteState;
  startLevel(s: ReadState, level: number): VoluteState;
  poseTrain(
    s: ReadState,
    cores: readonly (readonly [number, ChargeId, MachineryKind | null])[],
  ): VoluteState;
  clearTrain(s: ReadState): VoluteState;
  setLoaded(s: ReadState, charge: ChargeId): VoluteState;
  setQueued(s: ReadState, charge: ChargeId): VoluteState;
  setAim(s: ReadState, angleDegrees: number): VoluteState;
  fire(s: ReadState): VoluteState;
  setPressure(s: ReadState, value: number): VoluteState;
  setQuotaRemaining(s: ReadState, n: number): VoluteState;
  setEmission(s: ReadState, enabled: boolean): VoluteState;
  setNextEmitted(s: ReadState, charge: ChargeId | null): VoluteState;
  setFeed(s: ReadState, enabled: boolean): VoluteState;
  grantMachinery(
    s: ReadState,
    kind: Exclude<MachineryKind, "bore">,
  ): VoluteState;
  pause(s: ReadState): VoluteState;
  resume(s: ReadState): VoluteState;
}
export const BACKGROUND = "#0b1b23";
export const game: Game<VoluteState, VoluteDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    await initializeArt(api);
    const readings: Record<
      string,
      (s: ReadState) => string | number | boolean
    > = {
      screen: (s) => s.screen,
      "level / score": (s) => `${s.level} / ${s.score}`,
      cells: (s) => s.cells,
      quota: (s) => s.quotaRemaining,
      "pressure / feed": (s) =>
        `${s.pressure.toFixed(1)} / ${debug.snapshot(s).feedSpeed.toFixed(1)}`,
      chain: (s) => s.chainStep,
      "cores / head": (s) =>
        `${s.cores.length} / ${(s.cores[0]?.s ?? 0).toFixed(1)}`,
      segments: (s) => s.segments.length,
      danger,
      injector: (s) =>
        `${s.loaded} / ${s.queued} / ${s.aim.toFixed(0)}° / ${s.fireCooldown.toFixed(2)}`,
      projectiles: (s) => s.projectiles.length,
      machinery: (s) =>
        s.machinery
          ? `${s.machinery.kind} ${s.machinery.remaining.toFixed(1)}`
          : "none",
    };
    for (const [name, source] of Object.entries(readings))
      api.diagnostics.register(name, source);
    return [fresh(), debug];
  },
  update(state, api, dt) {
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    let s: VoluteState = {
      ...state,
      simTime: state.simTime + dt,
      muted: api.audio.muted(),
    };
    const pointer = api.input.pointer();
    const inside =
      pointer.x >= 0 &&
      pointer.x <= C.FIELD_W &&
      pointer.y >= 0 &&
      pointer.y <= C.FIELD_H;
    const click = api.input.pointerPressed() && inside;
    const confirm = api.input.pressed("confirm") || click;
    const pause = api.input.pressed("pause");
    if (s.screen === "title" && confirm) s = startLevel(s, 1);
    else if ((s.screen === "gameover" || s.screen === "victory") && confirm)
      s = fresh(s);
    else if (s.screen === "playing" && pause) s = { ...s, screen: "paused" };
    else if (s.screen === "paused" && pause) s = { ...s, screen: "playing" };
    else if (s.screen === "playing") {
      if (api.input.pointerSamples().some((p) => p.primary)) {
        const dx = pointer.x - C.INJECTOR_X,
          dy = pointer.y - C.INJECTOR_Y;
        if (dx || dy)
          s = { ...s, aim: normalize((Math.atan2(dy, dx) * 180) / Math.PI) };
      }
      const advanced =
        Math.floor((s.accumulator + dt + 1e-9) / C.TICK_DT) * C.TICK_DT;
      s = {
        ...s,
        aim: normalize(
          s.aim +
            (api.input.value("right") - api.input.value("left")) *
              C.AIM_TURN_RATE *
              advanced,
        ),
      };
      if (api.input.pressed("b")) {
        s = { ...s, loaded: s.queued, queued: s.loaded };
        api.audio.play(C.CUES.swap);
      }
      if (api.input.pressed("a") || click) {
        if (s.fireCooldown > 1e-7) api.audio.play(C.CUES.denied);
        else {
          s = launch(s);
          api.audio.play(C.CUES.fire);
        }
      }
    }
    const advancing = () =>
      s.screen === "playing" ||
      s.screen === "cleared" ||
      s.screen === "setback";
    let accumulator = advancing() ? s.accumulator + dt : 0;
    while (advancing() && accumulator + 1e-9 >= C.TICK_DT) {
      const cues = new Set<C.CueName>();
      s = tick(s, (cue) => cues.add(cue));
      for (const cue of cues) api.audio.play(cue);
      accumulator = Math.max(0, accumulator - C.TICK_DT);
      // Music follows each tick, even when a single frame consumes several ticks.
      const bed =
        s.screen === "playing"
          ? danger(s)
            ? C.CUES.dangerLoop
            : C.CUES.hallLoop
          : null;
      for (const cue of C.LOOPING_CUES) if (cue !== bed) api.audio.stop(cue);
      if (bed) api.audio.loop(bed);
    }
    const bed =
      s.screen === "playing"
        ? danger(s)
          ? C.CUES.dangerLoop
          : C.CUES.hallLoop
        : null;
    for (const cue of C.LOOPING_CUES) if (cue !== bed) api.audio.stop(cue);
    if (bed) api.audio.loop(bed);
    return { ...s, accumulator: advancing() ? accumulator : 0 };
  },
  render: renderHall,
};
