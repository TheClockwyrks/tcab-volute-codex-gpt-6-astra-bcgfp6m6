# Volute

An arcade puzzle game in a geothermal pump hall. Fire luminous mineral cores into a winding channel, match three of a charge to extract them, and keep the train away from the intake. Merge extractions build scoring chains. Marked cores grant choke, backflow, bore, or sightline machinery. Clear five halls with three cells.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Serve that directory at a website root or a sub-path. All assets load relative to the page; no backend, external services, or runtime asset-generation tools are required.

## Controls

| Control                       | Action                           |
| ----------------------------- | -------------------------------- |
| Mouse / pen / touch position  | Aim                              |
| Left / right arrows or A / D  | Turn the injector                |
| Click / touch / Space         | Fire                             |
| X                             | Exchange loaded and queued cores |
| Enter / Space / click / touch | Start a run or dismiss an ending |
| P / Escape                    | Pause or resume                  |
| M                             | Mute or unmute                   |
| Backtick                      | Engine diagnostic overlay        |

Touch controls appear automatically on touch input. Core glyphs distinguish the five charges independently of color. Audio unlocks on the first gesture.

## Development and verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The Simple 2D engine owns input, audio, loading, canvas fitting, and the frame loop. The simulation uses fixed 60 Hz ticks and immutable state transitions. `src/game.ts` exports the game, its state contract, and the debug API type; the engine exposes the returned debug surface without installing anything on the page. Tests use the real engine, an in-process canvas, and a constant clock, alongside focused simulation scenarios.

`public/assets/` contains the produced pixel sprites, sixteen animation frames, four live particle systems, thirteen sound effects, and two original sequenced music beds with MIDI files. The source authoring recipe is `tools/produce-assets.py`. It uses `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music` as a one-time development step. Those tools are **not** dependencies of installation or production builds. The committed files are what the game loads and Vite copies unchanged.
