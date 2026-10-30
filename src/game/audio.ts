export type SfxId = "move" | "hit" | "pickup" | "ui" | "explosion" | "win" | "lose" | "paper" | "door" | "locked" | "step" | "fuse";

export interface AudioVolumes { master: number; music: number; effects: number; muted: boolean }

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private drones: OscillatorNode[] = [];
  private disposed = false;
  private volumes: AudioVolumes = { master: 0.72, music: 0.42, effects: 0.78, muted: false };
  private threat = 0;

  private readonly unlock = () => { this.ensureCtx(); this.detachUnlock(); };

  constructor() {
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
  }

  private detachUnlock(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.effectsBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.effectsBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolumes(patch: Partial<AudioVolumes>): void {
    this.volumes = { ...this.volumes, ...patch };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.effectsBus) return;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, this.ctx.currentTime, 0.03);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, this.ctx.currentTime, 0.03);
    this.effectsBus.gain.setTargetAtTime(this.volumes.effects, this.ctx.currentTime, 0.03);
  }

  setThreat(value: number): void { this.threat = Math.max(0, Math.min(1, value)); }

  sfx(id: SfxId): void {
    if (this.disposed || this.volumes.muted) return;
    const ctx = this.ensureCtx();
    if (!this.effectsBus) return;
    const t = ctx.currentTime;
    const spec: Record<SfxId, [OscillatorType, number, number, number, number]> = {
      move: ["triangle", 180, 120, 0.08, 0.08], hit: ["square", 150, 45, 0.18, 0.24],
      pickup: ["sine", 620, 1120, 0.16, 0.2], ui: ["sine", 390, 520, 0.05, 0.11],
      explosion: ["sawtooth", 100, 25, 0.45, 0.3], win: ["sine", 440, 1046, 0.65, 0.24],
      lose: ["sawtooth", 180, 34, 0.8, 0.32], paper: ["triangle", 820, 250, 0.11, 0.07],
      door: ["sawtooth", 110, 48, 0.55, 0.13], locked: ["square", 95, 70, 0.12, 0.12],
      step: ["triangle", 105, 55, 0.075, 0.07], fuse: ["square", 180, 640, 0.22, 0.12],
    };
    const [type, f0, f1, dur, gainValue] = spec[id];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = id === "paper" ? 2400 : 1300;
    osc.type = type; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(gainValue, t); gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter).connect(gain).connect(this.effectsBus);
    osc.start(t); osc.stop(t + dur);
  }

  startMusic(): void {
    if (this.disposed || this.drones.length) return;
    const ctx = this.ensureCtx();
    if (!this.musicBus) return;
    for (const [frequency, type, volume] of [[43.65, "sine", 0.07], [65.41, "triangle", 0.022], [87.31, "sine", 0.012]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = type; osc.frequency.value = frequency;
      filter.type = "lowpass"; filter.frequency.value = 240;
      gain.gain.value = volume;
      osc.connect(filter).connect(gain).connect(this.musicBus);
      osc.start(); this.drones.push(osc);
    }
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.11; lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(this.musicBus.gain); lfo.start(); this.drones.push(lfo);
  }

  updateMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    const target = this.volumes.music * (1 + this.threat * 0.35);
    this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
  }

  stopMusic(): void {
    for (const drone of this.drones) { try { drone.stop(); } catch { /* already stopped */ } }
    this.drones = [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.detachUnlock(); this.stopMusic();
    const ctx = this.ctx; this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }
}
