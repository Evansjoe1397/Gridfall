type FrameWork = { hudMs: number; renderMs: number; programCount: number; programGrowth: number };

/** Bounded CPU timings; render submission time is not asynchronous GPU time. */
export class FrameWorkProfiler {
  private samples: FrameWork[] = [];
  private next = 0;
  private growthFrames = 0;
  private lastGrowth?: FrameWork;
  private peakHudMs = 0;
  private peakRenderMs = 0;

  reset() {
    this.samples = []; this.next = this.growthFrames = 0;
    this.lastGrowth = undefined; this.peakHudMs = this.peakRenderMs = 0;
  }

  record(hudMs: number, renderMs: number, programsBefore: number, programsAfter: number) {
    const sample = { hudMs, renderMs, programCount: programsAfter, programGrowth: Math.max(0, programsAfter - programsBefore) };
    if (this.samples.length < 600) this.samples.push(sample);
    else { this.samples[this.next] = sample; this.next = (this.next + 1) % 600; }
    this.peakHudMs = Math.max(this.peakHudMs, hudMs);
    this.peakRenderMs = Math.max(this.peakRenderMs, renderMs);
    if (sample.programGrowth) { this.growthFrames++; this.lastGrowth = sample; }
    return sample;
  }

  snapshot() {
    const round = (value: number) => Math.round(value * 100) / 100;
    const times = (field: 'hudMs' | 'renderMs') => {
      const values = this.samples.map(sample => sample[field]).sort((a, b) => a - b);
      return { p95Ms: round(values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0), maxMs: round(values.at(-1) ?? 0) };
    };
    return { sampleCount: this.samples.length, hud: times('hudMs'), renderSubmission: times('renderMs'), growthFrames: this.growthFrames,
      peakHudMs: round(this.peakHudMs), peakRenderSubmissionMs: round(this.peakRenderMs),
      lastGrowth: this.lastGrowth && { programs: this.lastGrowth.programCount, added: this.lastGrowth.programGrowth, renderMs: round(this.lastGrowth.renderMs) } };
  }
}
