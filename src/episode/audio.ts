// Original procedural Foley. No remote streams or unlicensed recordings.
export class Foley {
  context?: AudioContext;
  master?: GainNode;
  private noise?: AudioBuffer;
  private drone?: OscillatorNode;
  private ambience?: AudioBufferSourceNode;
  private active = false;
  volume = .65;
  start() {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
      this.master.gain.value = this.volume;
      this.noise = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
      const data = this.noise.getChannelData(0); let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * .04) / 1.025; data[i] = last * 3; }
      this.ambience = this.context.createBufferSource(); this.ambience.buffer = this.noise; this.ambience.loop = true;
      const low = this.context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 260;
      const gain = this.context.createGain(); gain.gain.value = .045;
      this.ambience.connect(low).connect(gain).connect(this.master); this.ambience.start();
      this.drone = this.context.createOscillator(); this.drone.frequency.value = 47;
      const hum = this.context.createGain(); hum.gain.value = .012; this.drone.connect(hum).connect(this.master); this.drone.start();
    }
    this.active = true; void this.context.resume();
  }
  pause(paused: boolean) { this.active = !paused; if (this.context) void (paused ? this.context.suspend() : this.context.resume()); }
  setVolume(v: number) { this.volume = v; if (this.master && this.context) this.master.gain.setTargetAtTime(v, this.context.currentTime, .08); }
  play(kind: 'step' | 'key' | 'door' | 'paper' | 'scrape' | 'cut' | 'click' | 'land') {
    if (!this.active || !this.context || !this.master || !this.noise) return;
    const c = this.context; const now = c.currentTime;
    const source = c.createBufferSource(); source.buffer = this.noise;
    const filter = c.createBiquadFilter(); filter.type = kind === 'key' ? 'highpass' : 'lowpass';
    filter.frequency.value = { step: 480, key: 2200, door: 260, paper: 3500, scrape: 650, cut: 1600, click: 1800, land: 160 }[kind];
    const gain = c.createGain(); const duration = { step: .16, key: .4, door: 1.1, paper: .35, scrape: .7, cut: .5, click: .06, land: .3 }[kind];
    gain.gain.setValueAtTime(.001, now); gain.gain.linearRampToValueAtTime(kind === 'scrape' ? .55 : .32, now + .02); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter).connect(gain).connect(this.master); source.start(now, Math.random()); source.stop(now + duration);
    if (kind === 'door' || kind === 'key') {
      const osc = c.createOscillator(); const g = c.createGain(); osc.type = 'triangle'; osc.frequency.setValueAtTime(kind === 'door' ? 130 : 1900, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'door' ? 53 : 900, now + duration); g.gain.setValueAtTime(.045, now); g.gain.exponentialRampToValueAtTime(.001, now + duration);
      osc.connect(g).connect(this.master); osc.start(); osc.stop(now + duration);
    }
  }
  dispose() { this.ambience?.stop(); this.drone?.stop(); void this.context?.close(); }
}
