type FrameWork = { hudMs: number; renderMs: number; programCount: number; programGrowth: number };
type LongFrame = PerformanceEntry & { scripts?: { forcedStyleAndLayoutDuration?: number; sourceFunctionName?: string }[] };

/** Bounded CPU timings; render submission time is not asynchronous GPU time. */
export class FrameWorkProfiler {
  private samples: FrameWork[] = [];
  private next = 0;
  private growthFrames = 0;
  private lastGrowth?: FrameWork;
  private peakHudMs = 0;
  private peakRenderMs = 0;
  private epoch = 0;
  private longFrames = { supported: false, count: 0, maxMs: 0, maxForcedStyleLayoutMs: 0 };

  reset() {
    this.samples = []; this.next = this.growthFrames = 0;
    this.lastGrowth = undefined; this.peakHudMs = this.peakRenderMs = 0;
    this.epoch = performance.now();
    this.longFrames = { supported: this.longFrames.supported, count: 0, maxMs: 0, maxForcedStyleLayoutMs: 0 };
  }

  recordLongFrame(frame: Pick<LongFrame, 'duration' | 'scripts'>) {
    let forcedMs = 0, worstScriptMs = 0, sourceFunction = '';
    for (const script of frame.scripts ?? []) {
      const ms = Math.max(0, Number.isFinite(script.forcedStyleAndLayoutDuration) ? script.forcedStyleAndLayoutDuration! : 0);
      forcedMs += ms;
      if (ms > worstScriptMs) { worstScriptMs = ms; sourceFunction = (script.sourceFunctionName ?? '').slice(0, 120); }
    }
    this.longFrames.count++;
    this.longFrames.maxMs = Math.max(this.longFrames.maxMs, frame.duration);
    this.longFrames.maxForcedStyleLayoutMs = Math.max(this.longFrames.maxForcedStyleLayoutMs, forcedMs);
    return { durationMs: Math.round(frame.duration * 100) / 100, forcedStyleAndLayoutMs: Math.round(forcedMs * 100) / 100, sourceFunction };
  }

  observeLongFrames(enabled: () => boolean, report: (frame: ReturnType<FrameWorkProfiler['recordLongFrame']>) => void) {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) return;
    const observer = new PerformanceObserver(list => {
      if (!enabled()) return;
      for (const entry of list.getEntries()) {
        if (entry.startTime >= this.epoch) report(this.recordLongFrame(entry as LongFrame));
      }
    });
    try {
      observer.observe({ type: 'long-animation-frame' });
      this.longFrames.supported = true;
    } catch { observer.disconnect(); }
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
      longFrames: { ...this.longFrames, maxMs: round(this.longFrames.maxMs), maxForcedStyleLayoutMs: round(this.longFrames.maxForcedStyleLayoutMs) },
      lastGrowth: this.lastGrowth && { programs: this.lastGrowth.programCount, added: this.lastGrowth.programGrowth, renderMs: round(this.lastGrowth.renderMs) } };
  }
}
