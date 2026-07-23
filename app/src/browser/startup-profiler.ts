/**
 * Startup Performance Profiler
 * Instruments Mailspring startup with high-resolution timing
 */

interface TimemarkEntry {
  label: string;
  time: number;
  delta?: number;
}

class StartupProfiler {
  private startTime: number;
  private marks: TimemarkEntry[] = [];
  private profilingEnabled: boolean;

  constructor(profilingEnabled = true) {
    this.profilingEnabled = profilingEnabled;
    this.startTime = Date.now();
    if (this.profilingEnabled) {
      this.mark('startup-profiler-initialized', this.startTime);
    }
  }

  mark(label: string, timestamp?: number): void {
    if (!this.profilingEnabled) return;

    const time = timestamp || Date.now();
    const delta = this.marks.length > 0 ? time - this.marks[this.marks.length - 1].time : 0;

    this.marks.push({ label, time, delta });

    // Log immediately for real-time feedback
    const elapsed = time - this.startTime;
    if (delta > 0) {
      console.log(`[PROFILE] T+${elapsed}ms (+${delta}ms): ${label}`);
    } else {
      console.log(`[PROFILE] T+${elapsed}ms: ${label}`);
    }
  }

  section(sectionName: string): SectionProfiler {
    return new SectionProfiler(sectionName, this);
  }

  async profileAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.profilingEnabled) return fn();

    this.mark(`${label} (start)`);
    try {
      const result = await fn();
      this.mark(`${label} (complete)`);
      return result;
    } catch (err) {
      this.mark(`${label} (error: ${err instanceof Error ? err.message : String(err)})`);
      throw err;
    }
  }

  profileSync<T>(label: string, fn: () => T): T {
    if (!this.profilingEnabled) return fn();

    this.mark(`${label} (start)`);
    try {
      const result = fn();
      this.mark(`${label} (complete)`);
      return result;
    } catch (err) {
      this.mark(`${label} (error: ${err instanceof Error ? err.message : String(err)})`);
      throw err;
    }
  }

  summary(): void {
    if (!this.profilingEnabled || this.marks.length === 0) return;

    console.log('\n' + '='.repeat(70));
    console.log('STARTUP PROFILER SUMMARY');
    console.log('='.repeat(70));

    for (const mark of this.marks) {
      const elapsed = mark.time - this.startTime;
      const deltaStr = mark.delta ? ` (${mark.delta}ms since last)` : '';
      console.log(`T+${elapsed}ms${deltaStr}: ${mark.label}`);
    }

    const totalTime = this.marks[this.marks.length - 1].time - this.startTime;
    console.log('='.repeat(70));
    console.log(`Total startup time: ${totalTime}ms`);
    console.log('='.repeat(70) + '\n');
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }
}

class SectionProfiler {
  private sectionName: string;
  private parent: StartupProfiler;
  private startTime: number;

  constructor(sectionName: string, parent: StartupProfiler) {
    this.sectionName = sectionName;
    this.parent = parent;
    this.startTime = Date.now();
    this.parent.mark(`${sectionName} (start)`);
  }

  mark(label: string): void {
    this.parent.mark(`${this.sectionName}: ${label}`);
  }

  end(): number {
    const duration = Date.now() - this.startTime;
    this.parent.mark(`${this.sectionName} (complete: ${duration}ms)`);
    return duration;
  }

  async profileAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.mark(`${label} (start)`);
    try {
      const result = await fn();
      this.mark(`${label} (complete)`);
      return result;
    } catch (err) {
      this.mark(`${label} (error: ${err instanceof Error ? err.message : String(err)})`);
      throw err;
    }
  }

  profileSync<T>(label: string, fn: () => T): T {
    this.mark(`${label} (start)`);
    try {
      const result = fn();
      this.mark(`${label} (complete)`);
      return result;
    } catch (err) {
      this.mark(`${label} (error: ${err instanceof Error ? err.message : String(err)})`);
      throw err;
    }
  }
}

// Export as singleton
let globalProfiler: StartupProfiler | null = null;

export function initProfiler(enabled = true): StartupProfiler {
  if (!globalProfiler) {
    globalProfiler = new StartupProfiler(enabled);
  }
  return globalProfiler;
}

export function getProfiler(): StartupProfiler {
  if (!globalProfiler) {
    globalProfiler = new StartupProfiler(false);
  }
  return globalProfiler;
}

export { StartupProfiler, SectionProfiler };
