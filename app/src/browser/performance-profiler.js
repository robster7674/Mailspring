/**
 * Advanced Performance Profiler
 * Detects: wakelocks, race conditions, event loop blocking, lock contention
 */

class PerformanceProfiler {
  constructor(enabled = false, mode = 'production') {
    this.enabled = enabled;
    this.mode = mode; // 'production' = daily driver, 'development' = detailed
    this.metrics = {
      eventLoopBlocks: [],
      wakelocks: new Map(),
      locks: new Map(),
      raceConditions: [],
      asyncOperations: new Map(),
    };

    // Adjust thresholds based on mode
    if (mode === 'production') {
      // More lenient for daily use - only warn on serious issues
      this.thresholds = {
        eventLoopBlockMs: 16,
        eventLoopWarnMs: 100, // Only warn if >100ms
        lockWaitMs: 500, // >500ms is serious contention
        asyncTimeoutMs: 5000, // >5s is serious wakelock
      };
      this.verbose = false;
    } else {
      // Development mode - catch everything
      this.thresholds = {
        eventLoopBlockMs: 16,
        eventLoopWarnMs: 50,
        lockWaitMs: 100,
        asyncTimeoutMs: 1000,
      };
      this.verbose = true;
    }
  }

  /**
   * Detect event loop blocking (main thread congestion)
   */
  monitorEventLoop() {
    if (!this.enabled) return;

    let lastCheck = Date.now();
    setInterval(() => {
      const now = Date.now();
      const delta = now - lastCheck;

      if (delta > this.thresholds.eventLoopBlockMs) {
        this.metrics.eventLoopBlocks.push({
          timestamp: new Date(lastCheck).toISOString(),
          duration: delta,
          stack: new Error().stack,
        });

        // Only warn in development mode or for serious blocks
        if (this.verbose || delta > this.thresholds.eventLoopWarnMs) {
          console.warn(`[PERF] Event loop blocked for ${delta}ms (${this.mode})`);
        }
      }
      lastCheck = now;
    }, 1);
  }

  /**
   * Detect wakelocks (operations that prevent garbage collection)
   */
  trackAsyncOperation(name, promise) {
    if (!this.enabled) return promise;

    const id = `${name}-${Date.now()}-${Math.random()}`;
    const start = Date.now();
    const stack = new Error().stack;

    this.metrics.asyncOperations.set(id, {
      name,
      start,
      stack,
      resolved: false,
    });

    return promise
      .then((result) => {
        const duration = Date.now() - start;
        const op = this.metrics.asyncOperations.get(id);
        if (op) op.resolved = true;

        // Track all slow operations
        if (duration > this.thresholds.asyncTimeoutMs) {
          this.metrics.wakelocks.set(id, {
            name,
            duration,
            type: 'resolved-slow',
            stack,
          });

          // Only warn for serious wakelocks in production mode
          if (this.verbose || duration > this.thresholds.asyncTimeoutMs * 2) {
            console.warn(
              `[PERF] Async operation "${name}" took ${duration}ms (${this.mode})`
            );
          }
        }
        this.metrics.asyncOperations.delete(id);
        return result;
      })
      .catch((error) => {
        const duration = Date.now() - start;
        const op = this.metrics.asyncOperations.get(id);
        if (op) op.resolved = false;

        this.metrics.wakelocks.set(id, {
          name,
          duration,
          type: 'rejected',
          error: error.message,
          stack,
        });

        // Always warn on errors
        if (this.verbose) {
          console.error(
            `[PERF] Async operation "${name}" failed after ${duration}ms: ${error.message}`
          );
        }
        this.metrics.asyncOperations.delete(id);
        throw error;
      });
  }

  /**
   * Detect lock contention and race conditions
   */
  createMutex(name) {
    if (!this.enabled) {
      return {
        lock: async () => {},
        unlock: () => {},
        locked: false,
      };
    }

    let locked = false;
    const waiters = [];
    const lockLog = [];

    return {
      lock: async () => {
        const lockId = `${name}-${Date.now()}-${Math.random()}`;
        const start = Date.now();

        if (locked) {
          waiters.push(lockId);
          // Only warn on serious contention
          if (this.verbose || waiters.length > 2) {
            console.warn(`[PERF] Lock "${name}" contended (${waiters.length} waiters)`);
          }
        }

        while (locked) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }

        const waitTime = Date.now() - start;
        locked = true;

        lockLog.push({
          lockId,
          acquired: new Date(start).toISOString(),
          waitTime,
          waiterCount: waiters.length,
        });

        if (waitTime > this.thresholds.lockWaitMs) {
          this.metrics.locks.set(lockId, {
            name,
            waitTime,
            waiterCount: waiters.length,
          });

          // Only warn for serious wait times
          if (this.verbose || waitTime > this.thresholds.lockWaitMs * 2) {
            console.warn(`[PERF] Lock "${name}" wait time: ${waitTime}ms`);
          }
        }

        waiters.splice(waiters.indexOf(lockId), 1);
        return lockId;
      },

      unlock: () => {
        locked = false;
      },

      get locked() {
        return locked;
      },

      getLog: () => lockLog,
    };
  }

  /**
   * Detect potential race conditions via operation ordering
   */
  trackOperation(operationName, operationId = null) {
    if (!this.enabled) return operationId || `${operationName}-${Date.now()}`;

    const id = operationId || `${operationName}-${Date.now()}`;
    const timestamp = Date.now();

    // Check for operations that should be serialized
    if (!this.metrics.raceConditions[operationName]) {
      this.metrics.raceConditions[operationName] = [];
    }

    const recent = this.metrics.raceConditions[operationName].filter(
      (op) => timestamp - op.timestamp < 1000 // Within 1 second
    );

    if (recent.length > 0) {
      console.warn(
        `[PERF] Potential race: "${operationName}" called ${recent.length + 1} times in 1s`
      );
    }

    this.metrics.raceConditions[operationName].push({
      id,
      timestamp,
      stack: new Error().stack,
    });

    return id;
  }

  /**
   * Get summary report
   */
  getSummary() {
    if (!this.enabled) return null;

    const eventLoopStats = this._getEventLoopStats();
    const wakelockStats = this._getWakelockStats();
    const lockStats = this._getLockStats();
    const raceStats = this._getRaceConditionStats();

    return {
      eventLoop: eventLoopStats,
      wakelocks: wakelockStats,
      locks: lockStats,
      raceConditions: raceStats,
      timestamp: new Date().toISOString(),
    };
  }

  _getEventLoopStats() {
    if (this.metrics.eventLoopBlocks.length === 0) return null;

    const sorted = this.metrics.eventLoopBlocks.sort((a, b) => b.duration - a.duration);
    const top5 = sorted.slice(0, 5);
    const avg = sorted.reduce((sum, b) => sum + b.duration, 0) / sorted.length;
    const max = sorted[0].duration;

    return {
      count: sorted.length,
      max,
      average: Math.round(avg),
      top5Blocks: top5.map((b) => ({
        duration: b.duration,
        timestamp: b.timestamp,
      })),
    };
  }

  _getWakelockStats() {
    if (this.metrics.wakelocks.size === 0) return null;

    const entries = Array.from(this.metrics.wakelocks.values());
    const byType = {};
    for (const entry of entries) {
      if (!byType[entry.type]) byType[entry.type] = [];
      byType[entry.type].push(entry);
    }

    return {
      count: entries.length,
      byType: Object.keys(byType).reduce((acc, type) => {
        acc[type] = {
          count: byType[type].length,
          avgDuration: Math.round(
            byType[type].reduce((sum, e) => sum + e.duration, 0) / byType[type].length
          ),
        };
        return acc;
      }, {}),
      slowestOperations: entries
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3)
        .map((e) => ({
          name: e.name,
          duration: e.duration,
          type: e.type,
        })),
    };
  }

  _getLockStats() {
    if (this.metrics.locks.size === 0) return null;

    const entries = Array.from(this.metrics.locks.values());
    const byName = {};
    for (const entry of entries) {
      if (!byName[entry.name]) byName[entry.name] = [];
      byName[entry.name].push(entry);
    }

    return {
      count: entries.length,
      byName: Object.keys(byName).reduce((acc, name) => {
        const locks = byName[name];
        acc[name] = {
          count: locks.length,
          avgWaitTime: Math.round(
            locks.reduce((sum, l) => sum + l.waitTime, 0) / locks.length
          ),
          maxWaiters: Math.max(...locks.map((l) => l.waiterCount)),
        };
        return acc;
      }, {}),
    };
  }

  _getRaceConditionStats() {
    const stats = {};
    for (const [opName, ops] of Object.entries(this.metrics.raceConditions)) {
      if (ops.length > 3) {
        // Suspicious if called >3 times
        stats[opName] = {
          callCount: ops.length,
          lastCall: ops[ops.length - 1].timestamp,
          frequency: 'high',
        };
      }
    }
    return Object.keys(stats).length > 0 ? stats : null;
  }

  printSummary() {
    const summary = this.getSummary();
    if (!summary) {
      console.log('[PERF] No profiling data collected');
      return;
    }

    console.log('\n' + '='.repeat(70));
    console.log('ADVANCED PERFORMANCE PROFILING REPORT');
    console.log('='.repeat(70));

    if (summary.eventLoop) {
      console.log('\nEVENT LOOP BLOCKING:');
      console.log(`  Total blocks: ${summary.eventLoop.count}`);
      console.log(`  Max duration: ${summary.eventLoop.max}ms`);
      console.log(`  Average: ${summary.eventLoop.average}ms`);
    }

    if (summary.wakelocks) {
      console.log('\nWAKELOCKS (Long-running async operations):');
      console.log(`  Total: ${summary.wakelocks.count}`);
      for (const [type, stats] of Object.entries(summary.wakelocks.byType || {})) {
        console.log(`  ${type}: ${stats.count} ops, avg ${stats.avgDuration}ms`);
      }
      if (summary.wakelocks.slowestOperations?.length > 0) {
        console.log('  Slowest:');
        for (const op of summary.wakelocks.slowestOperations) {
          console.log(`    - ${op.name}: ${op.duration}ms (${op.type})`);
        }
      }
    }

    if (summary.locks) {
      console.log('\nLOCK CONTENTION:');
      console.log(`  Total lock waits: ${summary.locks.count}`);
      for (const [name, stats] of Object.entries(summary.locks.byName || {})) {
        console.log(`  ${name}: ${stats.count} waits, avg ${stats.avgWaitTime}ms`);
        if (stats.maxWaiters > 0) {
          console.log(`    Max concurrent waiters: ${stats.maxWaiters}`);
        }
      }
    }

    if (summary.raceConditions) {
      console.log('\nPOTENTIAL RACE CONDITIONS:');
      for (const [opName, stats] of Object.entries(summary.raceConditions)) {
        console.log(`  ${opName}: ${stats.callCount} calls (${stats.frequency})`);
      }
    }

    console.log('='.repeat(70) + '\n');
  }
}

// Export singleton
let globalProfiler = null;

function initAdvancedProfiler(enabled = false, mode = 'production') {
  if (!globalProfiler) {
    globalProfiler = new PerformanceProfiler(enabled, mode);
  }
  return globalProfiler;
}

function getAdvancedProfiler() {
  if (!globalProfiler) {
    globalProfiler = new PerformanceProfiler(false, 'production');
  }
  return globalProfiler;
}

module.exports = {
  initAdvancedProfiler,
  getAdvancedProfiler,
  PerformanceProfiler,
};
