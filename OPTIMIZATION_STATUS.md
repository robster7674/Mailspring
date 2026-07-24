# Performance Optimization Status

**Date:** 2026-07-24  
**Status:** Ready for coordinated testing

---

## Overview

Two coordinated feature branches addressing database performance bottlenecks identified in profiler logs:

| Repository | Branch | Status | Changes |
|------------|--------|--------|---------|
| Mailspring | `feature/database-optimization` | ✅ Ready | Query caching, monitoring, docs |
| Mailspring-Sync | `feature/database-optimization` | ✅ Ready | Index optimization migration |
| Mailspring-Sync submodule | Protected | ✅ Locked | `feature/performance-profiling` cannot change |

---

## Mailspring Changes (6 commits)

### Implemented
1. **Query Result Caching** (adaptive TTL)
   - ThreadCategory: 2s (frequent updates)
   - Contact: 10s (infrequent updates)
   - Other: 5s (default)
   - Auto-invalidated on data changes

2. **Slow Query Monitoring**
   - Automatic detection of queries >100ms
   - Top 10 slowest queries reported every 60s
   - Dev mode only (zero production overhead)

3. **Documentation**
   - PERFORMANCE_INVESTIGATION.md - Detailed bottleneck analysis
   - PERFORMANCE_OPTIMIZATION_GUIDE.md - Developer reference
   - COORDINATED_TESTING_GUIDE.md - Testing instructions

### Files Modified
- `app/src/flux/stores/database-store.ts` - Caching & monitoring implementation

### Expected Impact (Mailspring only)
- 50% reduction in repeated query execution
- Cache hits: <5ms (vs 100-3500ms original)
- Event loop blocks: Reduced when cache hits occur

---

## Mailspring-Sync Changes (1 commit)

### Implemented
1. **V10 Database Migration**
   - Index optimization for ThreadCategory queries
   - Index reordering for query pattern: filter first, sort second
   - MessageBody index optimization
   - Contact lookup index explicit declaration

### Specifics
```sql
-- Key optimization: Reorder ThreadCategory index
-- Old: (lastMessageReceivedTimestamp DESC, value, inAllMail, ...)
-- New: (value, inAllMail, lastMessageReceivedTimestamp DESC, ...)

-- Old pattern: Sorts first, then filters (suboptimal)
-- New pattern: Filters first, sorts within filtered set (optimal)
```

### Files Modified
- `MailSync/constants.h` - Added V10_SETUP_QUERIES
- `MailSync/MailStore.cpp` - Added V10 migration execution, bumped CURRENT_VERSION to 10

### Expected Impact (Mailspring-Sync)
- ThreadCategory queries: 500-3500ms → 100-500ms (first), <50ms (cached)
- Contact lookups: 130-150ms → 10-50ms
- Event loop blocks: Consistent reduction
- Migration runs automatically on database version upgrade

---

## How They Work Together

```
Mailspring App
  ├─ Queries DatabaseStore (TypeScript)
  ├─ Caches results (5s default, adaptive TTL)
  ├─ Sends SQL to mailsync process
  │
  └─ Mailspring-Sync (C++)
     ├─ Receives SQL via JSON
     ├─ Executes with optimized indices (V10)
     ├─ Returns results
     │
     └─ SQLite Database
        ├─ Uses optimized indices (filter→sort)
        ├─ Returns results faster
        └─ Handles concurrent reads with WAL
```

**Result:**
- First query after invalidation: Uses optimized indices (faster, but not cached)
- Subsequent identical queries within TTL: Served from cache (very fast)
- Operations causing changes: Automatic cache invalidation (data freshness maintained)

---

## Testing Workflow

### Prerequisite: Both repos on feature branches

```bash
# Mailspring
cd ~/git/robster7674/Mailspring
git checkout feature/database-optimization

# Mailspring-Sync submodule
cd mailsync
git remote add fork https://github.com/robster7674/mailspring-sync.git
git fetch fork feature/database-optimization
git checkout -b feature/database-optimization fork/feature/database-optimization
cd ..
git add mailsync
git commit -m "Point mailsync to feature/database-optimization"
```

### Run Tests

1. **Build & Start**
   ```bash
   npm install
   npm start
   ```
   Watch for: "Optimizing database indices" message

2. **Monitor Performance**
   ```bash
   DEBUG=app:RxDB:all npm start
   ```
   Look for:
   - "📦 Query cache hit" messages
   - "🐌 Top 10 Slowest Queries" reports every 60s
   - Improved query times vs. before

3. **Functional Testing**
   - Navigate folders (Inbox, Sent, etc.)
   - Compose emails (Contact lookups)
   - Delete emails (cache invalidation)
   - Search (query optimization)

**See COORDINATED_TESTING_GUIDE.md for detailed instructions**

---

## Before/After Metrics (Expected)

### ThreadCategory Queries (Inbox loading)
```
Before: 1500-3500ms regularly (event loop blocks)
After:  1st: 100-500ms (optimized indices)
        2nd+: <50ms (cached, within 2s TTL)
```

### Contact Lookups (Composer, search)
```
Before: 130-150ms regularly (event loop blocks)
After:  1st: 10-50ms (optimized indices)
        2nd+: <5ms (cached, within 10s TTL)
```

### Event Loop Health
```
Before: 100-250ms blocks regularly (jank)
After:  <100ms blocks 90% of time
        Smooth UI during normal operations
```

---

## PR Strategy (Upstream)

### Phase 1: Mailspring-Sync PR (has no dependencies)
- Base: `Foundry376/Mailspring-Sync` master
- Branch: `feature/database-optimization`
- Description: V10 migration with index optimization
- No breaking changes, automatic migration

**Why first:** Mailspring depends on Sync. If Sync PR merges first, Mailspring PR can reference it.

### Phase 2: Mailspring PR (depends on Sync)
- Base: `mailspring/mailspring` master
- Branch: `feature/database-optimization`
- Update submodule to point to merged Sync commit
- Include: Caching, monitoring, all documentation
- Reference: Sync PR number for context

**Timing:** After Sync PR is merged (or reference Sync PR in description)

---

## Success Criteria

Testing passes when all of these are true:

- ✅ Mailspring-Sync V10 migration runs without errors
- ✅ Indices created and used by query planner
- ✅ ThreadCategory queries: <500ms (vs 1500-3500ms before)
- ✅ Contact queries: <50ms (vs 130-150ms before)  
- ✅ Cache hit rate: 50%+ for repeated operations
- ✅ Event loop blocks: <100ms, 90% of the time
- ✅ No data corruption or loss
- ✅ All normal operations work
- ✅ Performance persists across app restarts

---

## File Manifest

### Mailspring (`feature/database-optimization`)
```
PERFORMANCE_INVESTIGATION.md          - Detailed analysis of bottlenecks
PERFORMANCE_OPTIMIZATION_GUIDE.md     - Developer reference for caching behavior
COORDINATED_TESTING_GUIDE.md          - Testing instructions for both repos
OPTIMIZATION_STATUS.md                - This file
app/src/flux/stores/database-store.ts - Query caching & monitoring implementation
```

### Mailspring-Sync (`feature/database-optimization`)
```
MailSync/constants.h                  - V10_SETUP_QUERIES with optimized indices
MailSync/MailStore.cpp                - V10 migration execution, CURRENT_VERSION=10
```

---

## Rollback Plan

If issues arise during testing:

```bash
# Mailspring rollback
git checkout master
rm -rf node_modules
npm install

# Mailspring-Sync rollback
cd mailsync
git checkout master
cd ..
git add mailsync
git commit -m "Revert mailsync"

# Database rollback (if needed)
rm ~/.config/Mailspring/edgehill.db
# App will recreate on next start
```

---

## Next Steps

1. **Build & Test** (See COORDINATED_TESTING_GUIDE.md)
   - Point Mailspring to Sync feature branch
   - Build both repos
   - Run functional tests
   - Measure performance improvements

2. **Validate**
   - Confirm indices are used
   - Measure actual vs expected improvements
   - Check for edge cases or regressions

3. **Upstream**
   - Create Sync PR first
   - Create Mailspring PR after (reference Sync PR)
   - Include performance metrics in PR descriptions

---

## Contact & Questions

All documentation and implementation details are in this branch. See:
- PERFORMANCE_INVESTIGATION.md for why changes were made
- PERFORMANCE_OPTIMIZATION_GUIDE.md for how caching works
- COORDINATED_TESTING_GUIDE.md for how to test everything
- Git logs for implementation details
