export const VW = 960;
export const VH = 540;
export const FEET = 452;
export const PW = 28;
export const PH = 70;

const RUN = 255;
const ACCEL = 2400;
const AIR = 1100;
const JUMP_V = -690;
const G_UP = 1600;
const G_DOWN = 3100;
const G_APEX = 880;
const MAX_FALL = 920;

export type TierId = "hand" | "roo" | "derby" | "rider" | "daruma";
export type Style = "hands" | "pogo" | "stilts" | "bike" | "mallet";
export type CastId = "kofi" | "ada";

export const TIER_LABEL: Record<TierId, string> = {
  hand: "Hand Walk",
  roo: "Kangaroo",
  derby: "Bamboo Derby",
  rider: "Super Rider",
  daruma: "Daruma 7",
};

export type Rect = { x: number; y: number; w: number; h: number };
export type Solid = Rect & { kind: "track" | "stone" | "ledge" | "pedestal" };
export type Belt = Rect & { power: number };
export type Hurdle = Rect & { over?: boolean };
export type Pad = { base: Rect; amp: number; speed: number; phase: number; blink?: number };
export type Log = { left: number; right: number; y: number; r: number; speed: number; phase: number };
export type Hammer = { x: number; y: number; len: number; speed: number; phase: number; r: number };
export type Pendulum = { x: number; y: number; len: number; amp: number; speed: number; phase: number; r: number };
export type Daruma = { x: number; y: number; w: number; h: number; speed: number; phase: number };
export type Mark = { x: number; feet: number; name: string; tip: string };

export type Stage = {
  id: TierId;
  label: string;
  style: Style;
  length: number;
  solids: Solid[];
  hurdles: Hurdle[];
  belts: Belt[];
  boosts: Rect[];
  pads: Pad[];
  logs: Log[];
  hammers: Hammer[];
  pendulums: Pendulum[];
  pits: Rect[];
  darumas: Daruma[];
  marks: Mark[];
  button: { x: number; y: number; r: number };
};

export type Body = Rect & { oneWay?: boolean; vx?: number; vy?: number };

export type Input = { left: boolean; right: boolean; jump: boolean; slide: boolean };

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
};

export type Runner = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  stun: number;
  hitCd: number;
  invuln: number;
  facing: 1 | -1;
  rising: boolean;
  squash: number;
  runTime: number;
  supportVx: number;
  supportVy: number;
  h: number;
  lane: -1 | 0 | 1;
  laneZ: number;
  slideT: number;
};

export type Phase = "attract" | "play" | "stamp" | "done";

export type Sim = {
  phase: Phase;
  tier: number;
  stage: Stage;
  cast: CastId;
  runner: Runner;
  broken: boolean[];
  age: number;
  clock: number;
  stageClock: number;
  splits: number[];
  mark: number;
  stamp: number;
  camX: number;
  camY: number;
  shake: number;
  clap: number;
  flash: number;
  deaths: number;
  notes?: string[];
  buffer: number;
  jumpLatch: boolean;
  steerLatch: -1 | 0 | 1;
  particles: Particle[];
  pressed: boolean;
};

export const TIER_IDS: TierId[] = ["hand", "roo", "derby", "rider", "daruma"];

const stageCache = new Map<TierId, Stage>();

function track(x: number, w: number, top: number): Solid {
  return { x, y: top, w, h: 72, kind: "track" };
}

function stone(x: number, w: number, top: number): Solid {
  return { x, y: top, w, h: 28, kind: "stone" };
}

export function stanceHeight(style: Style): number {
  if (style === "hands") return 42;
  if (style === "stilts") return 96;
  if (style === "pogo") return 66;
  return PH;
}

function styleStats(style: Style) {
  if (style === "hands") return { run: 175, accel: 1700, air: 900, jump: -520 };
  if (style === "pogo") return { run: 215, accel: 1900, air: 1400, jump: -700 };
  if (style === "stilts") return { run: 200, accel: 1600, air: 900, jump: -600 };
  if (style === "bike") return { run: 305, accel: 780, air: 460, jump: -540 };
  return { run: 230, accel: 2100, air: 1000, jump: -540 };
}

type Bag = {
  solids: Solid[];
  hurdles: Hurdle[];
  belts: Belt[];
  boosts: Rect[];
  pads: Pad[];
  logs: Log[];
  hammers: Hammer[];
  pendulums: Pendulum[];
  pits: Rect[];
  darumas: Daruma[];
  marks: Mark[];
  x: number;
};

function bag(): Bag {
  return {
    solids: [],
    hurdles: [],
    belts: [],
    boosts: [],
    pads: [],
    logs: [],
    hammers: [],
    pendulums: [],
    pits: [],
    darumas: [],
    marks: [],
    x: 0,
  };
}

function buttonAt(b: Bag, name: string, tip: string, feet = FEET) {
  b.marks.push({ x: b.x, feet, name, tip });
  b.solids.push(track(b.x, 460, feet));
  const buttonX = b.x + 320;
  b.solids.push({ x: buttonX + 26, y: feet - 120, w: 36, h: 120, kind: "pedestal" });
  b.x += 520;
  return { x: buttonX, y: feet - 48, r: 36 };
}

function pack(id: TierId, style: Style, b: Bag, button: { x: number; y: number; r: number }): Stage {
  if (b.marks.length !== 9) throw new Error(`${id} expected 9 obstacles, got ${b.marks.length}`);
  return {
    id,
    label: TIER_LABEL[id],
    style,
    length: b.x,
    solids: b.solids,
    hurdles: b.hurdles,
    belts: b.belts,
    boosts: b.boosts,
    pads: b.pads,
    logs: b.logs,
    hammers: b.hammers,
    pendulums: b.pendulums,
    pits: b.pits,
    darumas: b.darumas,
    marks: b.marks,
    button,
  };
}

function steps(b: Bag, count: number, rise: number, tread: number, gap: number, dir: 1 | -1, startTop: number) {
  let top = startTop;
  for (let i = 0; i < count; i++) {
    b.pits.push({ x: b.x, y: FEET, w: gap, h: 280 });
    b.x += gap;
    top = dir > 0 ? startTop - rise * (i + 1) : startTop + rise * (i + 1);
    b.solids.push({ x: b.x, y: top, w: tread, h: FEET + 100 - top, kind: "ledge" });
    b.x += tread;
  }
  return top;
}

function stones(b: Bag, count: number, w: number, gap: number, top = FEET) {
  for (let i = 0; i < count; i++) {
    b.pits.push({ x: b.x, y: FEET, w: gap, h: 200 });
    b.x += gap;
    b.solids.push(stone(b.x, w, top));
    b.x += w;
  }
}

function handStage(): Stage {
  const b = bag();
  const mark = (name: string, tip: string, feet = FEET) => b.marks.push({ x: b.x, feet, name, tip });

  mark("Stair Climb", "Walk the stairs on your hands");
  b.solids.push(track(b.x, 240, FEET));
  b.x += 240;
  let top = steps(b, 4, 48, 150, 42, 1, FEET);

  mark("Stair Down", "Take the steps back down", top);
  top = steps(b, 4, 48, 150, 42, -1, top);
  b.solids.push(track(b.x, 180, FEET));
  b.x += 180;

  mark("Balance Beam", "Stay on the beam");
  stones(b, 2, 120, 58);
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Second Beam", "Longer beam, same rule");
  stones(b, 1, 200, 68);
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Low Ceiling", "Stay low. A jump hits the bar");
  b.solids.push(track(b.x, 860, FEET));
  for (let i = 0; i < 4; i++) b.hurdles.push({ x: b.x + 160 + i * 170, y: FEET - 84, w: 90, h: 16, over: true });
  b.x += 860;

  mark("Zigzag Beam", "Three short beams");
  stones(b, 3, 110, 56);
  b.solids.push(track(b.x, 150, FEET));
  b.x += 150;

  mark("Steep Stairs", "Higher steps. Commit to the hop");
  b.solids.push(track(b.x, 180, FEET));
  b.x += 180;
  top = steps(b, 3, 58, 160, 46, 1, FEET);
  top = steps(b, 3, 58, 160, 46, -1, top);

  mark("Long Beam", "One beam over the water");
  stones(b, 1, 240, 72);
  b.solids.push(track(b.x, 180, FEET));
  b.x += 180;

  const button = buttonAt(b, "Red Button", "Touch the red button");
  return pack("hand", "hands", b, button);
}

function rooStage(): Stage {
  const b = bag();
  const mark = (name: string, tip: string) => b.marks.push({ x: b.x, feet: FEET, name, tip });

  mark("Checker Tiles", "Hop from tile to tile");
  b.solids.push(track(b.x, 200, FEET));
  b.x += 200;
  stones(b, 5, 150, 62);
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Blink Pads", "The pads vanish. Keep hopping");
  b.solids.push(track(b.x, 140, FEET));
  b.x += 140;
  const blinkStart = b.x;
  for (let i = 0; i < 4; i++) {
    b.pads.push({
      base: { x: b.x, y: FEET, w: 200, h: 16 },
      amp: 0,
      speed: 1.1,
      phase: i * 1.3,
      blink: 1,
    });
    b.x += 200;
    if (i < 3) b.x += 50;
  }
  b.pits.push({ x: blinkStart, y: FEET + 6, w: b.x - blinkStart, h: 200 });
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Falling Stones", "Hop while the stone is up");
  b.solids.push(track(b.x, 780, FEET));
  b.hammers.push({ x: b.x + 280, y: FEET - 170, len: 132, speed: 1.35, phase: 0.4, r: 20 });
  b.hammers.push({ x: b.x + 560, y: FEET - 170, len: 132, speed: 1.5, phase: 2.1, r: 20 });
  b.x += 780;

  mark("Stone Rain", "Two more. Don't wait under them");
  b.solids.push(track(b.x, 820, FEET));
  b.hammers.push({ x: b.x + 250, y: FEET - 180, len: 140, speed: 1.7, phase: 1, r: 22 });
  b.hammers.push({ x: b.x + 520, y: FEET - 180, len: 140, speed: 1.85, phase: 2.6, r: 22 });
  b.x += 820;

  mark("Narrow Bridge", "Short landings");
  b.solids.push(track(b.x, 180, FEET));
  b.x += 180;
  stones(b, 4, 170, 48);
  b.solids.push(track(b.x, 150, FEET));
  b.x += 150;

  mark("Broken Bridge", "Wider water between the stones");
  stones(b, 3, 160, 64);
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Bobbing Pads", "Pads rise and fall. Ride the top");
  b.solids.push(track(b.x, 120, FEET));
  b.x += 120;
  const bobStart = b.x;
  for (let i = 0; i < 3; i++) {
    b.pads.push({
      base: { x: b.x, y: FEET, w: 180, h: 16 },
      amp: 28,
      speed: 1.2,
      phase: i * 0.9,
    });
    b.x += 180;
    if (i < 2) b.x += 56;
  }
  b.pits.push({ x: bobStart, y: FEET + 8, w: b.x - bobStart, h: 210 });
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Last Hop", "One gap, then the finish");
  stones(b, 1, 160, 86);
  b.solids.push(track(b.x, 140, FEET));
  b.x += 140;

  const button = buttonAt(b, "Red Button", "Touch the red button");
  return pack("roo", "pogo", b, button);
}

function derbyStage(): Stage {
  const b = bag();
  const mark = (name: string, tip: string) => b.marks.push({ x: b.x, feet: FEET, name, tip });

  mark("Stilt Steps", "High steps on the bamboo");
  b.solids.push(track(b.x, 220, FEET));
  b.x += 220;
  let top = steps(b, 3, 44, 170, 48, 1, FEET);
  top = steps(b, 3, 44, 170, 48, -1, top);

  mark("Low Gates", "The stilts clear the low bars");
  b.solids.push(track(b.x, 780, FEET));
  for (let i = 0; i < 4; i++) b.hurdles.push({ x: b.x + 150 + i * 150, y: FEET - 30, w: 16, h: 30 });
  b.x += 780;

  mark("Narrow Bamboo", "Small platforms. Don't stall");
  stones(b, 4, 96, 60);
  b.solids.push(track(b.x, 150, FEET));
  b.x += 150;

  mark("Hammer Height", "Duck the hammer with a hop");
  b.solids.push(track(b.x, 860, FEET));
  b.hammers.push({ x: b.x + 320, y: FEET - 150, len: 118, speed: 1.4, phase: 0.6, r: 18 });
  b.hammers.push({ x: b.x + 620, y: FEET - 150, len: 118, speed: 1.55, phase: 2.4, r: 18 });
  b.x += 860;

  mark("Sway Bridge", "The planks rock");
  b.solids.push(track(b.x, 120, FEET));
  b.x += 120;
  const sway = b.x;
  for (let i = 0; i < 3; i++) {
    b.pads.push({
      base: { x: b.x, y: FEET, w: 170, h: 16 },
      amp: 20,
      speed: 1.15,
      phase: i,
    });
    b.x += 170;
    if (i < 2) b.x += 52;
  }
  b.pits.push({ x: sway, y: FEET + 8, w: b.x - sway, h: 200 });
  b.solids.push(track(b.x, 150, FEET));
  b.x += 150;

  mark("Stepping Stones", "Four stones, then shore");
  stones(b, 4, 110, 66);
  b.solids.push(track(b.x, 140, FEET));
  b.x += 140;

  mark("High Hammer", "This one swings lower");
  b.solids.push(track(b.x, 700, FEET));
  b.hammers.push({ x: b.x + 340, y: FEET - 130, len: 108, speed: 1.8, phase: 1.2, r: 20 });
  b.x += 700;

  mark("Final Beam", "Last bamboo over the water");
  stones(b, 1, 200, 70);
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  const button = buttonAt(b, "Red Button", "Touch the red button");
  return pack("derby", "stilts", b, button);
}

function riderStage(): Stage {
  const b = bag();
  const mark = (name: string, tip: string) => b.marks.push({ x: b.x, feet: FEET, name, tip });

  mark("Thin Plank", "Keep your speed. The plank is short");
  b.solids.push(track(b.x, 280, FEET));
  b.x += 280;
  stones(b, 3, 150, 64);
  b.solids.push(track(b.x, 180, FEET));
  b.x += 180;

  mark("Ramp", "Climb the ramp and keep rolling");
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;
  let top = steps(b, 4, 32, 140, 36, 1, FEET);
  b.solids.push(track(b.x, 200, top));
  b.x += 200;
  top = steps(b, 4, 32, 140, 36, -1, top);

  mark("Seesaw", "Ride the plank as it tips");
  b.solids.push(track(b.x, 140, FEET));
  b.x += 140;
  const see = b.x;
  for (let i = 0; i < 3; i++) {
    b.pads.push({
      base: { x: b.x, y: FEET, w: 210, h: 16 },
      amp: 22,
      speed: 1.05,
      phase: i * 1.4,
    });
    b.x += 210;
    if (i < 2) b.x += 48;
  }
  b.pits.push({ x: see, y: FEET + 8, w: b.x - see, h: 200 });
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Skinny Plank", "Don't brake on the plank");
  b.solids.push(track(b.x, 220, FEET));
  b.x += 220;
  stones(b, 3, 170, 52);
  b.solids.push(track(b.x, 160, FEET));
  b.x += 160;

  mark("Steep Ramp", "Steeper. Hold the hop");
  b.solids.push(track(b.x, 180, FEET));
  b.x += 180;
  top = steps(b, 3, 46, 160, 44, 1, FEET);
  top = steps(b, 3, 46, 160, 44, -1, top);

  mark("Rolling Log", "Hop the log. Feet stay on the bike");
  b.solids.push(track(b.x, 760, FEET));
  b.logs.push({ left: b.x + 140, right: b.x + 680, y: FEET - 16, r: 18, speed: 120, phase: 40 });
  b.x += 760;

  mark("Swinging Weight", "Wait until the weight is high");
  b.solids.push(track(b.x, 900, FEET));
  b.pendulums.push({ x: b.x + 300, y: 80, len: FEET - 80 - 30, amp: 0.85, speed: 1.25, phase: 0.4, r: 20 });
  b.pendulums.push({ x: b.x + 620, y: 80, len: FEET - 80 - 30, amp: 0.85, speed: 1.4, phase: 2.2, r: 20 });
  b.x += 900;

  mark("Launch Gap", "The gold strip throws you across");
  b.solids.push(track(b.x, 520, FEET));
  b.belts.push({ x: b.x, y: FEET - 4, w: 520, h: 16, power: 40 });
  b.boosts.push({ x: b.x + 460, y: FEET - 6, w: 52, h: 14 });
  b.pits.push({ x: b.x + 520, y: FEET, w: 78, h: 190 });
  b.x += 598;
  b.solids.push(track(b.x, 200, FEET));
  b.x += 200;

  const button = buttonAt(b, "Red Button", "Touch the red button");
  return pack("rider", "bike", b, button);
}

function darumaStage(): Stage {
  const b = bag();
  const mark = (name: string, tip: string) => b.marks.push({ x: b.x, feet: FEET, name, tip });

  mark("The Walk-Up", "The mallet comes out at the stack");
  b.solids.push(track(b.x, 640, FEET));
  b.x += 640;

  for (let i = 0; i < 7; i++) {
    mark(`Block ${i + 1}`, "Jump when the bottom block flashes");
    b.solids.push(track(b.x, 340, FEET));
    b.darumas.push({
      x: b.x + 230,
      y: FEET - 250,
      w: 34,
      h: 340,
      speed: 2.1 + (i % 3) * 0.15,
      phase: i * 0.85,
    });
    b.x += 340;
  }

  const button = buttonAt(b, "Red Button", "Touch the red button");
  return pack("daruma", "mallet", b, button);
}

function makeStage(id: TierId): Stage {
  if (id === "hand") return handStage();
  if (id === "roo") return rooStage();
  if (id === "derby") return derbyStage();
  if (id === "rider") return riderStage();
  return darumaStage();
}

export function buildStage(id: TierId): Stage {
  const cached = stageCache.get(id);
  if (cached) return cached;
  const stage = makeStage(id);
  stageCache.set(id, stage);
  return stage;
}

/**
 * Fastest time a stage can physically be cleared: the straight-line distance
 * from the start line to the button at the style's top run speed. The 0.85
 * factor leaves room for boost pads (500 px/s) and rounding, so honest runs
 * never trip it while faked times well under real play are rejected.
 */
export function stageMinMs(id: TierId): number {
  const stage = buildStage(id);
  const startX = (stage.marks[0]?.x ?? 0) + 120;
  const distance = Math.max(0, stage.button.x - startX);
  const top = styleStats(stage.style).run;
  return Math.round((distance / top) * 0.85 * 1000);
}

export function playerRect(r: Pick<Runner, "x" | "y" | "h">): Rect {
  return { x: r.x - PW / 2, y: r.y - r.h, w: PW, h: r.h };
}

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function hammerTip(h: Hammer, age: number): { x: number; y: number } {
  const a = age * h.speed + h.phase;
  return { x: h.x + Math.sin(a) * h.len, y: h.y + Math.cos(a) * h.len };
}

export function pendBob(p: Pendulum, age: number): { x: number; y: number } {
  const a = Math.sin(age * p.speed + p.phase) * p.amp;
  return { x: p.x + Math.sin(a) * p.len, y: p.y + Math.cos(a) * p.len };
}

export function logCenter(log: Log, age: number): { x: number; y: number } {
  const span = Math.max(1, log.right - log.left);
  const t = (((age * log.speed + log.phase) % span) + span) % span;
  return { x: log.right - t, y: log.y };
}

export function darumaOpen(d: Daruma, age: number): boolean {
  return Math.sin(age * d.speed + d.phase) > 0.02;
}

export function padRect(pad: Pad, age: number, rider?: { x: number; y: number }): Body {
  const theta = age * pad.speed + pad.phase;
  const s = Math.sin(theta);
  const standing =
    !!rider &&
    rider.x >= pad.base.x - 6 &&
    rider.x <= pad.base.x + pad.base.w + 6 &&
    rider.y >= pad.base.y - 20 &&
    rider.y <= pad.base.y + 12;
  if (pad.blink && s < -0.45 && !standing) {
    return { x: pad.base.x, y: FEET + 900, w: pad.base.w, h: pad.base.h, oneWay: true, vx: 0, vy: 0 };
  }
  const lift = Math.abs(s) * pad.amp;
  const sign = s >= 0 ? 1 : -1;
  const rising = Math.cos(theta) * sign * pad.speed * pad.amp;
  return {
    x: pad.base.x,
    y: pad.base.y - lift,
    w: pad.base.w,
    h: pad.base.h,
    oneWay: true,
    vx: 0,
    vy: -rising,
  };
}

export function bodiesAt(
  stage: Stage,
  age: number,
  broken: boolean[] = [],
  rider?: { x: number; y: number; laneZ?: number },
): Body[] {
  const lane = rider?.laneZ ?? 0;
  const list: Body[] = [];
  for (const solid of stage.solids) {
    if (solid.kind === "stone" && Math.abs(lane) > 0.62) continue;
    list.push({ x: solid.x, y: solid.y, w: solid.w, h: solid.h });
  }
  for (const pad of stage.pads) list.push(padRect(pad, age, rider));
  for (let i = 0; i < stage.darumas.length; i++) {
    if (broken[i]) continue;
    const d = stage.darumas[i];
    if (d) list.push({ x: d.x, y: d.y, w: d.w, h: d.h });
  }
  return list;
}

function burst(sim: Sim, x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 50 + Math.random() * 140;
    sim.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 60,
      life: 0.35 + Math.random() * 0.35,
      max: 0.7,
      color,
      r: 2 + (i % 3),
    });
  }
  if (sim.particles.length > 70) sim.particles.splice(0, sim.particles.length - 70);
}

function makeRunner(x: number, y: number, h: number): Runner {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    grounded: true,
    coyote: 0.12,
    stun: 0,
    hitCd: 0,
    invuln: 0,
    facing: 1,
    rising: false,
    squash: 0,
    runTime: 0,
    supportVx: 0,
    supportVy: 0,
    h,
    lane: 0,
    laneZ: 0,
    slideT: 0,
  };
}

export function createSim(tier = 0, cast: CastId = "kofi"): Sim {
  const id = TIER_IDS[tier] ?? "hand";
  const stage = buildStage(id);
  const start = stage.marks[0];
  const runner = makeRunner((start?.x ?? 0) + 120, start?.feet ?? FEET, stanceHeight(stage.style));
  const camX = clamp(runner.x - 340, 0, Math.max(0, stage.length - VW));
  return {
    phase: "play",
    tier,
    stage,
    cast,
    runner,
    broken: stage.darumas.map(() => false),
    age: 0,
    clock: 0,
    stageClock: 0,
    splits: [],
    mark: 0,
    stamp: 0,
    camX,
    camY: runner.y - 390,
    shake: 0,
    clap: 0.2,
    flash: 0,
    deaths: 0,
    buffer: 0,
    jumpLatch: false,
    steerLatch: 0,
    particles: [],
    pressed: false,
  };
}

export function createAttract(cast: CastId = "kofi"): Sim {
  const sim = createSim(0, cast);
  sim.phase = "attract";
  sim.runner.x = 140;
  sim.runner.y = FEET;
  sim.camX = 40;
  sim.camY = FEET - 400;
  return sim;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function chestRect(r: Pick<Runner, "x" | "y" | "h">): Rect {
  return { x: r.x - 11, y: r.y - r.h + 2, w: 22, h: Math.max(16, r.h - 20) };
}

function supportBody(r: Runner, bodies: Body[]): Body | null {
  let best: Body | null = null;
  const left = r.x - PW / 2 + 4;
  const right = r.x + PW / 2 - 4;
  for (const b of bodies) {
    if (right < b.x || left > b.x + b.w) continue;
    const dy = b.y - r.y;
    if (dy < -2 || dy > 8) continue;
    if (!best || b.y < best.y) best = b;
  }
  return best;
}

function circleHits(rect: Rect, cx: number, cy: number, r: number): boolean {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function beltPower(stage: Stage, r: Runner): number {
  if (!r.grounded) return 0;
  for (const b of stage.belts) {
    if (r.x >= b.x && r.x <= b.x + b.w) return b.power;
  }
  return 0;
}

function onBoost(stage: Stage, r: Runner): boolean {
  const rect = playerRect(r);
  return stage.boosts.some((b) => overlap(rect, { x: b.x, y: b.y - 30, w: b.w, h: b.h + 40 }));
}

function resolveX(r: Runner, prevFeet: number, bodies: Body[]) {
  for (const b of bodies) {
    if (b.oneWay) continue;
    if (prevFeet <= b.y + 3) continue;
    let rect = playerRect(r);
    if (!overlap(rect, b)) continue;
    if (r.vx > 0 || r.x + PW / 2 > b.x + b.w / 2) {
      r.x = b.x - PW / 2 - 0.05;
    } else {
      r.x = b.x + b.w + PW / 2 + 0.05;
    }
    r.vx = 0;
    rect = playerRect(r);
  }
}

function resolveY(r: Runner, prevFeet: number, bodies: Body[]) {
  r.grounded = false;
  for (const b of bodies) {
    const rect = playerRect(r);
    if (!overlap(rect, b)) continue;
    if (b.oneWay) {
      if (r.vy < 0) continue;
      if (prevFeet > b.y + 4) continue;
    }
    if (r.vy >= 0 && prevFeet <= b.y + 8) {
      const landed = !r.grounded && r.vy > 80;
      r.y = b.y;
      r.vy = 0;
      r.grounded = true;
      if (landed) r.squash = -0.18;
    } else if (!b.oneWay && r.vy < 0 && prevFeet - r.h >= b.y + b.h - 4) {
      r.y = b.y + b.h + r.h + 0.05;
      r.vy = 0;
      r.rising = false;
    }
  }
}

function stick(r: Runner, bodies: Body[]) {
  if (r.vy < 0 || r.vy > 80) return;
  let best: number | null = null;
  const left = r.x - PW / 2 + 4;
  const right = r.x + PW / 2 - 4;
  for (const b of bodies) {
    if (right < b.x || left > b.x + b.w) continue;
    const dy = b.y - r.y;
    if (dy >= -1 && dy <= 8) {
      if (best === null || b.y < best) best = b.y;
    }
  }
  if (best !== null) {
    r.y = best;
    r.vy = 0;
    r.grounded = true;
  }
}

function forgiveLedge(r: Runner, bodies: Body[]) {
  if (r.vy < 0) return;
  const rect = playerRect(r);
  for (const b of bodies) {
    if (b.oneWay) continue;
    if (!overlap(rect, b)) continue;
    const into = rect.x + rect.w - b.x;
    if (into > 0 && into < 22 && r.y > b.y && r.y - b.y < 30 && r.x < b.x + 8) {
      r.y = b.y;
      r.vy = 0;
      r.grounded = true;
      r.x = Math.min(r.x, b.x - PW / 2 + into);
      return;
    }
  }
}

function stumble(sim: Sim) {
  const r = sim.runner;
  r.vx = -150;
  r.vy = -220;
  r.stun = 0.32;
  r.hitCd = 0.45;
  r.grounded = false;
  r.rising = false;
  r.x -= 10;
  sim.shake = 7;
  sim.clap = Math.min(1, sim.clap + 0.4);
  burst(sim, r.x, r.y - 20, "#e2b657", 6);
}

function die(sim: Sim) {
  const m = sim.stage.marks[sim.mark] ?? sim.stage.marks[0];
  sim.notes = sim.notes ?? [];
  if (sim.notes.length < 8) {
    sim.notes.push(
      `fell x ${Math.round(sim.runner.x)} y ${Math.round(sim.runner.y)} vx ${Math.round(sim.runner.vx)} mark ${sim.mark} ${m?.name ?? ""}`,
    );
  }
  if (!m) return;
  let x = m.x + 40;
  const bodies = bodiesAt(sim.stage, sim.age, sim.broken);
  const fits = (px: number) =>
    bodies.some((b) => px >= b.x + 10 && px <= b.x + b.w - 10 && b.y <= m.feet + 6 && b.y >= m.feet - 36);
  if (!fits(x)) {
    for (let i = 1; i <= 14; i++) {
      if (fits(m.x + 40 + i * 28)) {
        x = m.x + 40 + i * 28;
        break;
      }
    }
  }
  sim.runner.x = x;
  sim.runner.y = m.feet;
  sim.runner.vx = 0;
  sim.runner.vy = 0;
  sim.runner.lane = 0;
  sim.runner.laneZ = 0;
  sim.runner.slideT = 0;
  sim.steerLatch = 0;
  sim.runner.grounded = true;
  sim.runner.invuln = 0.65;
  sim.runner.stun = 0;
  sim.runner.rising = false;
  sim.deaths += 1;
  sim.shake = 10;
  sim.clap = 1;
  burst(sim, sim.runner.x, sim.runner.y, "#7fd0df", 8);
}

function pressButton(sim: Sim) {
  if (sim.pressed) return;
  sim.pressed = true;
  sim.splits.push(sim.stageClock);
  sim.phase = "stamp";
  sim.stamp = 0.95;
  sim.flash = 1;
  sim.clap = 1;
  sim.shake = 12;
  sim.runner.vx = 0;
  burst(sim, sim.stage.button.x, sim.stage.button.y, "#e23b2f", 16);
  burst(sim, sim.stage.button.x, sim.stage.button.y - 10, "#e2b657", 10);
}

function loadNext(sim: Sim) {
  const clock = sim.clock;
  const splits = sim.splits.slice();
  const cast = sim.cast;
  const deaths = sim.deaths;
  const fresh = createSim(sim.tier + 1, cast);
  fresh.clock = clock;
  fresh.splits = splits;
  fresh.deaths = deaths;
  fresh.clap = 1;
  fresh.phase = "play";
  Object.assign(sim, fresh);
}

function updateMark(sim: Sim) {
  const r = sim.runner;
  if (!r.grounded) return;
  let m = 0;
  for (let i = 0; i < sim.stage.marks.length; i++) {
    const mark = sim.stage.marks[i];
    if (mark && r.x >= mark.x + 20) m = i;
  }
  sim.mark = m;
}

function hazards(sim: Sim) {
  const r = sim.runner;
  if (r.invuln > 0 || r.hitCd > 0) return;
  const rect = playerRect(r);
  for (const h of sim.stage.hurdles) {
    if (sim.stage.style === "stilts" && !h.over && h.h <= 36) continue;
    if (!overlap(rect, h)) continue;
    if (r.y <= h.y + 6) continue;
    stumble(sim);
    return;
  }
  const chest = chestRect(r);
  const age = sim.age;
  for (const hammer of sim.stage.hammers) {
    const tip = hammerTip(hammer, age);
    if (circleHits(chest, tip.x, tip.y, hammer.r)) {
      stumble(sim);
      return;
    }
  }
  for (const log of sim.stage.logs) {
    const c = logCenter(log, age);
    if (circleHits(chest, c.x, c.y, log.r)) {
      stumble(sim);
      return;
    }
  }
  for (const p of sim.stage.pendulums) {
    const c = pendBob(p, age);
    if (circleHits(chest, c.x, c.y, p.r)) {
      stumble(sim);
      return;
    }
  }
}

function trySmash(sim: Sim, jumpEdge: boolean) {
  if (!jumpEdge || sim.stage.style !== "mallet") return;
  const r = sim.runner;
  for (let i = 0; i < sim.stage.darumas.length; i++) {
    if (sim.broken[i]) continue;
    const d = sim.stage.darumas[i];
    if (!d) continue;
    if (r.x < d.x - 84 || r.x > d.x + 6) continue;
    if (darumaOpen(d, sim.age)) {
      sim.broken[i] = true;
      sim.clap = 1;
      sim.shake = 9;
      burst(sim, d.x, FEET - 20, "#e2b657", 10);
    } else {
      stumble(sim);
    }
    return;
  }
}

export function step(sim: Sim, input: Input, dt: number) {
  sim.age += dt;
  sim.shake *= Math.exp(-3.5 * dt);
  sim.flash *= Math.exp(-4 * dt);
  sim.clap = Math.max(0.15, sim.clap * Math.exp(-0.8 * dt));
  for (const p of sim.particles) {
    p.life -= dt;
    p.vy += 500 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  sim.particles = sim.particles.filter((p) => p.life > 0);

  if (sim.phase === "attract") {
    const r = sim.runner;
    r.x = 140 + Math.sin(sim.age * 0.6) * 18;
    r.y = FEET;
    r.grounded = true;
    r.vx = 0;
    r.runTime += dt * 0.35;
    sim.clap = 0.45;
    return;
  }

  if (sim.phase === "stamp") {
    sim.stamp -= dt;
    sim.runner.grounded = true;
    sim.runner.vx = 0;
    if (sim.stamp <= 0) {
      if (sim.tier >= TIER_IDS.length - 1) sim.phase = "done";
      else loadNext(sim);
    }
    return;
  }

  if (sim.phase !== "play") return;

  const r = sim.runner;
  const stage = sim.stage;
  const stats = styleStats(stage.style);
  r.coyote = r.grounded ? 0.12 : r.coyote - dt;
  r.stun = Math.max(0, r.stun - dt);
  r.hitCd = Math.max(0, r.hitCd - dt);
  r.invuln = Math.max(0, r.invuln - dt);
  r.squash *= Math.exp(-8 * dt);
  sim.buffer = Math.max(0, sim.buffer - dt);

  const jumpEdge = input.jump && !sim.jumpLatch;
  if (jumpEdge) sim.buffer = 0.13;
  sim.jumpLatch = input.jump;
  trySmash(sim, jumpEdge);

  const cut = stage.style === "pogo" ? -560 : stage.style === "hands" ? -490 : -460;
  if (!input.jump && r.rising && r.vy < cut) {
    r.vy = cut;
    r.rising = false;
  }

  const belt = beltPower(stage, r);
  const wish = r.stun <= 0 ? 1 : 0;
  const target = wish * stats.run - belt;
  const rate = r.grounded ? stats.accel : stats.air;
  const diff = target - r.vx;
  r.vx += clamp(diff, -rate * dt, rate * dt);
  if (wish > 0) r.facing = 1;

  if (input.left && !input.right) {
    if (sim.steerLatch !== -1) {
      r.lane = clamp(r.lane - 1, -1, 1) as -1 | 0 | 1;
      sim.steerLatch = -1;
    }
  } else if (input.right && !input.left) {
    if (sim.steerLatch !== 1) {
      r.lane = clamp(r.lane + 1, -1, 1) as -1 | 0 | 1;
      sim.steerLatch = 1;
    }
  } else {
    sim.steerLatch = 0;
  }
  r.laneZ += (r.lane - r.laneZ) * Math.min(1, 14 * dt);

  if (input.slide && !r.grounded) {
    r.vy = Math.max(r.vy, 640);
    r.rising = false;
  }
  if (input.slide && r.grounded) r.slideT = 0.46;
  r.slideT = Math.max(0, r.slideT - dt);
  r.h = r.slideT > 0 && r.grounded ? Math.min(stanceHeight(stage.style), 34) : stanceHeight(stage.style);

  if (r.grounded && onBoost(stage, r)) r.vx = Math.max(r.vx, 500);

  if (stage.style === "pogo" && input.jump && r.grounded && r.stun <= 0) sim.buffer = Math.max(sim.buffer, 0.08);

  if (r.stun <= 0 && sim.buffer > 0 && (r.grounded || r.coyote > 0)) {
    const lift = Math.min(0, r.supportVy) * 2.4;
    r.vy = stats.jump + lift;
    r.grounded = false;
    r.coyote = 0;
    sim.buffer = 0;
    r.rising = true;
    r.squash = 0.16;
    sim.clap = Math.min(1, sim.clap + 0.25);
    burst(sim, r.x, r.y, "#f4efe4", 4);
  }

  if (!r.grounded) {
    let g = r.vy < 0 ? G_UP : G_DOWN;
    if (Math.abs(r.vy) < 90) g = G_APEX;
    r.vy = Math.min(MAX_FALL, r.vy + g * dt);
  } else if (!r.rising) {
    r.vy = 0;
  }

  const prevFeet = r.y;
  const bodies = bodiesAt(stage, sim.age, sim.broken, r);
  const xSteps = Math.max(1, Math.ceil(Math.abs(r.vx * dt) / 6));
  const xSlice = (r.vx * dt) / xSteps;
  for (let i = 0; i < xSteps; i++) {
    r.x += xSlice;
    resolveX(r, prevFeet, bodies);
  }
  const ySteps = Math.max(1, Math.ceil(Math.abs(r.vy * dt) / 6));
  const ySlice = (r.vy * dt) / ySteps;
  for (let i = 0; i < ySteps; i++) {
    const feetBefore = r.y;
    r.y += ySlice;
    resolveY(r, feetBefore, bodies);
  }
  stick(r, bodies);
  forgiveLedge(r, bodies);
  const support = r.grounded ? supportBody(r, bodies) : null;
  if (support) {
    r.supportVx = support.vx ?? 0;
    r.supportVy = support.vy ?? 0;
    if (r.supportVx) r.x += r.supportVx * dt;
    r.y = support.y;
  } else if (!r.grounded) {
    r.supportVx = 0;
    r.supportVy = 0;
  }

  r.x = clamp(r.x, 24, stage.length - 24);

  if (r.grounded && Math.abs(r.vx) > 40) r.runTime += dt;
  else if (r.grounded) r.runTime += dt * 0.2;

  if (r.y > FEET + 110) die(sim);
  else hazards(sim);

  const btn = stage.button;
  const dx = r.x - btn.x;
  const dy = r.y - r.h * 0.42 - btn.y;
  if (dx * dx + dy * dy < (btn.r + 16) * (btn.r + 16)) pressButton(sim);

  if (sim.phase === "play") {
    updateMark(sim);
    sim.clock += dt;
    sim.stageClock += dt;
  }

  const look = r.facing > 0 ? 340 : 420;
  const destX = clamp(r.x - look, 0, Math.max(0, stage.length - VW));
  const destY = r.y - 392;
  const k = 1 - Math.exp(-5 * dt);
  sim.camX += (destX - sim.camX) * k;
  sim.camY += (destY - sim.camY) * k;
}

export function obstacleProgress(sim: Sim): number {
  const span = TIER_IDS.length;
  const along = sim.stage.length > 0 ? clamp(sim.runner.x / sim.stage.length, 0, 1) : 0;
  if (sim.phase === "done") return 1;
  return clamp((sim.tier + along) / span, 0, 1);
}

export type BotResult = {
  ok: boolean;
  time: number;
  deaths: number;
  mark: number;
  x: number;
  length: number;
  splits: number[];
  notes?: string[];
};

export function botClear(id: TierId, maxSeconds = 180): BotResult {
  const tier = TIER_IDS.indexOf(id);
  const sim = createSim(tier, "kofi");
  let stuck = 0;
  let lastX = sim.runner.x;
  const hold = { t: 0 };
  const dt = 1 / 60;
  const frames = Math.floor(maxSeconds * 60);
  for (let i = 0; i < frames; i++) {
    const input = heldBot(sim, stuck, hold, dt);
    step(sim, input, dt);
    if (Math.abs(sim.runner.x - lastX) < 0.4 && sim.phase === "play") stuck += dt;
    else stuck = 0;
    lastX = sim.runner.x;
    if (sim.phase === "stamp" || sim.phase === "done") {
      return {
        ok: true,
        time: sim.splits[0] ?? sim.clock,
        deaths: sim.deaths,
        mark: sim.mark,
        x: sim.runner.x,
        length: sim.stage.length,
        splits: sim.splits.slice(),
        notes: sim.notes,
      };
    }
    if (sim.deaths > 30) break;
  }
  return {
    ok: false,
    time: sim.clock,
    deaths: sim.deaths,
    mark: sim.mark,
    x: sim.runner.x,
    length: sim.stage.length,
    splits: sim.splits.slice(),
    notes: sim.notes,
  };
}

function heldBot(sim: Sim, stuck: number, hold: { t: number }, dt: number): Input {
  const input = botInput(sim, stuck);
  if (input.jump) hold.t = sim.stage.style === "pogo" || sim.stage.style === "hands" ? 0.2 : 0.14;
  else if (hold.t > 0) {
    input.jump = true;
    hold.t -= dt;
  }
  return input;
}

export function botInput(sim: Sim, stuck: number): Input {
  const r = sim.runner;
  const stage = sim.stage;
  let jump = false;
  const bodies = bodiesAt(stage, sim.age, sim.broken, r);
  let waitBlink = false;
  for (const pad of stage.pads) {
    if (!pad.blink) continue;
    const hidden = padRect(pad, sim.age).y > FEET + 200;
    const dx = pad.base.x - r.x;
    if (hidden && dx > -16 && dx < 120) waitBlink = true;
  }

  const supportAhead = (dist: number) => {
    const x = r.x + dist;
    return bodies.some((b) => x >= b.x && x <= b.x + b.w && b.y >= r.y - 6 && b.y <= r.y + 36);
  };

  if (r.grounded && !supportAhead(stage.style === "bike" ? 36 : 28)) jump = true;

  for (const h of stage.hurdles) {
    if (h.over) continue;
    if (stage.style === "stilts" && h.h <= 36) continue;
    const dx = h.x - r.x;
    if (dx > 8 && dx < 86 && r.y > h.y + 4) jump = true;
  }

  for (const hammer of stage.hammers) {
    const tip = hammerTip(hammer, sim.age);
    const dx = tip.x - r.x;
    if (dx > -10 && dx < 90 && tip.y > r.y - r.h - 8) jump = true;
  }

  for (const log of stage.logs) {
    const c = logCenter(log, sim.age);
    const dx = c.x - r.x;
    if (dx > -8 && dx < 78 && c.y > r.y - r.h) jump = true;
  }

  for (const b of bodies) {
    if (b.oneWay) continue;
    const face = b.x;
    if (b.y < r.y - 10 && r.x + 22 > face && r.x < face + 14 && r.y > b.y + 8) jump = true;
  }

  if (stage.style === "mallet") {
    for (let i = 0; i < stage.darumas.length; i++) {
      if (sim.broken[i]) continue;
      const d = stage.darumas[i];
      if (!d) continue;
      const dx = d.x - r.x;
      if (dx > 10 && dx < 78 && darumaOpen(d, sim.age)) jump = true;
      if (dx > 6 && dx < 70 && !darumaOpen(d, sim.age)) {
        jump = false;
        waitBlink = true;
      }
    }
  }

  if (onBoost(stage, r)) jump = true;

  for (const p of stage.pendulums) {
    const bob = pendBob(p, sim.age);
    const dx = bob.x - r.x;
    const low = bob.y > FEET - 150;
    if (low && dx > -16 && dx < 96) jump = true;
  }

  if (stuck > 0.7 && !waitBlink) jump = true;
  if (waitBlink && stuck < 2.2) jump = false;

  return { left: false, right: false, jump, slide: false };
}

export function fullBot(): { ok: boolean; clock: number; deaths: number; splits: number[]; fail: string } {
  const sim = createSim(0, "ada");
  let stuck = 0;
  let lastX = sim.runner.x;
  const hold = { t: 0 };
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 60 * 12; i++) {
    step(sim, heldBot(sim, stuck, hold, dt), dt);
    if (sim.phase === "play" && Math.abs(sim.runner.x - lastX) < 0.35) stuck += dt;
    else stuck = 0;
    lastX = sim.runner.x;
    if (sim.phase === "done") {
      return { ok: true, clock: sim.clock, deaths: sim.deaths, splits: sim.splits.slice(), fail: "" };
    }
    if (sim.deaths > 80) {
      return {
        ok: false,
        clock: sim.clock,
        deaths: sim.deaths,
        splits: sim.splits.slice(),
        fail: `${TIER_IDS[sim.tier] ?? "?"} mark ${sim.mark} x ${Math.round(sim.runner.x)}`,
      };
    }
  }
  return {
    ok: false,
    clock: sim.clock,
    deaths: sim.deaths,
    splits: sim.splits.slice(),
    fail: `timeout ${TIER_IDS[sim.tier] ?? "?"} mark ${sim.mark}`,
  };
}