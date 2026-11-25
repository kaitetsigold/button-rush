type Bus = {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
};

export type Sfx = {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  jump: () => void;
  land: () => void;
  stumble: () => void;
  foot: () => void;
  stamp: () => void;
  clap: () => void;
};

export function createSfx(): Sfx {
  let bus: Bus | null = null;
  let muted = false;

  function unlock() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!bus) {
      const ctx = new AC();
      const master = ctx.createGain();
      const sfx = ctx.createGain();
      master.gain.value = 0.9;
      sfx.gain.value = 0.8;
      sfx.connect(master);
      master.connect(ctx.destination);
      bus = { ctx, master, sfx };
    }
    if (bus.ctx.state === "suspended") void bus.ctx.resume();
  }

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slide = 0,
  ) {
    if (!bus || muted) return;
    const { ctx, sfx } = bus;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(sfx);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  function noise(dur: number, gain: number) {
    if (!bus || muted) return;
    const { ctx, sfx } = bus;
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(sfx);
    src.start();
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  return {
    unlock,
    setMuted(next) {
      muted = next;
      if (bus) bus.master.gain.setTargetAtTime(next ? 0 : 0.9, bus.ctx.currentTime, 0.02);
    },
    jump() {
      tone(220, 0.12, "square", 0.08, 180);
    },
    land() {
      noise(0.08, 0.15);
      tone(90, 0.07, "sine", 0.08);
    },
    stumble() {
      noise(0.12, 0.22);
      tone(140, 0.16, "sawtooth", 0.05, -80);
    },
    foot() {
      noise(0.04, 0.06);
    },
    stamp() {
      tone(523, 0.18, "triangle", 0.1);
      tone(659, 0.22, "triangle", 0.08);
      tone(784, 0.32, "triangle", 0.07);
      noise(0.2, 0.12);
    },
    clap() {
      noise(0.05, 0.08);
    },
  };
}
