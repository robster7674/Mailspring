/**
 * Startup Performance Profiler
 * Instruments Mailspring startup with high-resolution timing
 */

class StartupProfiler {
  constructor(profilingEnabled = true) {
    this.profilingEnabled = profilingEnabled;
    this.startTime = Date.now();
    this.marks = [];
    if (this.profilingEnabled) {
      this.mark('startup-profiler-initialized', this.startTime);
    }
  }

  mark(label, timestamp) {
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

  section(sectionName) {
    return new SectionProfiler(sectionName, this);
  }

  async profileAsync(label, fn) {
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

  profileSync(label, fn) {
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

  summary() {
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

  getElapsed() {
    return Date.now() - this.startTime;
  }
}

class SectionProfiler {
  constructor(sectionName, parent) {
    this.sectionName = sectionName;
    this.parent = parent;
    this.startTime = Date.now();
    this.parent.mark(`${sectionName} (start)`);
  }

  mark(label) {
    this.parent.mark(`${this.sectionName}: ${label}`);
  }

  end() {
    const duration = Date.now() - this.startTime;
    this.parent.mark(`${this.sectionName} (complete: ${duration}ms)`);
    return duration;
  }

  async profileAsync(label, fn) {
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

  profileSync(label, fn) {
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
let globalProfiler = null;

function initProfiler(enabled = true) {
  if (!globalProfiler) {
    globalProfiler = new StartupProfiler(enabled);
  }
  return globalProfiler;
}

function getProfiler() {
  if (!globalProfiler) {
    globalProfiler = new StartupProfiler(false);
  }
  return globalProfiler;
}

module.exports = {
  initProfiler,
  getProfiler,
  StartupProfiler,
  SectionProfiler,
};
