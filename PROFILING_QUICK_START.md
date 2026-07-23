# Profiling Quick Start Guide

## Run with Profiling Enabled

```bash
# Basic startup profiling
PROFILE_STARTUP=1 npm start

# Advanced profiling (event loop, wakelocks, locks, races)
ADVANCED_PROFILE=1 npm start

# Both
PROFILE_STARTUP=1 ADVANCED_PROFILE=1 npm start
```

## What You'll See

```
[PROFILE] T+0ms: startup-profiler-initialized
[PROFILE] T+3ms (+3ms): main.js-loaded
[PROFILE] T+50ms (+47ms): app-ready-event-fired
...

[PERF] Event loop blocked for 120ms
[PERF] Async operation "mailsync.migrate" took 1234ms  ← Potential wakelock
[PERF] Lock "database-access" contended (3 waiters)   ← Lock contention
[PERF] Potential race: "render-view" called 8 times in 1s
```

---

## Integration in Your Code

### Track Async Operations (Detect Wakelocks)

```typescript
// app/src/services/my-service.ts
import { getAdvancedProfiler } from '../performance-profiler';

async function slowOperation() {
  const profiler = getAdvancedProfiler();
  
  const promise = await fetchData();
  await profiler.trackAsyncOperation('fetch-data', promise);
  
  return promise;
}

// If operation takes >1s, you'll see:
// [PERF] Async operation "fetch-data" took 2500ms
```

### Database Operations with Lock Tracking

```typescript
// app/src/flux/stores/database-store.ts
const app = require('electron').app;

async function queryDatabase() {
  const application = app.application;
  
  // Uses mutex to detect contention
  return await application.executeWithDatabaseLock('get-messages', async () => {
    return DatabaseStore.findAll(Message);
  });
}

// If other queries are waiting:
// [PERF] Lock "database-access" contended (2 waiters)
```

### Detect Operation Frequency (Race Conditions)

```typescript
// app/src/components/message-list.tsx
import { getAdvancedProfiler } from '../performance-profiler';

function onMessageSelected(messageId) {
  const profiler = getAdvancedProfiler();
  profiler.trackOperation('select-message', messageId);
  
  // If called too many times:
  // [PERF] Potential race: "select-message" called 15 times in 1s
}
```

### Create Mutexes for Critical Sections

```typescript
// app/src/database/transaction-manager.ts
import { getAdvancedProfiler } from '../performance-profiler';

const profiler = getAdvancedProfiler();
const transactionLock = profiler.createMutex('database-transaction');

async function executeTransaction(sql) {
  const lockId = await transactionLock.lock();
  try {
    // If many threads wait here, you'll see contention warning
    return await db.execute(sql);
  } finally {
    transactionLock.unlock();
  }
}
```

---

## Interpretation Guide

### Event Loop Blocking
```
[PERF] Event loop blocked for 150ms
```
- **<16ms**: Normal (60fps = 16.7ms per frame)
- **16-50ms**: Noticeable jank
- **>100ms**: User-visible lag

**Fix**: Move work to async, use workers, chunk large operations

### Wakelocks
```
[PERF] Async operation "mailsync.migrate" took 3000ms
```
- **<100ms**: Normal
- **100ms-1s**: Slow but acceptable
- **>1s**: Investigate immediately

**Fix**: Add database indexes, optimize queries, profile the operation

### Lock Contention
```
[PERF] Lock "database-access" contended (3 waiters)
```
- **0 waiters**: Healthy
- **1-2 waiters**: Minor contention
- **>2 waiters**: Significant contention, needs refactoring

**Fix**: Use finer-grained locks, reduce critical section time

### Race Conditions
```
[PERF] Potential race: "select-message" called 15 times in 1s
```
- **<3/sec**: Normal
- **3-10/sec**: Suspicious, check logic
- **>10/sec**: Likely race condition or inefficient design

**Fix**: Add debounce/throttle, check event handlers, fix logic flow

---

## Common Performance Issues & Fixes

### Issue: "Event loop blocked for 500ms"
```javascript
// ❌ Bad: Blocking operation
function renderLargeList(items) {
  for (let i = 0; i < items.length; i++) {
    renderItem(items[i]);  // Blocks for all items
  }
}

// ✅ Good: Async chunks
async function renderLargeList(items) {
  for (let i = 0; i < items.length; i += 100) {
    await chunk(items.slice(i, i + 100).map(renderItem));
    await new Promise(r => setTimeout(r, 0));  // Yield to event loop
  }
}
```

### Issue: "Async operation took 5000ms"
```javascript
// ❌ Bad: Slow query
const messages = await DatabaseStore.findAll(Message);

// ✅ Good: Indexed query
const messages = await DatabaseStore.findAll(Message)
  .where({ accountId: 123 });  // Add index on accountId
```

### Issue: "Lock contended (5 waiters)"
```javascript
// ❌ Bad: Long critical section
const lock = profiler.createMutex('database');
await lock.lock();
try {
  const result = await slowQuery();      // 5 second operation!
  await anotherSlowQuery();              // 3 second operation!
  return result;
} finally {
  lock.unlock();
}

// ✅ Good: Minimal critical section
const lock = profiler.createMutex('database');
await lock.lock();
try {
  const id = data.id;                    // Quick operation
} finally {
  lock.unlock();
}
const result = await slowQuery(id);      // Outside lock
const other = await anotherSlowQuery();  // Outside lock
return result;
```

### Issue: "Potential race: called 20 times in 1s"
```javascript
// ❌ Bad: Multiple handlers all calling same function
component.on('render', () => updateView());
component.on('update', () => updateView());
component.on('refresh', () => updateView());

// ✅ Good: Debounce or single handler
const debouncedUpdate = debounce(updateView, 100);
component.on('render', debouncedUpdate);
component.on('update', debouncedUpdate);
component.on('refresh', debouncedUpdate);
```

---

## Two-Level Profiling Strategy

**Level 1: Custom Profiler (1 minute diagnosis)**
```bash
ADVANCED_PROFILE=1 npm start
# Quick alerts: [PERF] Event loop blocked, lock contended, etc.
# Terminal output, minimal overhead
```

**Level 2: CDP (Deep dive, when Level 1 shows something)**
```bash
npm start -- --remote-debugging-port=9222
# Open chrome://devtools (any Chromium browser)
# See exact flame graphs, memory, rendering timeline
```

Example workflow:
1. See `[PERF] Event loop blocked for 200ms` → Switch to CDP
2. CDP flame graph shows: 180ms in `DatabaseStore.findAll()`
3. Add database index or optimize query
4. Re-run custom profiler to verify improvement

## Tips

- **Profile early in development**, not after performance problems appear
- **Start with custom profiler** (fast feedback), then CDP if needed (detailed analysis)
- **Run with profiling on both Linux and macOS** for platform differences
- **Compare before/after** benchmark results when optimizing
- **Document what was optimized** and why in commit messages
- **Use `executeWithDatabaseLock()`** for all database operations when profiling
- **CDP doesn't require Chrome browser** — works with any Chromium browser (Chrome, Edge, Brave, Safari on macOS)

See full guide in [PROFILING_GUIDE.md](PROFILING_GUIDE.md)
