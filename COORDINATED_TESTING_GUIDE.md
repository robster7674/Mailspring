# Coordinated Testing: Mailspring + Mailspring-Sync

Testing the performance optimizations requires coordinating changes across two repositories:

- **Mailspring** (TypeScript/Electron): Query result caching, slow query monitoring
- **Mailspring-Sync** (C++/Database): Index optimization migration

---

## Setup: Build Both Repos

### 1. Build Mailspring-Sync (C++)

```bash
cd /home/rob/git/robster7674/Mailspring-Sync
# Ensure you're on feature/database-optimization branch
git checkout feature/database-optimization

# Build mailspring-sync
# (Follow the Mailspring-Sync README for build instructions specific to your OS)
# Typically: cmake build process
```

The built binary will be something like `Mailspring-Sync` executable.

### 2. Configure Mailspring to Use Your Sync Fork

Mailspring uses mailspring-sync as a submodule. Update it to point to your feature branch:

```bash
cd /home/rob/git/robster7674/Mailspring

# Update the submodule to your fork's feature branch
cd mailsync
git remote add fork https://github.com/robster7674/mailspring-sync.git
git fetch fork feature/database-optimization
git checkout -b feature/database-optimization fork/feature/database-optimization
cd ..

# Commit the submodule update
git add mailsync
git commit -m "Point mailsync submodule to feature/database-optimization branch"
```

### 3. Build Mailspring with Updated Sync

```bash
cd /home/rob/git/robster7674/Mailspring
git checkout feature/database-optimization

npm install
npm start
```

---

## Testing Workflow

### Phase 1: Initial Sync Migration (Automatic)

When Mailspring starts with the new Mailspring-Sync:

1. The app will detect database version < 10
2. V10 migration automatically runs: "Optimizing database indices"
3. Watch the console for index creation messages
4. Migration runs in background; UI remains responsive

**Expected duration:** 30 seconds to 2 minutes (depending on database size)

```bash
# Monitor progress in the Mailspring console:
[info] Optimizing database indices
# Then various SQLite index creation statements
```

### Phase 2: Functional Testing

After migration completes, test normal operations:

1. **Folder/Inbox Navigation**
   - Switch between folders (Inbox, Sent, Drafts, etc.)
   - Watch console for query times
   - Should see ThreadCategory queries now optimized

2. **Email Operations**
   - Read emails (tests Message body queries)
   - Compose email (tests Contact lookup queries)
   - Delete 20-30 emails (watch for cache invalidation + re-execution)

3. **Search & Filtering**
   - Use search features
   - Filter by labels
   - Watch for Contact lookup queries

### Phase 3: Performance Measurement

Enable debug logging to see optimization impact:

```bash
# Terminal 1: Start Mailspring with debug logging
DEBUG=app:RxDB:all npm start

# Watch for cache hits and slow query reports:
# - "📦 Query cache hit" messages
# - "🐌 Top 10 Slowest Queries" every 60 seconds in dev mode
```

**Compare before/after:**

| Operation | Before Optimization | After Optimization |
|-----------|---------------------|-------------------|
| ThreadCategory query | 1500-3500ms | 100-500ms (1st), <50ms cached |
| Contact lookup | 130-150ms | 10-50ms |
| Event loop blocks | 100-250ms regular | <100ms (with cache) |
| Folder navigation | Visible jank | Smooth |

---

## Monitoring During Testing

### Console Output Checklist

- ✅ V10 migration runs on first startup
- ✅ No SQL syntax errors in migration
- ✅ Slow query reports show improved times
- ✅ Cache hit messages when repeating operations
- ✅ Event loop blocks reduced

### Database State Verification

```bash
# After migration, verify new indices exist:
sqlite3 ~/.config/Mailspring/edgehill.db

> .indices ThreadCategory
# Should show optimized indices:
# ThreadListCategoryIndex
# ThreadListCategorySentIndex
# ThreadCategory_id
# ThreadCategory_val_id

> .indices Contact
# ContactLookupIndex
# ContactEmailIndex
# ContactAccountEmailIndex
```

---

## Rollback Instructions

If issues arise, you can rollback:

### Rollback Mailspring-Sync changes:

```bash
cd /home/rob/git/robster7674/Mailspring-Sync
git checkout master
# Rebuild sync binary
```

### Rollback Mailspring submodule:

```bash
cd /home/rob/git/robster7674/Mailspring
cd mailsync
git checkout master
cd ..
git add mailsync
git commit -m "Revert mailsync to master"
```

### Rollback database (if needed):

```bash
# Delete the optimized database to start fresh
rm ~/.config/Mailspring/edgehill.db
# Mailspring will recreate it on next start
```

---

## Coordinated PR Strategy

Once testing confirms improvements:

### 1. PR Mailspring-Sync first (dependency)

- Create PR from `feature/database-optimization` → `master`
- Target upstream: `mailspring/mailspring-sync` (or Foundry376)
- Include:
  - Description of V10 migration
  - Performance improvements documented
  - No breaking changes, automatic migration

### 2. PR Mailspring after Sync PR merges (or reference Sync PR)

- Create PR from `feature/database-optimization` → `master`
- Target upstream: `mailspring/mailspring`
- Update submodule to point to merged Sync changes
- Include:
  - Query result caching implementation
  - Slow query monitoring
  - Developer guide (PERFORMANCE_OPTIMIZATION_GUIDE.md)
  - Link to Sync PR for context

---

## Testing Coordination Timeline

```
Week 1: Functional Testing
  ├─ Setup both repos on feature branches
  ├─ Run through normal workflows
  ├─ Verify cache invalidation behavior
  └─ Monitor for edge cases

Week 2: Performance Measurement
  ├─ Quantify improvements (compare logs)
  ├─ Stress test with large mailboxes
  ├─ Verify no regressions
  └─ Document before/after metrics

Week 3: Final Review & Upstream
  ├─ Internal code review
  ├─ Create PR descriptions
  ├─ Submit Sync PR first
  └─ Submit Mailspring PR after Sync merges
```

---

## Questions During Testing?

If issues arise:

1. Check `PERFORMANCE_INVESTIGATION.md` for analysis details
2. Check `PERFORMANCE_OPTIMIZATION_GUIDE.md` for caching behavior
3. Review git logs: `git log --oneline feature/database-optimization`
4. Check constants.h for schema definitions
5. Verify database version: `PRAGMA user_version` in SQLite CLI

---

## Key Files to Review

**Mailspring changes:**
- `app/src/flux/stores/database-store.ts` - Query caching & monitoring
- `PERFORMANCE_INVESTIGATION.md` - Analysis of bottlenecks
- `PERFORMANCE_OPTIMIZATION_GUIDE.md` - Developer reference

**Mailspring-Sync changes:**
- `MailSync/constants.h` - V10 migration SQL
- `MailSync/MailStore.cpp` - Migration execution code

---

## Success Criteria

Testing passes when:

- ✅ V10 migration runs without errors
- ✅ Indices are created and query planner uses them
- ✅ ThreadCategory queries: <500ms (vs 1500-3500ms before)
- ✅ Contact queries: <50ms (vs 130-150ms before)
- ✅ Cache hits reduce repeated query execution by 50%+
- ✅ Event loop blocks reduce to <100ms 90% of the time
- ✅ No data corruption or loss
- ✅ All normal operations work correctly
- ✅ Performance improvements persist across app restarts
