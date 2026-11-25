import * as THREE from "three";
import {
  FEET,
  darumaOpen,
  logCenter,
  padRect,
  type CastId,
  type Sim,
  type Stage,
} from "@/game/course";

const S = 0.02;

function wx(x: number) {
  return x * S;
}

function wy(y: number) {
  return (FEET - y) * S;
}

type Kind = CastId | "host" | "cam";

type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  shirts: THREE.Mesh[];
  skins: THREE.Mesh[];
  hairs: THREE.Mesh[];
};

type Dyn = {
  pads: THREE.Mesh[];
  logs: THREE.Object3D[];
  hammers: THREE.Group[];
  pends: THREE.Group[];
  darumas: { root: THREE.Group; glow: THREE.Mesh }[];
  button: THREE.Object3D;
  glow: THREE.PointLight;
};

const PALETTE: Record<Kind, { skin: number; shirt: number; shorts: number; hair: number; trim: number }> = {
  kofi: { skin: 0x8d5a3c, shirt: 0xf4efe4, shorts: 0x1c2430, hair: 0x1a120e, trim: 0xe2b657 },
  ada: { skin: 0xc48a62, shirt: 0xe23b2f, shorts: 0x1c2430, hair: 0x140e0c, trim: 0xf4efe4 },
  host: { skin: 0xc48a62, shirt: 0xe2b657, shorts: 0x1c2430, hair: 0x140e0c, trim: 0xf4efe4 },
  cam: { skin: 0x8d5a3c, shirt: 0x24344f, shorts: 0x121820, hair: 0x1a120e, trim: 0xa8b1a4 },
};

export type StadiumView = {
  frame: (sim: Sim, alpha: number, prevX: number, prevY: number) => void;
  dispose: () => void;
};

export function createStadiumView(canvas: HTMLCanvasElement): StadiumView {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x243044);
  scene.fog = new THREE.Fog(0x243044, 28, 78);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.15, 140);
  const hemi = new THREE.HemisphereLight(0xd5e4ff, 0x3d5a40, 1.05);
  const sun = new THREE.DirectionalLight(0xfff2d4, 2.6);
  const fill = new THREE.DirectionalLight(0xc5d4ee, 0.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 36;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0006;
  scene.add(hemi, sun, sun.target, fill);

  const world = new THREE.Group();
  // Course forward (+X in the sim) points away from the chase camera.
  world.rotation.y = Math.PI / 2;
  scene.add(world);

  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (hex: number, rough = 0.7, metal = 0.04, emissive = 0) => {
    const key = `${hex}:${rough}:${metal}:${emissive}`;
    let found = mats.get(key);
    if (!found) {
      found = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough,
        metalness: metal,
        emissive,
        emissiveIntensity: emissive ? 0.85 : 0,
      });
      mats.set(key, found);
    }
    return found;
  };

  const runner = buildRig("kofi", mat);
  const host = buildRig("host", mat);
  const camOp = buildRig("cam", mat);
  const gear = buildGear(mat);
  runner.root.add(gear.root);
  world.add(runner.root, host.root, camOp.root);
  host.root.rotation.y = Math.PI / 2;
  camOp.root.rotation.y = -Math.PI / 2;

  let course: THREE.Group | null = null;
  let dyn: Dyn | null = null;
  let stageId = "";
  let cast: CastId = "kofi";
  let lastW = 0;
  let lastH = 0;
  const hold = { y: 2.4, z: -4 };

  const pointsGeo = new THREE.BufferGeometry();
  const pointPos = new Float32Array(70 * 3);
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(pointPos, 3));
  const points = new THREE.Points(
    pointsGeo,
    new THREE.PointsMaterial({ color: 0xe2b657, size: 0.09, transparent: true, depthWrite: false }),
  );
  world.add(points);

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    const portrait = camera.aspect < 1;
    camera.fov = portrait ? 50 : 42;
    camera.updateProjectionMatrix();
  }

  function rebuild(stage: Stage) {
    if (course) {
      scene.remove(course);
      world.remove(course);
      disposeTree(course);
    }
    course = new THREE.Group();
    dyn = buildCourse(course, stage, mat);
    world.add(course);
    stageId = stage.id;
  }

  function frame(sim: Sim, alpha: number, prevX: number, prevY: number) {
    resize();
    if (!course || !dyn || stageId !== sim.stage.id) rebuild(sim.stage);
    const live = dyn;
    if (!live) return;
    if (cast !== sim.cast) {
      cast = sim.cast;
      paintRig(runner, cast, mat);
    }

    const t = Math.min(1, Math.max(0, alpha));
    const x = prevX + (sim.runner.x - prevX) * t;
    const y = prevY + (sim.runner.y - prevY) * t;
    const moving = sim.runner.grounded && Math.abs(sim.runner.vx) > 40;
    const airborne = sim.phase === "play" && !sim.runner.grounded;

    const laneSpread = 4.4;
    runner.root.position.set(wx(x), wy(y), sim.runner.laneZ * laneSpread);
    runner.root.rotation.y = sim.runner.facing > 0 ? 0 : Math.PI;
    const style = sim.stage.style;
    runner.root.scale.setScalar(style === "hands" ? 0.82 : 1);
    poseRig(runner, sim, "runner", moving, airborne, style);

    host.root.position.set(wx(x) - 1.1, 0, 6.2);
    camOp.root.position.set(wx(x) - 0.7, 0, -6.2);
    poseRig(host, sim, "host", false, false);
    poseRig(camOp, sim, "cam", true, false);

    const stage = sim.stage;
    for (let i = 0; i < live.pads.length; i++) {
      const pad = stage.pads[i];
      const mesh = live.pads[i];
      if (!pad || !mesh) continue;
      const rect = padRect(pad, sim.age, sim.runner);
      mesh.position.set(wx(rect.x + rect.w / 2), wy(rect.y) - 0.1, 0);
    }
    for (let i = 0; i < live.logs.length; i++) {
      const log = stage.logs[i];
      const mesh = live.logs[i];
      if (!log || !mesh) continue;
      const c = logCenter(log, sim.age);
      mesh.position.set(wx(c.x), wy(c.y), 0);
      mesh.rotation.z = -sim.age * log.speed * 0.015;
    }
    for (let i = 0; i < live.hammers.length; i++) {
      const hammer = stage.hammers[i];
      const pivot = live.hammers[i];
      if (!hammer || !pivot) continue;
      pivot.rotation.z = -(sim.age * hammer.speed + hammer.phase);
    }
    for (let i = 0; i < live.pends.length; i++) {
      const pend = stage.pendulums[i];
      const pivot = live.pends[i];
      if (!pend || !pivot) continue;
      const swing = Math.sin(sim.age * pend.speed + pend.phase) * pend.amp;
      pivot.rotation.z = -swing;
    }

    const btn = stage.button;
    const pulse = sim.pressed ? 0.68 : 1 + Math.sin(sim.age * 3) * 0.035;
    live.button.position.set(wx(btn.x), wy(btn.y), 0);
    live.button.scale.setScalar(pulse);
    live.glow.position.set(wx(btn.x), wy(btn.y), 0.4);
    live.glow.intensity = sim.pressed ? 6 : 2.2 + Math.sin(sim.age * 4) * 0.4;

    for (let i = 0; i < live.darumas.length; i++) {
      const gate = stage.darumas[i];
      const stack = live.darumas[i];
      if (!gate || !stack) continue;
      stack.root.visible = !sim.broken[i];
      const glowMat = stack.glow.material as THREE.MeshStandardMaterial;
      const open = darumaOpen(gate, sim.age);
      glowMat.emissive.setHex(open ? 0xffe08a : 0x1a120c);
    }

    gear.bike.visible = style === "bike";
    gear.stilts.visible = style === "stilts";
    gear.pogo.visible = style === "pogo";
    gear.mallet.visible = style === "mallet";
    if (style === "stilts") runner.root.position.y = wy(y) + 0.7;
    if (style === "hands") {
      const stride = Math.sin(sim.runner.runTime * Math.PI * 2 * 2.4);
      runner.root.position.y = wy(y) + (moving ? Math.abs(stride) * 0.05 : 0);
    } else if (moving) {
      runner.root.position.y += Math.abs(Math.sin(sim.runner.runTime * Math.PI * 2 * 2.2)) * 0.06;
    }
    if (sim.runner.slideT > 0 && sim.runner.grounded && !airborne) {
      runner.root.position.y -= 0.22;
    }
    if (style === "pogo") gear.spring.scale.y = sim.runner.grounded ? 0.55 : 1;
    else gear.spring.scale.y = 1;
    if (style === "bike") {
      gear.wheelL.rotation.x = -sim.runner.runTime * 10;
      gear.wheelR.rotation.x = -sim.runner.runTime * 10;
    }
    if (style === "mallet") gear.mallet.rotation.z = sim.runner.rising ? -1.35 : -0.25;

    const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 70; i++) {
      const p = sim.particles[i];
      if (!p) {
        attr.setXYZ(i, 0, -20, 0);
        continue;
      }
      attr.setXYZ(i, wx(p.x), wy(p.y), (i % 5) * 0.05);
    }
    attr.needsUpdate = true;

    const focusX = wx(x);
    const focusY = wy(y);
    const portrait = camera.aspect < 1;
    const wide = sim.phase === "attract" || sim.phase === "done";
    const behind = wide ? (portrait ? 6.8 : 7.6) : portrait ? 5.5 : 6.3;
    const rise = wide ? (portrait ? 2.8 : 3.0) : portrait ? 3.35 : 3.15;
    const ahead = wide ? 6.5 : portrait ? 7.4 : 8.4;
    const floorY = Math.max(focusY + rise, nearbyCeiling(sim.stage, x) + 0.85);
    hold.y += (floorY - hold.y) * (wide ? 0.08 : 0.2);
    hold.z += (-focusX + behind - hold.z) * (wide ? 0.08 : 0.22);
    const shake = sim.shake * S * 0.7;
    camera.position.set(Math.sin(sim.age * 40) * shake, hold.y, hold.z);
    camera.lookAt(0, wide ? focusY + 0.15 : focusY + 0.2, -focusX - ahead);
    sun.position.set(4, focusY + 14, -focusX + 8);
    sun.target.position.set(0, focusY + 1, -focusX - 3);
    fill.position.set(-3, focusY + 5, -focusX + 2);

    renderer.render(scene, camera);
  }

  function dispose() {
    if (course) disposeTree(course);
    disposeTree(runner.root);
    disposeTree(host.root);
    disposeTree(camOp.root);
    pointsGeo.dispose();
    (points.material as THREE.Material).dispose();
    mats.forEach((m) => m.dispose());
    renderer.dispose();
  }

  return { frame, dispose };
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

function buildCourse(
  course: THREE.Group,
  stage: Stage,
  mat: (hex: number, rough?: number, metal?: number, emissive?: number) => THREE.MeshStandardMaterial,
): Dyn {
  const track = mat(0x6a5044, 0.82, 0.02);
  const curb = mat(0xe2b657, 0.45, 0.12);
  const ledge = mat(0x3e5a48, 0.7, 0.04);
  const turf = mat(0x2f7a45, 0.86, 0);
  const water = mat(0x1aa7c9, 0.12, 0.55, 0x0c6e8a);
  const hurdleRed = mat(0xe23b2f, 0.4, 0.08);
  const hurdleGold = mat(0xe2b657, 0.38, 0.16);
  const beltMat = mat(0x35527a, 0.48, 0.22);
  const padMat = mat(0x3d8a5c, 0.55, 0.05);
  const wood = mat(0xa56b3c, 0.66, 0.04);
  const metal = mat(0xd5dde6, 0.28, 0.7);
  const stand = mat(0x2a3830, 0.84, 0.02);
  const rail = mat(0x31463a, 0.64, 0.1);
  const bldg = mat(0x1c2428, 0.9, 0);
  const bulb = mat(0xfff6df, 0.3, 0, 0xffe7b0);

  const len = wx(stage.length);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(len + 40, 28), turf);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(len / 2, -0.05, 0);
  ground.receiveShadow = true;
  course.add(ground);

  for (const solid of stage.solids) {
    const width = Math.max(0.2, solid.w * S);
    const top = wy(solid.y);
    const cx = wx(solid.x + solid.w / 2);
    if (solid.kind === "stone") {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 0.48), mat(0xf0e2c4, 0.42, 0.06));
      beam.position.set(cx, top - 0.08, 0);
      beam.castShadow = true;
      beam.receiveShadow = true;
      const flankL = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, 0.07), mat(0x6b3a22, 0.55, 0.05));
      flankL.position.set(cx, top - 0.1, -0.22);
      const flankR = flankL.clone();
      flankR.position.z = 0.22;
      course.add(beam, flankL, flankR);
      continue;
    }
    if (solid.kind === "pedestal") {
      const height = Math.max(0.4, solid.h * S);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.55), ledge);
      mesh.position.set(cx, top - height / 2, 0);
      mesh.castShadow = true;
      course.add(mesh);
      continue;
    }
    if (solid.kind === "ledge") {
      let approach = 0;
      for (const other of stage.solids) {
        if (other === solid) continue;
        const ends = other.x + other.w;
        if (ends <= solid.x + 8 && ends >= solid.x - 48) approach = Math.max(approach, wy(other.y));
      }
      const riserH = Math.max(0.32, Math.min(1.2, top - approach));
      const tread = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, 10.2), mat(0xe6d3b0, 0.58, 0.04));
      tread.position.set(cx, top - 0.08, 0);
      tread.castShadow = true;
      tread.receiveShadow = true;
      const riser = new THREE.Mesh(new THREE.BoxGeometry(0.14, riserH, 10.2), mat(0xe07a3d, 0.48, 0.06));
      riser.position.set(wx(solid.x) + 0.05, top - riserH / 2, 0);
      const nosing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 10.4), curb);
      nosing.position.set(wx(solid.x), top + 0.03, 0);
      course.add(tread, riser, nosing);
      continue;
    }
    const height = 0.26;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 10.2), track);
    mesh.position.set(cx, top - height / 2, 0);
    mesh.receiveShadow = true;
    course.add(mesh);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.045, 0.07), curb);
    lip.position.set(cx, top + 0.02, -5.05);
    const lipR = lip.clone();
    lipR.position.z = 5.05;
    course.add(lip, lipR);
    for (const z of [-2.2, 2.2]) {
      const guide = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, 0.04), curb);
      guide.position.set(cx, top + 0.045, z);
      course.add(guide);
    }
    for (let d = 0.45; d < width - 0.3; d += 0.9) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.06), curb);
      dash.position.set(wx(solid.x) + d, top + 0.04, 0);
      course.add(dash);
    }
  }

  stage.hurdles.forEach((h, i) => {
    const color = i % 2 === 0 ? hurdleGold : hurdleRed;
    const other = i % 2 === 0 ? hurdleRed : hurdleGold;
    const top = wy(h.y);
    const base = 0;
    const cx = wx(h.x + h.w / 2);
    if (h.over) {
      const span = 10.4;
      const segs = 14;
      for (let s = 0; s < segs; s++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, span / segs + 0.01), s % 2 === 0 ? hurdleRed : hurdleGold);
        seg.position.set(cx, top, -span / 2 + (s + 0.5) * (span / segs));
        seg.castShadow = true;
        course.add(seg);
      }
      const postH = Math.max(0.45, top - 0.05);
      for (const z of [-5.15, 5.15]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, postH, 0.08), hurdleGold);
        post.position.set(cx, postH / 2, z);
        post.castShadow = true;
        course.add(post);
      }
      const warn = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 8), hurdleRed);
      warn.position.set(cx - 0.95, 0.06, 0);
      course.add(warn);
      return;
    }
    const height = Math.max(0.28, top - base);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.1, height, 0.1), color);
    postL.position.set(cx, base + height / 2, -5);
    postL.castShadow = true;
    const postR = postL.clone();
    postR.position.z = 5;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 10), color);
    bar.position.set(cx, top, 0);
    bar.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 10.2), other);
    cap.position.set(cx, top + 0.07, 0);
    course.add(postL, postR, bar, cap);
    for (const z of [-4.4, 0, 4.4]) jumpChevrons(course, cx - 0.7, 0.07, curb, z);
  });

  for (const pit of stage.pits) {
    const w = Math.max(0.25, pit.w * S);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 11), water);
    mesh.position.set(wx(pit.x + pit.w / 2), -0.12, 0);
    const shine = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.12, w * 0.8), 0.04, 6),
      mat(0xd7f6ff, 0.12, 0.2, 0x7fd0df),
    );
    shine.position.set(mesh.position.x, 0.02, 0);
    course.add(mesh, shine);
    jumpChevrons(course, wx(pit.x) - 0.02, 0.07, curb, -4.4);
    jumpChevrons(course, wx(pit.x) - 0.02, 0.07, curb, 0);
    jumpChevrons(course, wx(pit.x) - 0.02, 0.07, curb, 4.4);
  }

  for (const belt of stage.belts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(belt.w * S, 0.07, 8), beltMat);
    mesh.position.set(wx(belt.x + belt.w / 2), wy(FEET) + 0.05, 0);
    mesh.receiveShadow = true;
    course.add(mesh);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(belt.w * S * 0.96, 0.02, 0.08), curb);
    stripe.position.set(mesh.position.x, wy(FEET) + 0.09, 0);
    course.add(stripe);
  }

  for (const boost of stage.boosts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(boost.w * S, 0.08, 6), curb);
    mesh.position.set(wx(boost.x + boost.w / 2), wy(FEET) + 0.1, 0);
    course.add(mesh);
  }

  const pads = stage.pads.map((pad) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pad.base.w * S, 0.2, 8), padMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    course.add(mesh);
    return mesh;
  });

  const logs = stage.logs.map((log) => {
    const group = new THREE.Group();
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(log.r * S, log.r * S, 8, 16), wood);
    roller.rotation.x = Math.PI / 2;
    roller.castShadow = true;
    group.add(roller);
    course.add(group);
    return group;
  });

  const hammers = stage.hammers.map((hammer) => {
    const pivot = new THREE.Group();
    const length = hammer.len * S;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, length, 0.07), metal);
    arm.position.y = -length / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 8), metal);
    head.position.y = -length;
    head.castShadow = true;
    arm.castShadow = true;
    pivot.add(arm, head);
    pivot.position.set(wx(hammer.x), wy(hammer.y), 0);
    course.add(pivot);
    return pivot;
  });

  const pends = stage.pendulums.map((pend) => {
    const pivot = new THREE.Group();
    const length = pend.len * S;
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.04, length, 0.04), metal);
    rope.position.y = -length / 2;
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 8, 12), mat(0xe23b2f, 0.35, 0.2));
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -length;
    bob.castShadow = true;
    pivot.add(rope, bob);
    pivot.position.set(wx(pend.x), wy(pend.y), 0);
    course.add(pivot);
    return pivot;
  });

  const darumas = stage.darumas.map((d) => {
    const root = new THREE.Group();
    const woodMat = mat(0xc48a62, 0.7, 0.04);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xe2b657,
      roughness: 0.42,
      metalness: 0.08,
      emissive: 0x000000,
      emissiveIntensity: 0.85,
    });
    for (let i = 0; i < 7; i++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 7.6), i === 0 ? glowMat : woodMat);
      block.position.y = 0.14 + i * 0.24;
      block.castShadow = true;
      root.add(block);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 7.8), mat(0xe23b2f, 0.45, 0.08));
    head.position.y = 1.9;
    head.castShadow = true;
    root.add(head);
    root.position.set(wx(d.x + d.w / 2), wy(FEET), 0);
    course.add(root);
    return { root, glow: root.children[0] as THREE.Mesh };
  });

  const button = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 8), mat(0xe23b2f, 0.28, 0.18, 0x7a140e));
  cap.castShadow = true;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 8.2), metal);
  housing.position.y = -0.2;
  button.add(cap, housing);
  course.add(button);
  const glow = new THREE.PointLight(0xe23b2f, 2.2, 7, 2);
  course.add(glow);

  for (const side of [1, -1]) {
    for (let row = 0; row < 5; row++) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(len + 8, 0.42, 0.95), stand);
      deck.position.set(len / 2, 0.45 + row * 0.58, side * (6.5 + row * 0.85));
      deck.receiveShadow = true;
      course.add(deck);
    }
  }

  const cols = Math.max(12, Math.floor((len + 4) / 0.74));
  const rows = 5;
  const count = cols * rows * 2;
  const bodyGeo = new THREE.BoxGeometry(0.28, 0.62, 0.2);
  const headGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat(0xffffff, 0.7, 0.02), count);
  const heads = new THREE.InstancedMesh(headGeo, mat(0xc48a62, 0.6, 0.02), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const shirts = [0xe23b2f, 0xe2b657, 0xf4efe4, 0x24344f, 0x314036];
  let n = 0;
  for (const side of [1, -1]) {
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const px = -2 + c * 0.74 + (row % 2) * 0.18;
        const py = 0.78 + row * 0.58;
        const pz = side * (6.6 + row * 0.85);
        dummy.position.set(px, py, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 0.88 + (c % 4) * 0.06, 1);
        dummy.updateMatrix();
        bodies.setMatrixAt(n, dummy.matrix);
        color.setHex(shirts[(c + row * 2) % shirts.length] ?? 0xf4efe4);
        bodies.setColorAt(n, color);
        dummy.position.y = py + 0.42;
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        heads.setMatrixAt(n, dummy.matrix);
        n += 1;
      }
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  course.add(bodies, heads);

  for (const side of [1, -1]) {
    const railMesh = new THREE.Mesh(new THREE.BoxGeometry(len + 6, 0.42, 0.12), rail);
    railMesh.position.set(len / 2, 0.28, side * 5.7);
    course.add(railMesh);
  }

  for (let x = 2; x < len; x += 22) {
    for (const side of [1, -1]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7.2, 0.12), metal);
      pole.position.set(x, 3.6, side * 8.2);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 1.3), bulb);
      lamp.position.set(x, 7.15, side * 7.6);
      course.add(pole, lamp);
    }
  }

  for (let i = 0; i < 7; i++) {
    const bh = 2.4 + (i % 3) * 1.5;
    for (const side of [1, -1]) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(3.4, bh, 2.2), bldg);
      block.position.set((i + 0.5) * (len / 7), bh / 2 + 1.2, side * 11);
      course.add(block);
    }
  }

  return { pads, logs, hammers, pends, darumas, button, glow };
}

function limb(parent: THREE.Object3D, y: number, length: number, thick: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.position.y = y;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, length, thick * 0.86), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  group.add(mesh);
  parent.add(group);
  return group;
}

function buildRig(
  kind: Kind,
  mat: (hex: number, rough?: number, metal?: number, emissive?: number) => THREE.MeshStandardMaterial,
): Rig {
  const root = new THREE.Group();
  const pal = PALETTE[kind];
  const skin = mat(pal.skin, 0.58);
  const shirt = mat(pal.shirt, 0.52);
  const shorts = mat(pal.shorts, 0.7);
  const hair = mat(pal.hair, 0.8);
  const trim = mat(pal.trim, 0.4, 0.14);
  const shirts: THREE.Mesh[] = [];
  const skins: THREE.Mesh[] = [];
  const hairs: THREE.Mesh[] = [];

  const hip = new THREE.Group();
  hip.position.y = 0.9;
  root.add(hip);
  const shortsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.34), shorts);
  shortsMesh.castShadow = true;
  hip.add(shortsMesh);

  const thighL = limb(hip, 0, 0.42, 0.12, skin);
  thighL.position.z = 0.09;
  const thighR = limb(hip, 0, 0.42, 0.12, skin);
  thighR.position.z = -0.09;
  const shinL = limb(thighL, -0.42, 0.4, 0.1, skin);
  const shinR = limb(thighR, -0.42, 0.4, 0.1, skin);
  skins.push(...[thighL, thighR, shinL, shinR].map((g) => g.children[0] as THREE.Mesh));

  const body = new THREE.Group();
  body.position.y = 1;
  root.add(body);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, kind === "ada" || kind === "host" ? 0.32 : 0.36), shirt);
  torso.position.y = 0.22;
  torso.castShadow = true;
  body.add(torso);
  shirts.push(torso);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.42, 0.05), trim);
  stripe.position.set(-0.02, 0.22, 0);
  body.add(stripe);

  const armL = limb(body, 0.4, 0.3, 0.09, skin);
  armL.position.z = 0.24;
  const armR = limb(body, 0.4, 0.3, 0.09, skin);
  armR.position.z = -0.24;
  const foreL = limb(armL, -0.3, 0.26, 0.08, skin);
  const foreR = limb(armR, -0.3, 0.26, 0.08, skin);
  skins.push(...[armL, armR, foreL, foreR].map((g) => g.children[0] as THREE.Mesh));

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), skin);
  head.position.set(0.02, 0.62, 0);
  head.castShadow = true;
  body.add(head);
  skins.push(head);

  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), hair);
  hairMesh.position.set(-0.02, 0.72, 0);
  hairMesh.scale.set(1.05, 0.62, 1.05);
  body.add(hairMesh);
  hairs.push(hairMesh);
  if (kind === "ada" || kind === "host") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), hair);
    bun.position.set(-0.1, 0.64, 0);
    body.add(bun);
    hairs.push(bun);
  }

  const eyeMat = mat(0x1a120e, 0.35);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
  eyeL.position.set(0.08, 0.63, -0.09);
  const eyeR = eyeL.clone();
  eyeR.position.z = 0.09;
  body.add(eyeL, eyeR);

  if (kind === "cam") {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.12), mat(0x121820, 0.4, 0.45));
    box.position.set(0.16, 0.48, -0.12);
    body.add(box);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), mat(0x7fd0df, 0.15, 0.4, 0x1a4a55));
    lens.position.set(0.252, 0.48, -0.12);
    lens.rotation.y = Math.PI / 2;
    body.add(lens);
  }

  return { root, body, thighL, thighR, shinL, shinR, armL, armR, foreL, foreR, shirts, skins, hairs };
}

function paintRig(
  rig: Rig,
  kind: CastId,
  mat: (hex: number, rough?: number, metal?: number, emissive?: number) => THREE.MeshStandardMaterial,
) {
  const pal = PALETTE[kind];
  const skin = mat(pal.skin, 0.58);
  const shirt = mat(pal.shirt, 0.52);
  const hair = mat(pal.hair, 0.8);
  for (const mesh of rig.shirts) mesh.material = shirt;
  for (const mesh of rig.skins) mesh.material = skin;
  for (const mesh of rig.hairs) mesh.material = hair;
}

function buildGear(
  mat: (hex: number, rough?: number, metal?: number, emissive?: number) => THREE.MeshStandardMaterial,
) {
  const root = new THREE.Group();
  const metal = mat(0xd5dde6, 0.3, 0.65);
  const wood = mat(0xc48a62, 0.66, 0.04);
  const dark = mat(0x1c2428, 0.6, 0.18);
  const gold = mat(0xe2b657, 0.4, 0.18);

  const bike = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), metal);
  frame.position.set(0, 0.4, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), dark);
  seat.position.set(-0.12, 0.58, 0);
  const wheelGeo = new THREE.TorusGeometry(0.22, 0.04, 8, 16);
  const wheelL = new THREE.Mesh(wheelGeo, metal);
  wheelL.position.set(0.3, 0.22, 0);
  const wheelR = new THREE.Mesh(wheelGeo, metal);
  wheelR.position.set(-0.32, 0.22, 0);
  bike.add(frame, seat, wheelL, wheelR);

  const stilts = new THREE.Group();
  for (const z of [0.1, -0.1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.9, 8), wood);
    pole.position.set(0, -0.12, z);
    stilts.add(pole);
  }

  const pogo = new THREE.Group();
  const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), metal);
  spring.position.y = 0.2;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.14), dark);
  foot.position.y = -0.02;
  pogo.add(spring, foot);

  const mallet = new THREE.Group();
  mallet.position.set(0.05, 1.2, -0.26);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.06), wood);
  handle.position.x = 0.22;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.22), gold);
  head.position.set(0.52, 0, 0);
  mallet.add(handle, head);

  bike.visible = false;
  stilts.visible = false;
  pogo.visible = false;
  mallet.visible = false;
  root.add(bike, stilts, pogo, mallet);
  return { root, bike, stilts, pogo, spring, mallet, wheelL, wheelR };
}

function poseRig(
  rig: Rig,
  sim: Sim,
  who: "runner" | "host" | "cam",
  moving: boolean,
  airborne: boolean,
  style?: Sim["stage"]["style"],
) {
  const phase = who === "runner" ? sim.runner.runTime * (moving ? 2.4 : 1.05) : sim.age * (who === "host" ? 3.1 : 2.3);
  const s = Math.sin(phase * Math.PI * 2);
  let thighL = moving ? 0.85 * s : 0.05;
  let thighR = moving ? -0.85 * s : -0.05;
  let kneeL = moving ? 0.08 + Math.max(0, -s) * 1.35 : 0.15;
  let kneeR = moving ? 0.08 + Math.max(0, s) * 1.35 : 0.15;
  let armL = moving ? -0.85 * s : 0.2;
  let armR = moving ? 0.85 * s : -0.15;
  if (airborne) {
    thighL = -0.95;
    thighR = -0.95;
    kneeL = 1.25;
    kneeR = 1.25;
    armL = -0.35;
    armR = 0.45;
  }
  if (who === "runner" && style === "hands" && !airborne) {
    armL = -0.35 + (moving ? -0.75 * s : 0);
    armR = 0.35 + (moving ? 0.75 * s : 0);
  }
  const sliding = who === "runner" && sim.runner.slideT > 0 && sim.runner.grounded && !airborne;
  if (sliding) {
    thighL = 1.15;
    thighR = 1.15;
    kneeL = 1.35;
    kneeR = 1.35;
    armL = 0.9;
    armR = 0.9;
  }
  if (who === "host") {
    const clap = Math.abs(Math.sin(sim.age * (5 + sim.clap * 8)));
    armL = -0.7 + clap * 0.55;
    armR = 0.7 - clap * 0.55;
    thighL = 0.04;
    thighR = -0.02;
    kneeL = 0.2;
    kneeR = 0.2;
  }
  rig.thighL.rotation.z = thighL;
  rig.thighR.rotation.z = thighR;
  rig.shinL.rotation.z = -kneeL;
  rig.shinR.rotation.z = -kneeR;
  rig.armL.rotation.z = armL;
  rig.armR.rotation.z = armR;
  rig.foreL.rotation.z = who === "host" ? -0.6 : -0.5;
  rig.foreR.rotation.z = who === "host" ? -0.6 : -0.5;
  const squash = who === "runner" ? sim.runner.squash : 0;
  const lean = sliding ? -1.2 : who === "runner" && style === "hands" ? -0.22 : who === "runner" && moving ? -0.1 : 0;
  rig.body.rotation.z = lean;
  rig.body.scale.set(1 - squash * 0.35, 1 + squash, 1);
  rig.body.position.y = sliding ? 0.42 : 1 + (airborne ? 0.03 : 0);
}

function nearbyCeiling(stage: Stage, x: number) {
  let top = 0;
  for (const solid of stage.solids) {
    if (solid.x + solid.w < x - 40 || solid.x > x + 160) continue;
    top = Math.max(top, wy(solid.y));
  }
  for (const hurdle of stage.hurdles) {
    if (!hurdle.over) continue;
    if (hurdle.x < x - 20 || hurdle.x > x + 140) continue;
    top = Math.max(top, wy(hurdle.y) + 0.35);
  }
  return top;
}

function jumpChevrons(course: THREE.Group, x: number, y: number, material: THREE.Material, z = 0) {
  for (let i = 0; i < 3; i++) {
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.07), material);
    left.position.set(x - i * 0.4, y, z - 0.11);
    left.rotation.y = -0.55;
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.07), material);
    right.position.set(x - i * 0.4, y, z + 0.11);
    right.rotation.y = 0.55;
    course.add(left, right);
  }
}
