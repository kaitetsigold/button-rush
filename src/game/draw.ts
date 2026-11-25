import {
  FEET,
  VW,
  VH,
  hammerTip,
  logCenter,
  padRect,
  pendBob,
  type CastId,
  type Particle,
  type Sim,
  type Solid,
} from "@/game/course";

const CAST = {
  kofi: {
    skin: "#8d5a38",
    skinDeep: "#5c3b26",
    hair: "#140e0c",
    shirt: "#f3ecdf",
    shade: "#d5cbb8",
    shorts: "#1b5c34",
    trim: "#e2b657",
    shoe: "#f7f4ee",
  },
  ada: {
    skin: "#a56b48",
    skinDeep: "#6d4330",
    hair: "#1a100e",
    shirt: "#e23b2f",
    shade: "#a9231c",
    shorts: "#f3ecdf",
    trim: "#e2b657",
    shoe: "#f7f4ee",
  },
} as const;

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  sim: Sim,
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  const scale = Math.min(w / VW, h / VH);
  const ox = (w - VW * scale) / 2;
  const oy = (h - VH * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#10140f";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, VW * scale, VH * scale);
  ctx.clip();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  drawBackdrop(ctx, sim);
  const shakeX = (hash(sim.age * 60) - 0.5) * sim.shake;
  const shakeY = (hash(sim.age * 40 + 3) - 0.5) * sim.shake;
  ctx.save();
  ctx.translate(-(sim.camX + shakeX), -(sim.camY + shakeY));
  drawCourse(ctx, sim);
  drawActor(ctx, sim.runner.x, sim.runner.y, sim, "runner");
  drawCrew(ctx, sim);
  drawParticles(ctx, sim.particles);
  ctx.restore();
  if (sim.flash > 0.02) {
    ctx.fillStyle = `rgba(244,239,228,${sim.flash * 0.28})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  vignette(ctx);
  ctx.restore();
}

function drawBackdrop(ctx: CanvasRenderingContext2D, sim: Sim) {
  const sky = ctx.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, "#070b16");
  sky.addColorStop(0.45, "#1a2748");
  sky.addColorStop(0.72, "#3a2a22");
  sky.addColorStop(1, "#12261c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VW, VH);

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#f4efe4";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(120 + i * 220, 0);
    ctx.lineTo(40 + i * 220, 250);
    ctx.lineTo(210 + i * 220, 250);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const scroll = sim.camX * 0.25;
  ctx.fillStyle = "#121812";
  ctx.fillRect(0, 168, VW, 150);
  ctx.fillStyle = "#1c2618";
  for (let row = 0; row < 6; row++) {
    const y = 176 + row * 22;
    const bob = Math.sin(sim.age * 3.2 + row) * (1.4 + sim.clap * 3);
    for (let i = 0; i < 28; i++) {
      const x = ((i * 38 - scroll * (0.35 + row * 0.04) + row * 12) % (VW + 40)) - 20;
      const skin = ["#8d5a38", "#d7b094", "#5c3b26", "#c48a62", "#3d2a22"][i % 5] ?? "#8d5a38";
      const shirt = ["#e23b2f", "#e2b657", "#f4efe4", "#1d6b38", "#3157a5"][(i + row) % 5] ?? "#e23b2f";
      ctx.fillStyle = shirt;
      ctx.fillRect(x + 4, y + 8 + bob, 12, 10);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(x + 10, y + 5 + bob, 5.2, 0, Math.PI * 2);
      ctx.fill();
      if (sim.clap > 0.35) {
        const arm = Math.sin(sim.age * (8 + sim.clap * 10) + i) * 4;
        ctx.strokeStyle = skin;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 12 + bob);
        ctx.lineTo(x + 2, y + 6 + bob + arm);
        ctx.moveTo(x + 14, y + 12 + bob);
        ctx.lineTo(x + 18, y + 6 + bob - arm);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = "rgba(226,182,87,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 168);
  ctx.lineTo(VW, 168);
  ctx.stroke();
}

function drawCourse(ctx: CanvasRenderingContext2D, sim: Sim) {
  const stage = sim.stage;
  ctx.fillStyle = "#0e2418";
  ctx.fillRect(sim.camX - 40, FEET + 20, VW + 80, 220);

  for (const pit of stage.pits) drawWater(ctx, pit.x, pit.y, pit.w, sim.age);
  for (const solid of stage.solids) drawSolid(ctx, solid);
  for (const boost of stage.boosts) {
    ctx.fillStyle = "#e2b657";
    roundRect(ctx, boost.x, boost.y - 4, boost.w, 8, 3);
    ctx.fill();
    ctx.fillStyle = "#10140f";
    for (let i = 0; i < 3; i++) {
      const ax = boost.x + 12 + i * 16 + ((sim.age * 40) % 16);
      if (ax > boost.x + boost.w - 8) continue;
      ctx.beginPath();
      ctx.moveTo(ax, boost.y);
      ctx.lineTo(ax + 6, boost.y);
      ctx.lineTo(ax + 3, boost.y + 4);
      ctx.fill();
    }
  }
  for (const belt of stage.belts) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#070908";
    const offset = (sim.age * (40 + belt.power)) % 18;
    for (let x = belt.x - offset; x < belt.x + belt.w; x += 18) {
      ctx.fillRect(x, belt.y + 6, 8, 3);
    }
    ctx.restore();
  }
  for (const pad of stage.pads) {
    const rect = padRect(pad, sim.age);
    drawPad(ctx, rect.x, rect.y, rect.w);
  }
  for (const hurdle of stage.hurdles) drawHurdle(ctx, hurdle.x, hurdle.y, hurdle.w, hurdle.h);
  for (const hammer of stage.hammers) {
    const tip = hammerTip(hammer, sim.age);
    ctx.strokeStyle = "#8d97a5";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hammer.x, hammer.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = "#c5ccd4";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, hammer.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e23b2f";
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const log of stage.logs) {
    const c = logCenter(log, sim.age);
    drawLog(ctx, c.x, c.y, log.r, sim.age * log.speed * 0.02);
  }
  for (const pend of stage.pendulums) {
    const bob = pendBob(pend, sim.age);
    ctx.strokeStyle = "#d9d3c6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pend.x, pend.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.stroke();
    const g = ctx.createRadialGradient(bob.x - 4, bob.y - 4, 2, bob.x, bob.y, pend.r);
    g.addColorStop(0, "#f4efe4");
    g.addColorStop(1, "#8a6428");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bob.x, bob.y, pend.r, 0, Math.PI * 2);
    ctx.fill();
  }
  drawButton(ctx, sim);
}

function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, age: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + 150);
  g.addColorStop(0, "#0e4a58");
  g.addColorStop(1, "#062028");
  ctx.fillStyle = g;
  ctx.fillRect(x, y + 8, w, 150);
  ctx.strokeStyle = "rgba(168,226,232,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= w; i += 8) {
    const yy = y + 14 + Math.sin(age * 3 + i * 0.08) * 3;
    if (i === 0) ctx.moveTo(x + i, yy);
    else ctx.lineTo(x + i, yy);
  }
  ctx.stroke();
}

function drawSolid(ctx: CanvasRenderingContext2D, solid: Solid) {
  if (solid.kind === "stone") {
    ctx.fillStyle = "#6d756f";
    roundRect(ctx, solid.x, solid.y, solid.w, 18, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(244,239,228,0.25)";
    ctx.fillRect(solid.x + 4, solid.y + 3, solid.w - 8, 2);
    return;
  }
  if (solid.kind === "ledge") {
    const g = ctx.createLinearGradient(0, solid.y, 0, solid.y + 40);
    g.addColorStop(0, "#8a8478");
    g.addColorStop(1, "#3e433d");
    ctx.fillStyle = g;
    ctx.fillRect(solid.x, solid.y, solid.w, Math.min(solid.h, 220));
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(solid.x, solid.y, solid.w, 3);
    return;
  }
  if (solid.kind === "pedestal") {
    ctx.fillStyle = "#e7e0d2";
    ctx.fillRect(solid.x, solid.y, solid.w, solid.h);
    ctx.fillStyle = "#c4b8a4";
    ctx.fillRect(solid.x, solid.y, 4, solid.h);
    return;
  }
  const g = ctx.createLinearGradient(0, solid.y, 0, solid.y + 28);
  g.addColorStop(0, "#b5483b");
  g.addColorStop(1, "#6e241e");
  ctx.fillStyle = g;
  ctx.fillRect(solid.x, solid.y, solid.w, 22);
  ctx.fillStyle = "rgba(244,239,228,0.8)";
  ctx.fillRect(solid.x, solid.y + 2, solid.w, 2);
  ctx.fillRect(solid.x, solid.y + 18, solid.w, 2);
  ctx.strokeStyle = "rgba(16,20,15,0.25)";
  ctx.lineWidth = 2;
  for (let x = solid.x + 30; x < solid.x + solid.w; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, solid.y + 4);
    ctx.lineTo(x, solid.y + 18);
    ctx.stroke();
  }
}

function drawPad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = "#1d6b38";
  roundRect(ctx, x, y, w, 14, 7);
  ctx.fill();
  ctx.fillStyle = "#8fd18a";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + 6, w * 0.28, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHurdle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#d9d3c6";
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < h; i += 10) {
    ctx.fillStyle = i % 20 === 0 ? "#e23b2f" : "#f4efe4";
    ctx.fillRect(x, y + i, w, 6);
  }
  ctx.fillStyle = "#8a8478";
  ctx.fillRect(x - 3, y + h - 8, w + 6, 8);
}

function drawLog(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  const g = ctx.createLinearGradient(-r, 0, r, 0);
  g.addColorStop(0, "#4a2c18");
  g.addColorStop(0.5, "#a86b3c");
  g.addColorStop(1, "#3a2112");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2a160e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawButton(ctx: CanvasRenderingContext2D, sim: Sim) {
  const b = sim.stage.button;
  const pressed = sim.pressed ? 8 : 0;
  const pulse = 1 + Math.sin(sim.age * 5) * 0.04;
  ctx.save();
  ctx.translate(b.x, b.y + pressed);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "rgba(226,59,47,0.25)";
  ctx.beginPath();
  ctx.arc(0, 0, b.r + 18 + Math.sin(sim.age * 4) * 4, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(-10, -12, 4, 0, 0, b.r);
  g.addColorStop(0, sim.pressed ? "#ffb1a8" : "#ff6b5a");
  g.addColorStop(0.55, "#e23b2f");
  g.addColorStop(1, "#7a140e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-8, -10, 10, 6, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrew(ctx: CanvasRenderingContext2D, sim: Sim) {
  const y = sim.camY + 468;
  drawPerson(ctx, sim.camX + 42, y, sim, "host");
  drawPerson(ctx, sim.camX + 112, y + 2, sim, "cam");
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sim: Sim,
  who: "runner",
) {
  drawPerson(ctx, x, y, sim, who);
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sim: Sim,
  who: "runner" | "host" | "cam",
) {
  const runner = sim.runner;
  const moving = who === "runner" ? Math.abs(runner.vx) > 30 && runner.grounded : who === "cam";
  const airborne = who === "runner" && !runner.grounded;
  const phase =
    who === "runner" ? runner.runTime * (moving ? 2.4 : 1.1) : sim.age * (who === "host" ? 3.2 : 2.4);
  const palette = CAST[sim.cast];
  const skin = who === "cam" ? "#c48a62" : palette.skin;
  const skinDeep = who === "cam" ? "#8a5a3c" : palette.skinDeep;
  const shirt = who === "host" ? "#e2b657" : who === "cam" ? "#24344f" : palette.shirt;
  const shorts = who === "runner" ? palette.shorts : who === "host" ? "#1c2430" : "#121820";
  const hair = palette.hair;
  const female = (sim.cast === "ada" && who === "runner") || who === "host";
  const facing = who === "runner" ? runner.facing : 1;
  const squash = who === "runner" ? runner.squash : 0;
  const s = Math.sin(phase * Math.PI * 2);
  const bob = airborne ? -12 : moving ? Math.abs(Math.cos(phase * Math.PI * 2)) * -5 : Math.sin(sim.age * 2) * -1.5;

  let thighL = moving ? 0.65 * s : 0.12;
  let thighR = moving ? -0.65 * s : -0.08;
  let kneeL = 0.25 + (moving ? Math.max(0, -s) * 0.9 : 0.1);
  let kneeR = 0.25 + (moving ? Math.max(0, s) * 0.9 : 0.15);
  let armL = moving ? -0.8 * s : 0.18;
  let armR = moving ? 0.8 * s : -0.12;
  if (airborne) {
    thighL = -0.45;
    thighR = 0.7;
    kneeL = 0.3;
    kneeR = 1.05;
    armL = -1.3;
    armR = 1.15;
  }
  if (who === "host") {
    const c = Math.abs(Math.sin(sim.age * (6 + sim.clap * 12)));
    armL = -0.9 + c * 0.7;
    armR = 0.9 - c * 0.7;
    thighL = 0.08;
    thighR = -0.05;
    kneeL = 0.15;
    kneeR = 0.15;
  }

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(facing, 1);
  ctx.scale(1.05 - squash * 0.45, 1.05 + squash);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 3, 18, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  paintLeg(ctx, -3, -38, thighL, kneeL, skin);
  paintLeg(ctx, 3, -38, thighR, kneeR, skin);

  ctx.fillStyle = shorts;
  roundRect(ctx, -12, -44, 24, 12, 4);
  ctx.fill();

  ctx.fillStyle = shirt;
  roundRect(ctx, -12, -74, 24, 34, 8);
  ctx.fill();
  ctx.fillStyle = palette.trim;
  ctx.fillRect(8, -70, 3, 24);

  paintArm(ctx, -8, -66, armL, skin);
  paintArm(ctx, 8, -66, armR, skin);

  const headY = -90;
  const headR = female ? 12 : 12.5;
  const hg = ctx.createRadialGradient(-3, headY - 3, 2, 0, headY, headR);
  hg.addColorStop(0, skin);
  hg.addColorStop(1, skinDeep);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(0, headY - 1, headR, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-headR, headY - 1, headR * 2, 4);
  if (female) {
    ctx.beginPath();
    ctx.arc(-1, headY - headR + 2, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#f7f4ee";
  ctx.beginPath();
  ctx.ellipse(5, headY - 1, 2.4, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16120e";
  ctx.beginPath();
  ctx.arc(5.7, headY - 1, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = skinDeep;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(3.5, headY + 4, 3.2, 0.2, Math.PI - 0.5);
  ctx.stroke();

  if (who === "cam") {
    ctx.fillStyle = "#14181e";
    roundRect(ctx, 10, headY - 6, 14, 9, 2);
    ctx.fill();
    ctx.fillStyle = "#b9d4ea";
    ctx.beginPath();
    ctx.arc(24, headY - 1, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  thigh: number,
  knee: number,
  skin: string,
) {
  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(thigh);
  ctx.fillStyle = skin;
  roundRect(ctx, -4.5, 0, 9, 20, 4);
  ctx.fill();
  ctx.translate(0, 18);
  ctx.rotate(knee);
  roundRect(ctx, -4, 0, 8, 18, 4);
  ctx.fill();
  ctx.fillStyle = "#f4efe4";
  roundRect(ctx, -3, 14, 14, 5, 2);
  ctx.fill();
  ctx.restore();
}

function paintArm(ctx: CanvasRenderingContext2D, sx: number, sy: number, angle: number, skin: string) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  ctx.fillStyle = skin;
  roundRect(ctx, -3.5, 0, 7, 22, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 23, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function vignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(VW / 2, VH / 2, 180, VW / 2, VH / 2, 560);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
