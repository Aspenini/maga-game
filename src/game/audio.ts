class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private muted = false;
  private lastMusicAt = 0;
  private musicStep = 0;

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.2;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.2, this.context.currentTime, 0.02);
    }
  }

  jump(): void {
    this.tone(420, 760, 0.1, "square", 0.3);
  }

  collect(kind: "token" | "file" | "signal"): void {
    const frequencies = kind === "token" ? [660, 880] : kind === "file" ? [520, 780] : [440, 660, 990];
    frequencies.forEach((frequency, index) =>
      this.tone(frequency, frequency * 1.06, 0.08, "square", 0.22, index * 0.045),
    );
  }

  stomp(): void {
    this.tone(180, 90, 0.14, "sawtooth", 0.34);
  }

  shield(): void {
    this.tone(980, 240, 0.24, "triangle", 0.3);
  }

  hit(): void {
    this.tone(220, 54, 0.42, "sawtooth", 0.4);
  }

  start(): void {
    [330, 440, 660].forEach((frequency, index) =>
      this.tone(frequency, frequency, 0.12, "square", 0.22, index * 0.07),
    );
  }

  tickMusic(elapsedMs: number): void {
    if (!this.context || this.muted || elapsedMs - this.lastMusicAt < 360) return;
    this.lastMusicAt = elapsedMs;
    const notes = [110, 165, 147, 220, 110, 196, 165, 247];
    const frequency = notes[this.musicStep % notes.length]!;
    this.musicStep += 1;
    this.tone(frequency, frequency, 0.09, "square", 0.08);
  }

  private tone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (!this.context || !this.master || this.muted) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

export const gameAudio = new GameAudio();
