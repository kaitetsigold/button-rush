import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  createAttract,
  createSim,
  obstacleProgress,
  stageMinMs,
  step,
  TIER_IDS,
  TIER_LABEL,
  type CastId,
  type Input,
  type Phase,
  type Sim,
} from "@/game/course";
import { createStadiumView, type StadiumView } from "@/game/view3d";
import { formatSeconds, formatTime } from "@/game/format";
import { createSfx, type Sfx } from "@/game/sfx";
import { listBoard, startAttempt, submitRun, type BoardRow } from "@/lib/leaderboard";

type Snap = {
  phase: Phase;
  clock: number;
  label: string;
  name: string;
  tip: string;
  index: number;
  progress: number;
  splits: number[];
  deaths: number;
  cast: CastId;
};

type Gesture = { x: number; y: number; decided: boolean; jumped: boolean };

type Pulse = { left: number; right: number; slide: number; jump: number };

const CAST_META: { id: CastId; name: string; line: string }[] = [
  { id: "kofi", name: "Kofi", line: "Ivory kit, gold stripe" },
  { id: "ada", name: "Ada", line: "Crimson kit, braided bun" },
];

const SWIPE = 32;

function emptySnap(cast: CastId): Snap {
  const sim = createAttract(cast);
  return readSnap(sim);
}

function readSnap(sim: Sim): Snap {
  const mark = sim.stage.marks[sim.mark];
  return {
    phase: sim.phase,
    clock: sim.clock,
    label: sim.phase === "done" ? "Finish" : sim.stage.label,
    name: mark?.name ?? "",
    tip: mark?.tip ?? "",
    index: sim.mark,
    progress: obstacleProgress(sim),
    splits: sim.splits.slice(),
    deaths: sim.deaths,
    cast: sim.cast,
  };
}

function cleanTag(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

function tagOk(raw: string) {
  const tag = cleanTag(raw);
  return tag.length >= 2 && tag.length <= 14 && /^[A-Za-z0-9 ]+$/.test(tag);
}

function emptyPulse(): Pulse {
  return { left: 0, right: 0, slide: 0, jump: 0 };
}

export function Gauntlet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim>(createAttract("kofi"));
  const keysRef = useRef<Set<string>>(new Set());
  const gesturesRef = useRef<Map<number, Gesture>>(new Map());
  const pulseRef = useRef<Pulse>(emptyPulse());
  const steerRef = useRef(0);
  const sfxRef = useRef<Sfx | null>(null);
  const attemptRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const sentRef = useRef(false);
  const mutedRef = useRef(false);
  const [cast, setCast] = useState<CastId>("kofi");
  const [tag, setTag] = useState("Runner");
  const [tagError, setTagError] = useState("");
  const [snap, setSnap] = useState<Snap>(() => emptySnap("kofi"));
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [boardError, setBoardError] = useState("");
  const [rankMsg, setRankMsg] = useState("");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let dead = false;
    listBoard()
      .then((rows) => {
        if (!dead) setBoard(rows);
      })
      .catch(() => {
        if (!dead) setBoardError("The board is waking up. You can still run.");
      });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view: StadiumView = createStadiumView(canvas);
    sfxRef.current = createSfx();
    const sfx = sfxRef.current;
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    let wasGrounded = true;
    let prevDeaths = 0;
    let prevPhase: Phase = "attract";
    let foot = 0;

    let prevX = simRef.current.runner.x;
    let prevY = simRef.current.runner.y;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      const sim = simRef.current;
      const keys = keysRef.current;
      const keyJump = keys.has("Space") || keys.has("KeyW") || keys.has("ArrowUp");
      const keyLeft = keys.has("KeyA") || keys.has("ArrowLeft");
      const keyRight = keys.has("KeyD") || keys.has("ArrowRight");
      const keySlide = keys.has("KeyS") || keys.has("ArrowDown");
      const steer = steerRef.current;
      const holdingJump = [...gesturesRef.current.values()].some((g) => g.jumped);
      while (acc >= 1 / 60) {
        const pulse = pulseRef.current;
        let tapLeft = false;
        let tapRight = false;
        if (!keyLeft && !keyRight) {
          if (pulse.left > 0) {
            tapLeft = true;
            pulse.left -= 1;
          } else if (pulse.right > 0) {
            tapRight = true;
            pulse.right -= 1;
          }
        }
        const tapSlide = pulse.slide > 0;
        if (tapSlide) pulse.slide -= 1;
        const tapJump = pulse.jump > 0;
        if (tapJump) pulse.jump -= 1;
        const input: Input = {
          left: keyLeft || steer > 0.35 || tapLeft,
          right: keyRight || steer < -0.35 || tapRight,
          jump: keyJump || holdingJump || tapJump,
          slide: keySlide || tapSlide,
        };
        prevX = sim.runner.x;
        prevY = sim.runner.y;
        const groundedBefore = sim.runner.grounded;
        const phaseBefore = sim.phase;
        step(sim, input, 1 / 60);
        if (groundedBefore && !sim.runner.grounded && sim.runner.vy < 0 && phaseBefore === "play") sfx.jump();
        if (!wasGrounded && sim.runner.grounded && sim.phase === "play") sfx.land();
        wasGrounded = sim.runner.grounded;
        if (sim.deaths > prevDeaths) sfx.stumble();
        prevDeaths = sim.deaths;
        if (phaseBefore === "play" && sim.phase === "stamp") sfx.stamp();
        if (sim.phase === "play" && sim.runner.grounded && Math.abs(sim.runner.vx) > 80) {
          const stepIndex = Math.floor(sim.runner.runTime * 2.2);
          if (stepIndex !== foot) {
            foot = stepIndex;
            sfx.foot();
          }
        }
        acc -= 1 / 60;
      }
      const alpha = acc / (1 / 60);
      view.frame(sim, alpha, prevX, prevY);
      const phaseChanged = sim.phase !== prevPhase;
      prevPhase = sim.phase;
      if (phaseChanged || now - lastUi > 100) {
        lastUi = now;
        setSnap(readSnap(sim));
      }
    };
    frame = requestAnimationFrame(loop);

    const probe = {
      getYaw: () => -simRef.current.runner.laneZ,
      getSpeed: () => simRef.current.runner.vx,
      getX: () => simRef.current.runner.x,
      getY: () => simRef.current.runner.y,
      getH: () => simRef.current.runner.h,
      getLane: () => simRef.current.runner.lane,
      setKeys: (codes: string[]) => {
        keysRef.current = new Set(codes);
      },
      setSteer: (v: number) => {
        steerRef.current = v;
      },
    };
    window.__controlsTest = probe;

    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      keysRef.current.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }
      sfx.unlock();
    };
    const up = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    const blur = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const onVis = () => {
      if (document.visibilityState !== "visible") keysRef.current.clear();
      else sfx.unlock();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", onVis);
      if (window.__controlsTest === probe) delete window.__controlsTest;
      view.dispose();
    };
  }, []);

  function unlock() {
    sfxRef.current?.unlock();
  }

  function clearGestures() {
    gesturesRef.current.clear();
    pulseRef.current = emptyPulse();
    steerRef.current = 0;
  }

  function swipeStart(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea")) return;
    event.preventDefault();
    unlock();
    gesturesRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      decided: false,
      jumped: false,
    });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic QA events have no pointer to capture. Real touches still capture.
    }
  }

  function swipeMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gesturesRef.current.get(event.pointerId);
    if (!gesture || gesture.decided) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (dx * dx + dy * dy < SWIPE * SWIPE) return;
    gesture.decided = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) pulseRef.current.left += 1;
      else pulseRef.current.right += 1;
    } else if (dy < 0) {
      gesture.jumped = true;
      pulseRef.current.jump += 1;
    } else {
      pulseRef.current.slide += 1;
    }
  }

  function swipeEnd(event: ReactPointerEvent<HTMLDivElement>) {
    gesturesRef.current.delete(event.pointerId);
  }

  function pick(next: CastId) {
    setCast(next);
    if (simRef.current.phase === "attract") simRef.current.cast = next;
  }

  function begin() {
    unlock();
    const name = cleanTag(tag);
    if (!tagOk(name)) {
      setTagError("Use 2–14 letters, numbers, or spaces.");
      return;
    }
    setTagError("");
    setRankMsg("");
    sentRef.current = false;
    keysRef.current.clear();
    clearGestures();
    attemptRef.current = startAttempt()
      .then((res) => res.id)
      .catch(() => null);
    const sim = createSim(0, cast);
    sim.phase = "play";
    simRef.current = sim;
    setSnap(readSnap(sim));
  }

  useEffect(() => {
    if (snap.phase !== "done" || sentRef.current) return;
    sentRef.current = true;
    const sim = simRef.current;
    const times = TIER_IDS.map((_, i) => Math.round((sim.splits[i] ?? 0) * 1000));
    if (times.some((ms, i) => ms < stageMinMs(TIER_IDS[i] ?? "hand"))) {
      setRankMsg("That finish was faster than the course allows, so it stays off the board.");
      return;
    }
    void (async () => {
      const attemptId = await attemptRef.current;
      if (!attemptId) {
        setRankMsg("The board didn't open. Your time is still on this screen.");
        return;
      }
      try {
        const result = await submitRun({
          data: {
            attemptId,
            tag: cleanTag(tag),
            easyMs: times[0] ?? 0,
            midMs: times[1] ?? 0,
            hardMs: times[2] ?? 0,
            riderMs: times[3] ?? 0,
            darumaMs: times[4] ?? 0,
          },
        });
        setBoard(result.board);
        setRankMsg(
          result.rank <= 30
            ? `All-time #${result.rank}. The board keeps the fastest 30 finishes.`
            : `Finish #${result.rank}. Only the fastest 30 stay on the board.`,
        );
      } catch (error) {
        setRankMsg(error instanceof Error ? error.message : "The board refused this time.");
      }
    })();
  }, [snap.phase, tag]);

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    sfxRef.current?.setMuted(next);
    unlock();
  }

  const showRun = snap.phase === "attract";
  const showResults = snap.phase === "done";
  const showPlay = snap.phase === "play" || snap.phase === "stamp";
  const jumpHint =
    snap.label === "Daruma 7"
      ? " Jump when the bottom block flashes."
      : snap.label === "Kangaroo"
        ? " Hold the upward swipe to keep bouncing."
        : " Swipe up and hold to jump higher. Swipe down to slide.";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3">
        {showRun || showResults ? (
          <p className="font-display text-sm tracking-widest text-gold">BUTTON RUSH</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-fg"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      </div>

      {showPlay ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-30 px-3">
          <div className="flex items-baseline justify-between">
            <span className="font-display tracking-wide text-gold">{snap.label}</span>
            <span className="text-sm text-fg">
              {snap.index + 1}/9 {snap.name}
            </span>
          </div>
          <p className="text-center font-display text-4xl leading-none tabular-nums">{formatSeconds(snap.clock)}</p>
          <p className="mt-1 text-center text-sm text-muted">
            {snap.tip}
            {jumpHint}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full w-full origin-left bg-gold" style={{ transform: `scaleX(${snap.progress})` }} />
          </div>
        </div>
      ) : null}

      {snap.phase === "stamp" ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4">
          <div className="rounded-lg border border-line bg-surface px-6 py-4 text-center">
            <p className="font-display text-3xl text-gold">{snap.label.toUpperCase()} CLEAR</p>
            <p className="mt-1 text-sm text-muted">
              {snap.label === "Daruma 7" ? "That's the gauntlet." : "Next course starts now."}
            </p>
          </div>
        </div>
      ) : null}

      {showRun ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 max-h-full overflow-y-auto">
          <div className="pointer-events-auto mx-auto flex w-full max-w-lg flex-col gap-3 p-4 pb-safe">
            <div className="rounded-lg border border-line bg-surface/95 p-4 backdrop-blur-sm">
              <p className="text-xs tracking-widest text-gold">STADIUM GAUNTLET</p>
              <h1 className="font-display text-5xl leading-none">BUTTON RUSH</h1>
              <p className="mt-2 text-sm text-muted">
                Five courses, nine obstacles each. Hand Walk, then Kangaroo, Bamboo Derby, Super Rider, and Daruma 7. No choosing. The clock is your rank. Fastest 30 finishes stay up, and the board never resets.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {CAST_META.map((person) => {
                  const on = cast === person.id;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => pick(person.id)}
                      className={`rounded-md border px-3 py-3 text-left ${on ? "border-gold bg-surface-2" : "border-line bg-bg"}`}
                      aria-pressed={on}
                    >
                      <span className="block font-display text-xl">{person.name}</span>
                      <span className="block text-sm text-muted">{person.line}</span>
                    </button>
                  );
                })}
              </div>
              <label className="mt-3 block text-sm text-muted" htmlFor="runner-name">
                Name on the board
              </label>
              <input
                id="runner-name"
                value={tag}
                maxLength={14}
                autoComplete="nickname"
                onChange={(event) => setTag(event.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-fg"
              />
              {tagError ? <p className="mt-1 text-sm text-red">{tagError}</p> : null}
              <button
                type="button"
                onClick={begin}
                className="mt-3 h-12 w-full rounded-md bg-gold font-display text-lg tracking-wide text-bg"
              >
                Run the gauntlet
              </button>
              <p className="mt-2 text-xs text-muted">
                The runner keeps going. Swipe left or right to steer, up to jump, down to slide. On a keyboard, A and D steer, W or Space jumps, S slides.
              </p>
            </div>
            <Board board={board} error={boardError} />
          </div>
        </div>
      ) : null}

      {showResults ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 max-h-full overflow-y-auto">
          <div className="pointer-events-auto mx-auto flex w-full max-w-lg flex-col gap-3 p-4 pb-safe">
            <div className="rounded-lg border border-line bg-surface/95 p-4">
              <p className="text-xs tracking-widest text-gold">FULL GAUNTLET</p>
              <p className="font-display text-5xl leading-none tabular-nums">{formatSeconds(snap.clock)}</p>
              <p className="mt-1 text-sm text-muted">{rankMsg || "Posting your finish…"}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {TIER_IDS.map((id, i) => (
                  <li key={id} className="flex justify-between border-b border-line py-1">
                    <span>{TIER_LABEL[id]}</span>
                    <span className="tabular-nums">{formatSeconds(snap.splits[i] ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Falls cost time. They are not a separate score. {snap.deaths} this run.</p>
              <button
                type="button"
                onClick={begin}
                className="mt-3 h-12 w-full rounded-md bg-gold font-display text-lg tracking-wide text-bg"
              >
                Run again
              </button>
            </div>
            <Board board={board} error={boardError} highlight={cleanTag(tag)} />
          </div>
        </div>
      ) : null}

      {showPlay ? (
        <>
          <div
            className="absolute inset-0 z-20 touch-none"
            data-swipe="1"
            onPointerDown={swipeStart}
            onPointerMove={swipeMove}
            onPointerUp={swipeEnd}
            onPointerCancel={swipeEnd}
            onLostPointerCapture={swipeEnd}
          />
          <p className="pointer-events-none absolute inset-x-0 bottom-3 z-30 px-4 pb-safe text-center text-xs text-muted">
            Runs on its own. Swipe left or right to steer, up to jump, down to slide.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Board({
  board,
  error,
  highlight,
}: {
  board: BoardRow[] | null;
  error: string;
  highlight?: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface/95 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl">Top 30</h2>
        <p className="text-xs text-muted">All-time. Never resets.</p>
      </div>
      {error ? <p className="mt-2 text-sm text-muted">{error}</p> : null}
      {board === null && !error ? <p className="mt-2 text-sm text-muted">Loading the board…</p> : null}
      {board && board.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No finishes yet. The first name on this board could be yours.</p>
      ) : null}
      <ol className="mt-2 max-h-52 overflow-y-auto">
        {board?.map((row, index) => {
          const mine = highlight && row.tag === highlight;
          return (
            <li key={row.id} className={`border-b border-line py-1.5 ${mine ? "text-gold" : ""}`}>
              <div className="flex items-baseline gap-2">
                <span className="w-6 font-display text-gold">{index + 1}</span>
                <span className="flex-1 truncate">{row.tag}</span>
                <span className="font-display tabular-nums">{formatTime(row.totalMs)}</span>
              </div>
              <p className="pl-8 text-xs text-muted tabular-nums">
                Hand {formatTime(row.easyMs)} · Roo {formatTime(row.midMs)} · Derby {formatTime(row.hardMs)} · Rider {formatTime(row.riderMs)} · Daruma {formatTime(row.darumaMs)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getX: () => number;
      getY: () => number;
      getH: () => number;
      getLane: () => number;
      setKeys: (codes: string[]) => void;
      setSteer: (v: number) => void;
    };
  }
}
