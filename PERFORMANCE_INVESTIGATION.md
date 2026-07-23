# Performance Investigation & Optimization Plan

**Date:** 2026-07-23  
**Branch:** `feature/database-optimization`  
**Status:** Investigation Phase  

---

## Executive Summary

Profiler logs from PR#2 (advanced profiler) reveal significant performance bottlenecks in Mailspring's database layer. The main event loop experiences regular 100-250ms+ blocks, with some database queries taking 1.5–3.5 seconds to complete. Most execution time is on the main thread, causing UI jank.

---

## Identified Issues

### 1. **ThreadCategory Query – Repeated N+1 Pattern** 🔴 CRITICAL

**Query:**
```sql
SELECT `Thread`.`id` FROM `Thread` WHERE `id` IN (
  SELECT `id` FROM `ThreadCategory` 
  WHERE `ThreadCategory`.`value` IN (...4 values...) 
    AND `ThreadCategory`.`inAllMail` != 0  
  ORDER BY `ThreadCategory`.`lastMessageReceivedTimestamp` DESC 
  LIMIT 200 OFFSET 0
) ORDER BY `Thread`.`lastMessageReceivedTimestamp` DESC
```

**Issues:**
- Subquery-in-IN pattern is a classic N+1 anti-pattern
- Query runs **1.5–3.5 seconds** (observed: 2741ms, 3590ms, 1691ms, 2341ms, 1520ms, 1534ms)
- **Same query executed repeatedly with identical parameters** (caching opportunity)
- Nested ORDER BY on both subquery and outer query is inefficient

**Impact:** Regular 100–200ms+ event loop blocks  
**Frequency:** Multiple times per minute during normal use

---

### 2. **Contact Lookup Queries – Missing or Unused Index** 🔴 CRITICAL

**Query:**
```sql
SELECT `Contact`.`data` FROM `Contact`  
WHERE `Contact`.`accountId` = ? 
  AND `Contact`.`email` = ? 
ORDER BY `Contact`.`id` DESC 
LIMIT 1
```

**Issues:**
- Should be fast (one row lookup) but taking **130–150ms** consistently
- Composite index on `(accountId, email)` likely missing or not being used
- Runs frequently (~5–10x visible in logs)
- Query plan should be checked

**Impact:** 100–150ms event loop blocks  
**Frequency:** Multiple times per minute (email composition, contact search)

---

### 3. **Message Body Left Outer Join – Performance Regression** 🟠 HIGH

**Query:**
```sql
SELECT `Message`.`data`, IFNULL(`MessageBody`.`value`, '!NULLVALUE!') AS `body`
FROM `Message` 
LEFT OUTER JOIN `MessageBody` 
  ON `MessageBody`.`id` = `Message`.`id` 
WHERE `Message`.`threadId` = ?
ORDER BY `Message`.`date` ASC
```

**Issues:**
- LEFT OUTER JOIN on `MessageBody` is adding **100–150ms** overhead
- Missing index on `MessageBody.id` or join condition inefficiency
- Runs frequently when viewing threads

**Impact:** 100–150ms event loop blocks  
**Frequency:** Every time a thread is opened

---

### 4. **Main Thread Database Execution** 🟠 HIGH

**Issue:** Database queries are executing on the main thread (indicated by large foreground execution times in profiler output):
- `_executeInBackground took more than 100ms - 2741msec (14msec in background)` → **2727ms on main thread!**
- The background agent is spawning but not actually reducing main-thread load

**Root Cause:** Background execution may be falling back to local execution or the overhead isn't justified for these query patterns.

---

## Performance Metrics from Logs

| Metric | Value | Threshold |
|--------|-------|-----------|
| Event loop block frequency | 1 every 3-5 seconds | <50ms every few seconds |
| Max event loop block | 254ms | <50ms |
| ThreadCategory query time | 3590ms | <500ms |
| Contact lookup time | 150ms | <10ms |
| Message body JOIN time | 150ms | <50ms |

---

## Investigation Priorities

### Priority 1: ThreadCategory Query
- [ ] Capture EXPLAIN QUERY PLAN output
- [ ] Check if indices exist on `ThreadCategory(value, inAllMail, lastMessageReceivedTimestamp)`
- [ ] Rewrite as JOIN to avoid subquery-in-IN pattern
- [ ] Implement query result caching (identical queries run repeatedly)
- [ ] Consider pagination instead of LIMIT 200

### Priority 2: Contact Lookup
- [ ] Run EXPLAIN QUERY PLAN on Contact query
- [ ] Verify index on `(accountId, email)` exists
- [ ] If missing, add composite index
- [ ] If index exists, check query plan to see why it's not being used
- [ ] Profile with sample data (similar size to user's real data)

### Priority 3: Message Body Joins
- [ ] Capture EXPLAIN QUERY PLAN for Message + MessageBody JOIN
- [ ] Check indices on both tables
- [ ] Consider denormalization or query rewrite
- [ ] Profile join performance vs separate queries

### Priority 4: Background Execution
- [ ] Profile whether `_executeInBackground` is actually helping or hurting
- [ ] Check if database-agent.js is spawning correctly
- [ ] Verify process communication overhead isn't eating gains
- [ ] Consider query batching in background execution

---

## Files to Modify

1. **[database-store.ts](app/src/flux/stores/database-store.ts)**
   - Add query result caching for frequently-run identical queries
   - Implement query plan monitoring in production mode

2. **[mailspring-sync repository](external)**
   - Database schema and index definitions (C++ project)
   - May need to add indices or rewrite queries at source

3. **[query.ts](app/src/flux/models/query.ts)**
   - Review query builder to ensure optimal SQL generation
   - Check if we can rewrite subquery patterns automatically

4. **Documentation**
   - Record schema design decisions
   - Document which queries should be cached/optimized

---

## Quick Wins (Implement First)

1. **Query Result Caching**: Cache ThreadCategory query results for 5–10 seconds
   - Estimated impact: 50% reduction in query volume
   - Implementation: LRU cache in database-store.ts

2. **Index Addition**: Create composite index on Contact(accountId, email)
   - Estimated impact: Contact queries from 130ms → <10ms
   - Implementation: In mailspring-sync schema

3. **Query Plan Logging**: Enable EXPLAIN QUERY PLAN in production for slow queries >200ms
   - Estimated impact: Identify root causes faster
   - Implementation: Already present in code but logging may need adjustment

---

## Success Criteria

- [ ] ThreadCategory query time reduced from 2700ms to <500ms
- [ ] Contact lookup queries reduced from 150ms to <10ms
- [ ] Event loop blocks reduced from 200ms+ down to <50ms
- [ ] No query takes >500ms at 100th percentile
- [ ] UI remains responsive during normal email operations

---

## Related Documentation

- Profiler output: [Profiler logs provided by user]
- Framework: [advanced profiler PR#2](feature/performance-profiling)
- Prior investigation: [See CLAUDE.md - Task System notes]
