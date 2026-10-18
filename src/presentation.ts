import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import * as C from "./constants";
import type { VoluteState } from "./game";
import { geometry, danger, radians, type State } from "./simulation";
const images: Record<string, ImageBitmap | OffscreenCanvas> = {};
const systems: Record<string, ParticleSystem> = {};
export const COLORS: Record<C.ChargeId, string> = {
  halide: "#62e4d2",
  sulfur: "#ffd365",
  cobalt: "#74a9ff",
  garnet: "#fb7694",
  olivine: "#beea7c",
};
const brass = "#d4b67d",
  pale = "#e4e9d9",
  muted = "#829c9c";
export async function initializeArt(api: InitApi<VoluteState>) {
  const names = [
    ...C.CHARGE_IDS,
    ...C.MACHINERY_KINDS,
    "injector-base",
    "injector-barrel",
    "intake",
    "plate",
    "cell",
    "pressure",
    ...Array.from({ length: 4 }, (_, i) => `recoil-${i}`),
    ...Array.from({ length: 6 }, (_, i) => `swallow-${i}`),
    ...Array.from({ length: 6 }, (_, i) => `flash-${i}`),
  ];
  await Promise.all([
    ...names.map(async (name) => {
      images[name] = await api.assets.loadImage(`sprites/${name}.png`);
    }),
    ...Object.values(C.CUES).map((name) =>
      api.audio.load(name, `audio/${name}.wav`),
    ),
    ...["extraction", "bore", "intake", "pickup"].map(async (name) => {
      systems[name] = JSON.parse(
        await (await api.assets.load(`effects/${name}.json`)).text(),
      ) as ParticleSystem;
    }),
  ]);
  // Tint the shared authored sheet once, keeping compositing out of live frames.
  if (typeof OffscreenCanvas !== "undefined") {
    for (const charge of C.CHARGE_IDS)
      for (let frame = 0; frame < 6; frame++) {
        const canvas = new OffscreenCanvas(48, 48);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Unable to prepare extraction artwork");
        ctx.drawImage(images[`flash-${frame}`], 0, 0);
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = COLORS[charge];
        ctx.fillRect(0, 0, 48, 48);
        images[`flash-${charge}-${frame}`] = canvas;
      }
  }
}
function image(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  scale = 1,
) {
  const im = images[name];
  if (im)
    ctx.drawImage(
      im,
      Math.round(x - (im.width * scale) / 2),
      Math.round(y - (im.height * scale) / 2),
      im.width * scale,
      im.height * scale,
    );
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 12,
  color = pale,
  align: CanvasTextAlign = "left",
  font = "monospace",
) {
  ctx.font = `${size >= 24 ? "700 " : ""}${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#0b1b23f2";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#4b605c";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  for (const dx of [0, w - 10])
    for (const dy of [0, h - 10]) {
      line(
        ctx,
        x + dx,
        y + dy + (dy ? 10 : 0),
        x + dx + 10,
        y + dy + (dy ? 10 : 0),
        brass,
        2,
      );
    }
}
function channel(ctx: CanvasRenderingContext2D) {
  // The entire route is clipped to a continuous stroke, then tiled in produced metal.
  ctx.save();
  ctx.beginPath();
  C.CHANNEL.forEach((p, i) =>
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
  );
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#061117";
  ctx.lineWidth = 44;
  ctx.stroke();
  ctx.strokeStyle = "#56605a";
  ctx.lineWidth = 39;
  ctx.stroke();
  const pattern = images.plate
    ? ctx.createPattern(images.plate, "repeat")
    : null;
  ctx.strokeStyle = pattern ?? "#20363d";
  ctx.lineWidth = 35;
  ctx.stroke();
  ctx.strokeStyle = "#0f252b";
  ctx.lineWidth = 24;
  ctx.stroke();
  ctx.strokeStyle = "#334b4b";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 9]);
  ctx.stroke();
  ctx.restore();
  for (let s = 380; s < C.PATH_LENGTH - 160; s += 300) {
    const p = geometry(s);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.forward.y, p.forward.x));
    line(ctx, -3, -5, 2, 0, "#657168");
    line(ctx, 2, 0, -3, 5, "#657168");
    ctx.restore();
  }
}
function background(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createRadialGradient(440, 290, 20, 440, 290, 580);
  gradient.addColorStop(0, "#15313a");
  gradient.addColorStop(1, "#09171f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  ctx.strokeStyle = "#29404740";
  ctx.lineWidth = 1;
  for (let x = 0; x < C.FIELD_W; x += 80)
    for (let y = 0; y < C.FIELD_H; y += 80) {
      ctx.strokeRect(x, y, 80, 80);
      ctx.fillStyle = "#47616055";
      ctx.fillRect(x + 5, y + 5, 2, 2);
    }
  // Architectural annotations occupy the spaces between turns of the channel.
  text(ctx, "GEOTHERMAL RECOVERY / PUMP HALL 07", 160, 86, 11, muted);
  text(ctx, "VLT–05   •   CLOSED CIRCUIT", 800, 86, 10, "#5f7d80", "right");
  text(ctx, "01  /  INLET", 26, 83, 9, brass);
  text(ctx, "MINERAL SEPARATION", 252, 195, 10, "#637f7f");
  text(ctx, "INTAKE", 510, 365, 9, "#a88875", "center");
  text(ctx, "RETURN CHANNEL   →", 460, 465, 10, "#5e7778");
  text(ctx, "VOLUTE / INDUSTRIAL SYSTEMS", 26, 528, 9, "#5e7778");
  text(
    ctx,
    "P  PAUSE     X  EXCHANGE     M  SOUND",
    930,
    528,
    9,
    "#7b9391",
    "right",
  );
}
function sightline(ctx: CanvasRenderingContext2D, s: State) {
  const dx = Math.cos(radians(s.aim)),
    dy = Math.sin(radians(s.aim));
  let distance = Math.min(
    dx > 0
      ? (C.FIELD_W - C.INJECTOR_X) / dx
      : dx < 0
        ? -C.INJECTOR_X / dx
        : Infinity,
    dy > 0
      ? (C.FIELD_H - C.INJECTOR_Y) / dy
      : dy < 0
        ? -C.INJECTOR_Y / dy
        : Infinity,
  );
  for (const core of s.cores) {
    const p = geometry(core.s),
      x = p.x - C.INJECTOR_X,
      y = p.y - C.INJECTOR_Y;
    const along = x * dx + y * dy,
      perp = x * x + y * y - along * along;
    if (along >= 0 && perp <= C.CORE_RADIUS ** 2)
      distance = Math.min(
        distance,
        Math.max(0, along - Math.sqrt(C.CORE_RADIUS ** 2 - perp)),
      );
  }
  ctx.save();
  ctx.setLineDash([5, 4]);
  line(
    ctx,
    C.INJECTOR_X,
    C.INJECTOR_Y,
    C.INJECTOR_X + dx * distance,
    C.INJECTOR_Y + dy * distance,
    "#d7f7ba",
    1,
  );
  ctx.restore();
}
function hall(ctx: CanvasRenderingContext2D, s: State) {
  background(ctx);
  channel(ctx);
  for (const c of s.cores) {
    const p = geometry(c.s);
    image(ctx, c.charge, p.x, p.y);
    if (c.mark) image(ctx, c.mark, p.x + 8, p.y - 8);
  }
  const swallowed = s.visuals?.find((v) => v.kind === "intake" && v.age < 0.5);
  image(
    ctx,
    swallowed
      ? `swallow-${Math.min(5, Math.floor(swallowed.age * 12))}`
      : "intake",
    C.CHANNEL[C.CHANNEL.length - 1].x,
    C.CHANNEL[C.CHANNEL.length - 1].y,
  );
  if (s.machinery?.kind === "sightline") sightline(ctx, s);
  // Fine radial ticks reinforce the fixed injector's pivot.
  for (let a = 0; a < 360; a += 30) {
    const r = radians(a);
    line(
      ctx,
      C.INJECTOR_X + Math.cos(r) * 28,
      C.INJECTOR_Y + Math.sin(r) * 28,
      C.INJECTOR_X + Math.cos(r) * 32,
      C.INJECTOR_Y + Math.sin(r) * 32,
      "#68817a",
    );
  }
  image(ctx, "injector-base", C.INJECTOR_X, C.INJECTOR_Y);
  ctx.save();
  ctx.translate(C.INJECTOR_X, C.INJECTOR_Y);
  ctx.rotate(radians(s.aim));
  const shotFrame = Math.min(
    3,
    Math.floor(((C.FIRE_COOLDOWN - s.fireCooldown) / C.FIRE_COOLDOWN) * 4),
  );
  image(
    ctx,
    s.fireCooldown > 0 ? `recoil-${shotFrame}` : "injector-barrel",
    10,
    0,
  );
  ctx.restore();
  if (s.loaded) image(ctx, s.loaded, C.INJECTOR_X, C.INJECTOR_Y);
  for (const p of s.projectiles) {
    ctx.save();
    ctx.shadowColor = COLORS[p.charge];
    ctx.shadowBlur = 12;
    image(ctx, p.charge, p.x, p.y);
    ctx.restore();
  }
  text(ctx, "INJECTOR", C.INJECTOR_X, 382, 9, brass, "center");
  if (danger(s)) {
    ctx.strokeStyle = "#f17959";
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, C.FIELD_W - 6, C.FIELD_H - 6);
    text(ctx, "▲  INTAKE APPROACH", 480, 157, 13, "#ffa278", "center");
  }
}
function effects(ctx: CanvasRenderingContext2D, s: State) {
  for (const [index, event] of (s.visuals ?? []).entries()) {
    if (event.kind === "extraction" && event.age < 0.3) {
      ctx.save();
      ctx.globalAlpha = 1 - event.age / 0.3;
      if (event.charge) {
        ctx.shadowColor = COLORS[event.charge];
        ctx.shadowBlur = 10;
      }
      image(
        ctx,
        `${event.charge && images[`flash-${event.charge}-0`] ? `flash-${event.charge}` : "flash"}-${Math.min(5, Math.floor(event.age * 20))}`,
        event.x,
        event.y,
      );
      ctx.restore();
    }
    const source = systems[event.kind];
    if (!source) continue;
    const system = event.charge
      ? {
          ...source,
          emitters: source.emitters.map((e) => ({
            ...e,
            particle: {
              ...e.particle,
              colorGradient: [
                { at: 0, color: COLORS[event.charge!] },
                { at: 1, color: "#f5f4c9" },
              ],
            },
          })),
        }
      : source;
    // Reconstruct the short-lived visual from its derived event age. No renderer
    // state can affect simulation, pause, reset, or deterministic replays.
    ctx.save();
    ctx.translate(event.x, event.y - 200);
    ctx.scale(200 / ctx.canvas.width, 200 / ctx.canvas.height);
    const player = new ParticleCanvasPlayer(system, ctx, {
      clear: false,
      seed: Math.floor(event.x * 173 + event.y * 31 + index * 997),
      pixelRadius: 2,
    });
    for (let age = 0; age + C.TICK_DT < event.age; age += C.TICK_DT)
      player.simulator.step(C.TICK_DT * 1000);
    player.update(C.TICK_DT);
    ctx.restore();
  }
}
function hud(ctx: CanvasRenderingContext2D, s: State) {
  // All instruments sit in the open bay right of the inner channel.
  panel(ctx, 668, 166, 130, 222);
  text(ctx, "HALL", 680, 185, 9, muted);
  text(
    ctx,
    `${String(s.level).padStart(2, "0")} / 05`,
    786,
    185,
    12,
    brass,
    "right",
  );
  line(ctx, 680, 195, 786, 195, "#364e50");
  text(ctx, "RECOVERED", 680, 212, 9, muted);
  text(ctx, String(s.score).padStart(6, "0"), 680, 235, 23, pale);
  text(ctx, "CELLS", 680, 257, 9, muted);
  for (let i = 0; i < s.cells; i++) image(ctx, "cell", 722 + i * 24, 253);
  image(ctx, "pressure", 690, 283);
  text(ctx, `${Math.round(s.pressure)}%`, 786, 287, 12, brass, "right");
  ctx.fillStyle = "#293e43";
  ctx.fillRect(680, 302, 106, 5);
  ctx.fillStyle = s.pressure > 70 ? "#f28d69" : "#6dbab0";
  ctx.fillRect(680, 302, (106 * s.pressure) / C.PRESSURE_MAX, 5);
  text(ctx, "LOAD", 694, 329, 9, brass, "center");
  text(ctx, "NEXT", 762, 329, 9, muted, "center");
  if (s.loaded) image(ctx, s.loaded, 694, 351);
  if (s.queued) image(ctx, s.queued, 762, 351);
  text(ctx, "↔ X", 729, 356, 12, "#77928b", "center");
  text(ctx, `${s.quotaRemaining} LEFT AT INLET`, 733, 378, 9, muted, "center");
  if (s.machinery) {
    image(ctx, s.machinery.kind, 286, 275);
    text(ctx, s.machinery.kind.toUpperCase(), 301, 279, 10, brass);
    text(ctx, `${s.machinery.remaining.toFixed(1)}s`, 301, 296, 10, muted);
  }
  if (s.chainTimer > 0)
    text(ctx, `CHAIN ×${s.chainStep}`, 320, 365, 13, brass, "center");
  if (s.muted) text(ctx, "SOUND OFF", 860, 465, 9, brass, "center");
}
function title(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#061219b8";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  panel(ctx, 174, 75, 612, 390);
  text(ctx, "GEOTHERMAL RECOVERY DIVISION", 480, 110, 11, brass, "center");
  text(ctx, C.TITLE_TEXT, 480, 194, 78, pale, "center", "Georgia, serif");
  line(ctx, 330, 213, 630, 213, "#6b7969");
  text(ctx, "KEEP THE HALL RUNNING.", 480, 242, 13, brass, "center");
  text(
    ctx,
    "Fire mineral cores into the channel. Match three to extract.",
    480,
    266,
    12,
    "#a7bcba",
    "center",
  );
  text(
    ctx,
    "Build a chain. Claim machinery. Beat the intake.",
    480,
    286,
    12,
    "#a7bcba",
    "center",
  );
  C.CHARGE_IDS.forEach((name, i) => image(ctx, name, 400 + i * 40, 320));
  ctx.fillStyle = "#d4b67d";
  ctx.fillRect(330, 351, 300, 37);
  text(ctx, "ENTER / CLICK TO BEGIN", 480, 375, 13, "#14282c", "center");
  text(
    ctx,
    "MOUSE / ← →  AIM      CLICK / SPACE  FIRE      X  SWAP",
    480,
    414,
    11,
    pale,
    "center",
  );
  text(
    ctx,
    "P / ESC  PAUSE       M  MUTE       `  DIAGNOSTICS",
    480,
    437,
    10,
    muted,
    "center",
  );
  text(
    ctx,
    "FIVE HALLS   /   THREE CELLS   /   ONE CLOSED CIRCUIT",
    480,
    493,
    10,
    brass,
    "center",
  );
}
export function renderHall(s: State, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  hall(ctx, s);
  effects(ctx, s);
  if (s.screen === "title") {
    title(ctx);
    return;
  }
  if (["playing", "paused", "cleared", "setback"].includes(s.screen))
    hud(ctx, s);
  if (s.screen === "playing") return;
  const ending = s.screen === "gameover" || s.screen === "victory";
  const x = ending ? 210 : 250,
    w = ending ? 540 : 370;
  panel(ctx, x, 150, w, 160);
  const heading = {
    paused: "HALL ON HOLD",
    cleared: `HALL ${s.level} CLEARED`,
    setback: "CELL LOST",
    gameover: "PRESSURE WINS",
    victory: "HALL RESTORED",
  }[s.screen];
  text(ctx, heading, x + w / 2, 197, 28, brass, "center", "Georgia, serif");
  const detail =
    s.screen === "paused"
      ? "Take a breath. The channel can wait."
      : s.screen === "setback"
        ? `${s.cells} cells remain. Repressurizing…`
        : s.screen === "victory"
          ? `All ${C.LEVEL_COUNT} halls cleared.  Score ${s.score}`
          : s.screen === "gameover"
            ? `Final score ${s.score}  /  Hall ${s.level}`
            : `Score ${s.score}  /  +${C.CLEAR_SCORE} clean-hall award`;
  text(ctx, detail, x + w / 2, 235, 12, pale, "center");
  text(
    ctx,
    ending
      ? "ENTER / CLICK TO RETURN"
      : s.screen === "paused"
        ? "P / ESC TO RESUME"
        : "PREPARING THE CHANNEL",
    x + w / 2,
    282,
    11,
    muted,
    "center",
  );
}
