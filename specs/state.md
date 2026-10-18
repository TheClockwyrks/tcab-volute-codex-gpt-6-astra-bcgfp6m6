# Volute — Game state

`src/game.ts` declares and exports the state the game is written against. This
section is that declaration: write it into `src/game.ts` exactly as it stands
here. The three aliases `src/constants.ts` already exports are imported and
re-exported rather than declared a second time. The state is a value the engine
holds and every frame replaces, so every field and every array is declared
`readonly`: a frame builds the next state from the current one rather than
writing into it, and every reader is handed the state as
`DeepReadonly<VoluteState>` in any case.

```ts
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
```

## The type aliases

`ScreenName` is the top-level state machine, the seven members of `SCREENS`.
`ChargeId` names the five charges of `CHARGE_IDS`, and `MachineryKind` the four
kinds of `MACHINERY_KINDS`.

## `CoreState`

One core on the channel, in `cores`.

- `charge` — the charge it carries.
- `s` — its arc position, the distance from the inlet walked along `CHANNEL`,
  from `0` to `PATH_LENGTH` (`5000`).
- `mark` — the machinery extracting it grants, and `null` on an unmarked core.

## `SegmentState`

One segment, in `segments`.

- `count` — how many consecutive cores of `cores` the segment covers, at least
  `1`. The counts partition `cores` in order, so they sum to `cores.length` and
  the first segment is the lead segment.
- `hold` — the seconds of recoil hold the segment has left, `0` on a segment
  that advances.

## `ProjectileState`

One projectile, in `projectiles`.

- `charge` — the charge it carries and seats.
- `x`, `y` — its center, in logical units.
- `angle` — the heading it was fired along, in degrees, from `0` up to but not
  including `360`. It flies along that heading at `PROJECTILE_SPEED` (`620`)
  until it strikes or leaves the field.

## `MachineryState`

The timed machinery in force.

- `kind` — `choke`, `backflow`, or `sightline`.
- `remaining` — the seconds it has left, counting down to `0`, at which point
  `machinery` becomes `null`.

## `VoluteState`

The whole of Volute's state. Every field is present from the moment
`initialize` returns, and every one is plain data: numbers, strings, booleans,
`null`, and containers of them, so a scenario is posed by building a state that
differs in the fields posed and read back by reading them.

- `screen` — the screen currently shown.
- `score` — the run's score.
- `level` — the level in play, from `1` to `LEVEL_COUNT` (`5`).
- `cells` — the cells remaining, from `CELLS` (`3`) down to `0`.
- `quotaRemaining` — how many more cores the inlet emits this level. How many
  it has emitted so far this level is the level's `quota` less this value, so
  nothing else counts emissions.
- `pressure` — the pressure, from `PRESSURE_MIN` (`0`) to `PRESSURE_MAX`
  (`100`).
- `chainStep` — the chain step an extraction scores at, at least `1`.
- `chainTimer` — the seconds left before `chainStep` returns to `1`. It is
  `CHAIN_RESET` (`2.0`) on every extraction and falls with the ticks that
  advance play; it is `0` when no extraction stands inside its window.
- `machinery` — the timed machinery in force, and `null` when none is. `bore`
  resolves at once, so it never appears here.
- `cores` — the train, head first, so `s` descends along the list.
- `segments` — the train's segments, the lead segment first.
- `projectiles` — the projectiles, oldest first.
- `loaded` — the charge the injector fires next, and `null` while no level is
  open.
- `queued` — the charge that becomes `loaded` on the next firing, and `null`
  while no level is open.
- `aim` — the direction the injector points, in degrees measured from `+x` and
  increasing toward `+y`, from `0` up to but not including `360`.
- `fireCooldown` — the seconds until the injector may fire again. It is
  `FIRE_COOLDOWN` (`0.18`) on firing and `0` when the injector may fire.
- `interlude` — the seconds left of the interlude the `cleared` and `setback`
  screens hold, and `0` on every other screen.
- `simTime` — the simulation time the run has accumulated, in seconds. Every
  update adds its elapsed time to it, whatever the screen.
- `accumulator` — the frame time waiting for the next whole tick, in seconds,
  at least `0` and below `TICK_DT`. It grows on the screens that advance the
  simulation, and the delta time left unconsumed when the game stops advancing
  is discarded, so it is `0` on the screens that hold still.
- `emission` — whether the inlet emits, and `feed` — whether the train advances.
  Both are `true` in play. They are what the debug surface's `setEmission` and
  `setFeed` set, so a `reset` and a level opening both leave them as they stand.
- `nextEmitted` — the charge posed for the next core the inlet emits, and `null`
  while none is posed. It is what the debug surface's `setNextEmitted` sets, the
  emission that takes it returns it to `null`, and a `reset` returns it to
  `null`.
- `muted` — the game's readable copy of the engine's mute bit, which every
  `update` carries into the state it returns. The engine owns muting, and this
  field is what the debug surface reports.

## The title state

`initialize` and a `reset` build the values below, and leaving a run for the
title restores them. The `gameover` and `victory` screens keep the run that just
ended, since they report its score and level.

| Field | Title value |
| --- | --- |
| `screen` | `title` |
| `score`, `level`, `cells` | `0`, `1`, `CELLS` |
| `quotaRemaining` | level `1`'s `quota` |
| `pressure` | `0` |
| `chainStep`, `chainTimer` | `1`, `0` |
| `machinery` | `null` |
| `cores`, `segments`, `projectiles` | empty |
| `loaded`, `queued` | `null` |
| `aim` | `270` |
| `fireCooldown`, `interlude`, `simTime`, `accumulator` | `0` |
| `emission`, `feed` | unchanged |
| `nextEmitted` | `null` |
| `muted` | unchanged; `false` on a fresh game |

## The contract

The declaration above is what the debug surface reads and poses.

- Keep every field under its declared name, type, and meaning.
- `initialize` builds the whole state in one go, so every field is present by
  the time a frame can observe it, and none of them is optional.
- Fields you add hold derived data you can rebuild from the declared ones. A
  `reset` restores the declared fields to their title values, so those fields
  are the whole of the authoritative state.
- The state handed to `update` is the whole of the game, and the state `update`
  returns is the whole of the next frame. Every value the game carries from one
  frame to the next lives in it. Loaded images, decoded audio, and prepared
  particle systems are the one exception: `initialize` may hold them in a
  module-level table `render` reads, since they are not game state.
- The state is handed over read-only, as `DeepReadonly<VoluteState>`, to
  `update`, to `render`, to every diagnostic source, and to every operation of
  the debug surface. `update` and the surface's poses return a new `VoluteState`
  built from the one they received; `render`, the sources, and `snapshot` return
  no state. The type is what guarantees that rendering changes nothing and that
  nothing but a transition advances the game.
