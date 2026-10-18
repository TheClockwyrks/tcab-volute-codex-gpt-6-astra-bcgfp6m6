/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, type VoluteState } from "./game";
import { debug } from "./debug";
import { fresh, tick, geometry, startLevel, segments } from "./simulation";
import * as C from "./constants";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(`public/${path}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(bytes: ArrayBuffer) {
        expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
        return { duration: bytes.byteLength / 44100 };
      }
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
async function setup() {
  const canvas = createCanvas(C.FIELD_W, C.FIELD_H);
  const events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    game,
    clock: new ConstantClock(1000 * C.TICK_DT),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  const key = (code: string, down = true) => {
    const e = new Event(down ? "keydown" : "keyup");
    Object.assign(e, { code, repeat: false });
    events.dispatchEvent(e);
  };
  return { engine, key };
}
function posed(
  values: readonly (readonly [number, C.ChargeId, C.MachineryKind | null])[],
): VoluteState {
  return debug.poseTrain(
    { ...startLevel(fresh(), 1), emission: false },
    values,
  );
}
function step(s: VoluteState, count: number): VoluteState {
  for (let i = 0; i < count; i++) s = tick(s);
  return s;
}

describe("arc geometry and debug contract", () => {
  it("selects the outgoing leg at vertices and clamps negative positions", () => {
    expect(geometry(-30)).toMatchObject({
      x: 40,
      y: 40,
      forward: { x: 1, y: 0 },
    });
    expect(geometry(880)).toMatchObject({
      x: 920,
      y: 40,
      forward: { x: 0, y: 1 },
    });
    expect(geometry(C.PATH_LENGTH)).toMatchObject({
      x: 480,
      y: 320,
      forward: { x: -1, y: 0 },
    });
  });
  it("resets all run fields and preserves only caller gates and mute", () => {
    const s = debug.reset({
      ...startLevel(fresh(), 4),
      score: 300,
      muted: true,
      emission: false,
      feed: false,
    });
    expect(s).toEqual({
      ...fresh(),
      muted: true,
      emission: false,
      feed: false,
    });
  });
  it("sorts poses stably, derives readings, and leaves inputs untouched", () => {
    const s = fresh();
    const copy = structuredClone(s);
    const p = debug.poseTrain(s, [
      [50, "halide", null],
      [106, "sulfur", null],
      [78, "cobalt", "choke"],
    ]);
    expect(s).toEqual(copy);
    expect(p.segments).toEqual([{ count: 3, hold: 0 }]);
    expect(debug.snapshot(p).train.map((c) => c.s)).toEqual([106, 78, 50]);
    expect(debug.reconcile(debug.reconcile(p))).toEqual(p);
    expect(debug.setAim(p, -450).aim).toBe(270);
    expect(debug.snapshot(debug.setPressure(p, 100)).feedSpeed).toBe(
      C.LEVELS[0].feedSpeed * 2,
    );
  });
  it("rejects invalid domains, including nonfinite and unknown values", () => {
    const s = fresh();
    expect(() => debug.setLevel(s, 0)).toThrow();
    expect(() => debug.setCells(s, 4)).toThrow();
    expect(() => debug.setPressure(s, 101)).toThrow();
    expect(() => debug.setAim(s, NaN)).toThrow();
    expect(() => debug.setScore(s, 1.5)).toThrow();
    expect(() => debug.setScreen(s, "oops" as C.ScreenName)).toThrow();
    expect(() => debug.grantMachinery(s, "bore" as "choke")).toThrow();
    expect(() => debug.setLoaded(s, "oops" as C.ChargeId)).toThrow();
    expect(debug.setQuotaRemaining(s, 999).quotaRemaining).toBe(999);
  });
});
describe("train, pressure, and machinery", () => {
  it("seeds twelve cores, first mark at the tail, quota debited", () => {
    for (let level = 1; level <= C.LEVEL_COUNT; level++) {
      const s = startLevel(fresh(), level);
      expect(s.cores).toHaveLength(C.SEEDED_CORES);
      expect(s.cores[0].s).toBe(C.SEEDED_HEAD_S);
      expect(s.cores[11].mark).toBe("choke");
      expect(s.quotaRemaining).toBe(C.LEVELS[level - 1].quota - C.SEEDED_CORES);
      expect(
        s.cores.every((c) => C.LEVELS[level - 1].charges.includes(c.charge)),
      ).toBe(true);
    }
  });
  it("does not spontaneously extract a posed same-charge run", () => {
    const s = posed([
      [200, "halide", null],
      [172, "halide", null],
      [144, "halide", null],
    ]);
    const n = step(s, 60);
    expect(n.cores).toHaveLength(3);
    expect(n.score).toBe(0);
    expect(n.cores[0].s).toBeCloseTo(222);
  });
  it("clamps a catch-up join and extracts at the incremented chain step", () => {
    const s = posed([
      [200, "halide", null],
      [172, "halide", null],
      [142, "halide", null],
      [80, "cobalt", null],
    ]);
    const n = tick(s);
    expect(n.score).toBe(60);
    expect(n.chainStep).toBe(2);
    expect(n.cores).toHaveLength(1);
    expect(n.cores[0].s).toBe(38);
    expect(n.segments[0].hold).toBe(C.RECOIL_HOLD);
  });
  it("retains original pass ordering after an earlier extraction recoils later segments", () => {
    const s = posed([
      [200, "halide", null],
      [172, "halide", null],
      [142, "halide", null],
      [80, "cobalt", null],
      [20, "sulfur", null],
    ]);
    const n = tick(s);
    expect(n.cores.map((c) => c.s)).toEqual([48, 0]);
    expect(n.segments.every((g) => g.hold === C.RECOIL_HOLD)).toBe(true);
  });
  it("keeps segment holds until their simulation timer expires", () => {
    let s = posed([
      [300, "cobalt", null],
      [200, "sulfur", null],
    ]);
    s = {
      ...s,
      segments: [
        { count: 1, hold: C.RECOIL_HOLD },
        { count: 1, hold: C.RECOIL_HOLD },
      ],
    };
    const n = step(s, 12);
    expect(n.cores.map((c) => c.s)).toEqual([300, 200]);
    expect(step(n, 13).cores[0].s).toBeGreaterThan(300);
  });
  it("packs backflow toward zero and honors the feed gate", () => {
    const s = debug.grantMachinery(
      posed([
        [70, "halide", null],
        [30, "cobalt", null],
        [-8, "sulfur", null],
      ]),
      "backflow",
    );
    const n = step(s, 100);
    expect(n.cores.map((c) => c.s)).toEqual([48, 20, -8]);
    expect(tick(debug.setFeed(s, false)).cores).toEqual(s.cores);
  });
  it("emits posed charges once, cycles marks, and suppresses emission during backflow", () => {
    let s = {
      ...startLevel(fresh(), 1),
      cores: [],
      segments: [],
      quotaRemaining: 22,
      nextEmitted: "garnet" as const,
    };
    const n = tick(s);
    expect(n.cores[0]).toEqual({ s: 0, charge: "garnet", mark: "backflow" });
    expect(n.nextEmitted).toBeNull();
    s = { ...s, emission: false };
    expect(tick(s).cores).toHaveLength(0);
    expect(
      tick(debug.grantMachinery({ ...s, emission: true }, "backflow")).cores,
    ).toHaveLength(0);
  });
  it("scales choke feed and integrates pressure without scaling catch-up", () => {
    const cores = Array.from({ length: 30 }, (_, i) => ({
      s: 1000 - i * C.SPACING,
      charge: "halide" as const,
      mark: null,
    }));
    const s = debug.grantMachinery(
      { ...posed([]), cores, segments: segments(cores), pressure: 50 },
      "choke",
    );
    const n = tick(s);
    expect(n.pressure).toBeCloseTo(50.005);
    expect(n.cores[0].s - s.cores[0].s).toBeCloseTo((22 * 1.5 * 0.4) / 60);
  });
});
describe("projectiles and extraction", () => {
  it("inserts behind on an exact dot-product tie, preserves the head, and scores", () => {
    const s = {
      ...posed([
        [4416, "halide", null],
        [4388, "halide", null],
        [4360, "cobalt", null],
      ]),
      feed: false,
      pressure: 10,
      projectiles: [
        {
          charge: "halide" as const,
          x: 276,
          y: 220 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
        },
      ],
    };
    const before = structuredClone(s);
    const cues: C.CueName[] = [];
    const n = tick(s, (c) => cues.push(c));
    expect(s).toEqual(before);
    expect(n.score).toBe(30);
    expect(n.chainStep).toBe(1);
    expect(cues).toContain("seat");
    expect(cues).toContain("extract-1");
    expect(n.cores).toHaveLength(1);
    expect(n.pressure).toBeLessThan(8);
  });
  it("retains negative insertion positions and drops projectiles outside the field", () => {
    const s = {
      ...posed([[0, "cobalt", null]]),
      feed: false,
      projectiles: [
        {
          x: 40,
          y: 40 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "sulfur" as const,
        },
      ],
    };
    const n = tick(s);
    expect(n.cores.map((c) => c.s)).toEqual([0, -C.SPACING]);
    const out = tick({
      ...s,
      projectiles: [{ x: 959, y: 100, angle: 0, charge: "halide" }],
    });
    expect(out.projectiles).toHaveLength(0);
  });
  it("grants marks in head order, bore scores without granting removed marks", () => {
    const s = {
      ...posed([
        [4416, "halide", "bore"],
        [4388, "halide", "choke"],
        [4360, "cobalt", "sightline"],
        [4332, "sulfur", null],
      ]),
      feed: false,
      projectiles: [
        {
          charge: "halide" as const,
          x: 276,
          y: 220 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
        },
      ],
    };
    const n = tick(s);
    expect(n.machinery?.kind).toBe("choke");
    expect(n.score).toBeGreaterThanOrEqual(40);
    expect(n.chainStep).toBe(1);
    expect(n.chainTimer).toBe(C.CHAIN_RESET);
  });
  it("a debug fire ignores cooldown and screen but does not insert until ticks", () => {
    const s = debug.setAim(debug.setLoaded(fresh(), "sulfur"), 360);
    const n = debug.fire({ ...s, fireCooldown: 100 });
    expect(n.screen).toBe("title");
    expect(n.projectiles).toHaveLength(1);
    expect(n.projectiles[0].charge).toBe("sulfur");
    expect(n.fireCooldown).toBe(C.FIRE_COOLDOWN);
  });
});
describe("engine integration, screens, and cues", () => {
  it("loads genuine assets and exposes readable diagnostics through the engine", async () => {
    const { engine } = await setup();
    expect(engine.debug.version).toBe(C.VOLUTE_DEBUG_VERSION);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(12);
    await engine.advance(1);
    expect(engine.state.simTime).toBeCloseTo(C.TICK_DT);
    expect(engine.state.accumulator).toBe(0);
    engine.destroy();
  });
  it("starts, fires once per edge, denies cooldown fire, swaps, pauses, and mutes", async () => {
    const { engine, key } = await setup();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("playing");
    key("Space");
    await engine.advance(2);
    expect(cues.filter((c) => c === "fire")).toHaveLength(1);
    key("Space", false);
    key("Space");
    await engine.advance(1);
    expect(cues).toContain("denied");
    key("Space", false);
    const queued = engine.state.queued;
    key("KeyX");
    await engine.advance(1);
    expect(engine.state.loaded).toBe(queued);
    key("KeyX", false);
    key("KeyP");
    await engine.advance(1);
    key("KeyP", false);
    const cores = engine.state.cores;
    await engine.advance(20);
    expect(engine.state.cores).toEqual(cores);
    expect(engine.state.accumulator).toBe(0);
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
    engine.destroy();
  });
  it("changes music at danger and stops it when paused", async () => {
    const { engine } = await setup();
    const events: string[] = [];
    engine.events.on("cue:looped", (e) => events.push(`+${e.cue}`));
    engine.events.on("cue:stopped", (e) => events.push(`-${e.cue}`));
    engine.apply((s) => debug.startLevel(s, 1));
    await engine.advance(1);
    engine.apply((s) => debug.poseTrain(s, [[C.DANGER_S, "cobalt", null]]));
    await engine.advance(1);
    engine.apply((s) => debug.pause(s));
    await engine.advance(1);
    expect(events).toEqual([
      "+hall-loop",
      "-hall-loop",
      "+danger-loop",
      "-danger-loop",
    ]);
    engine.destroy();
  });
  it("spends only one cell per tick, restarts, and ends on the last", () => {
    const s = posed([
      [C.INTAKE_S, "halide", null],
      [C.INTAKE_S, "cobalt", null],
    ]);
    const n = tick(s);
    expect(n.cells).toBe(2);
    expect(n.screen).toBe("setback");
    expect(n.cores).toHaveLength(0);
    const restarted = step(n, 120);
    expect(restarted.screen).toBe("playing");
    expect(restarted.cores).toHaveLength(C.SEEDED_CORES);
    expect(tick({ ...s, cells: 1 }).screen).toBe("gameover");
  });
  it("clears levels and awards the final victory on the clearing tick", () => {
    const s = { ...posed([]), quotaRemaining: 0 };
    const n = tick(s);
    expect(n.screen).toBe("cleared");
    expect(n.score).toBe(C.CLEAR_SCORE);
    expect(step(n, 120).level).toBe(2);
    expect(tick({ ...s, level: C.LEVEL_COUNT }).screen).toBe("victory");
  });
  it("produces identical fixed-tick simulation with different frame partitions", async () => {
    const a = await setup(),
      b = await setup();
    const s = posed([
      [1000, "cobalt", null],
      [972, "sulfur", null],
    ]);
    a.engine.apply(() => s);
    b.engine.apply(() => s);
    b.engine.setClock(new ConstantClock(1000 / 30));
    await a.engine.advance(60);
    await b.engine.advance(30);
    expect(a.engine.state.cores).toEqual(b.engine.state.cores);
    expect(a.engine.state.pressure).toBe(b.engine.state.pressure);
    expect(a.engine.state.simTime).toBeCloseTo(b.engine.state.simTime);
    a.engine.destroy();
    b.engine.destroy();
  });
});
