# Performance Optimization Status

**Last updated:** 2026-07-31
**Status:** ✅ Merged, build-verified on Linux and macOS. Real-world performance impact **not yet measured** — see "What's Actually Verified" below.

---

## Summary

Four pieces of work, across two repos, all reviewed and merged to `master`:

| # | What | Repo | PR | Status |
|---|------|------|-----|--------|
| 1 | Performance profiler (event loop, wakelocks, locks, races) | Mailspring | [#2](https://github.com/robster7674/Mailspring/pull/2) | Merged |
| 2 | Query result caching + slow query monitoring | Mailspring | [#4](https://github.com/robster7674/Mailspring/pull/4) | Merged |
| 3 | V10 database index migration | Mailspring-Sync | [#1](https://github.com/robster7674/Mailspring-Sync/pull/1) | Merged |
| 4 | Submodule → V10 migration | Mailspring | [#5](https://github.com/robster7674/Mailspring/pull/5) | Merged |
| 5 | Linux CI: build mailsync from source | Mailspring | [#6](https://github.com/robster7674/Mailspring/pull/6) | Merged |
| 6 | macOS build fix: libetpan DB detection | Mailspring-Sync | [#2](https://github.com/robster7674/Mailspring-Sync/pull/2) | Merged |
| 7 | Submodule → macOS fix | Mailspring | [#7](https://github.com/robster7674/Mailspring/pull/7) | Merged |

Original plan (see git history of this file) was to keep both repos on parallel `feature/database-optimization` branches and PR them together. That's obsolete — everything above shipped as separate, individually-reviewed PRs instead, several as direct fixes for bugs found during review.

---

## What Each Piece Actually Does

### 1. Performance Profiler (`app/src/browser/performance-profiler.js`)
- Detects event loop blocks (>16ms), long-running async ops ("wakelocks"), lock contention, and operations called suspiciously often
- Dual mode: `production` (daily-driver, lenient thresholds) and `development` (verbose)
- Enable: `ADVANCED_PROFILE=1 npm start`
- See `PROFILING_GUIDE.md` / `PROFILING_QUICK_START.md` for full usage

### 2. Query Result Caching (`app/src/flux/stores/database-store.ts`)
- Caches `SELECT` results with type-specific TTL (Contact 10s, ThreadCategory 2s, other 5s)
- Cache is an `LRUCache` (max 500 entries) — **not** a plain unbounded `Map`, which is what shipped before review caught it
- Invalidation is **selective by table**, not a full clear on every change. `DatabaseStore.trigger()` fires on every incoming sync-engine delta (potentially many times/second during active sync); a full clear there would have defeated the cache almost entirely for exactly the high-volume users it's meant to help
- Slow query stats (>100ms) are tracked and bounded (max 200 entries) regardless of dev/production mode

### 3. V10 Database Index Migration (Mailspring-Sync `MailSync/constants.h`, `MailStore.cpp`)
- Reorders `ThreadListCategoryIndex` / `ThreadListCategorySentIndex` for filter-then-sort query pattern (was sort-then-filter)
- Reorders `MessageListThreadIndex`
- Adds `MessageBodyIdIndex`, explicit `ContactLookupIndex`
- Runs automatically via `mailsync --mode migrate` when `user_version < 10`
- Verified idempotent (safe to run twice)

### 4. Build Pipeline Fixes (discovered while verifying the above actually builds)
- **Linux CI** (`build-linux.yaml`): never built `mailsync` from source at all — `npm run build` only copies a pre-existing binary. Fixed: recursive submodule checkout, added missing `liblzma-dev`, added an explicit mailsync build step
- **macOS**: `xcodebuild` failed with ~20 compile errors in vendored `libetpan`. Root cause: macOS's system `db.h` defines `DB_VERSION_MAJOR >= 3` (fooling autoconf's compile-only detection) but only implements the ancient 1.85 BSD DB API — no `db_open`/`DBC`/cursor support. Fixed by explicitly disabling libetpan's unused Berkeley DB cache (`--disable-db`), matching what already happens correctly on Linux (no `db.h` present there at all)
- `build-linux-arm64.yaml` has the identical CI gap as the Linux fix above — **not yet fixed**, flagged as a follow-up (couldn't validate without real ARM64 hardware)

---

## What's Actually Verified

✅ **Verified, with reproducible tests:**
- Profiler correctly detects and bounds all four metric types (event loop, wakelocks, locks, races) — manually load-tested
- Query cache is bounded under load (2000 inserts → capped at 500) and selective invalidation preserves unrelated entries while correctly evicting matched ones
- V10 migration runs cleanly, reaches `PRAGMA user_version = 10`, all five indices present with correct column order — tested on a fresh DB and confirmed idempotent
- `mailsync` builds from source and passes the same functional test on **both** rob-dev (Linux) and BorBook (Intel Mac)

❌ **Not yet verified — theoretical/expected only:**
- The specific millisecond numbers in earlier drafts of this doc ("ThreadCategory: 1500-3500ms → 100-500ms", "Contact: 130-150ms → 10-50ms") were never actually measured against real usage. They're plausible given the index changes, but nobody has run before/after profiling on a real account yet.
- Cache hit rate under real sync load — the selective-invalidation fix should help a lot here, but the actual hit rate with a real, syncing account is unmeasured.
- Whether the V10 migration's one-time index rebuild causes a noticeable startup delay on a large real mailbox (flagged as a plausible risk in review, not measured).

**This is the next real step** — see below.

---

## Next Steps

1. **Capture real logs.** Run the built app against real account data with the profiler active and watch for actual event loop blocks / slow queries during normal use (message list scrolling, folder switching, search, composing).
2. **Compare before/after**, if possible — ideally by testing against a backup of the pre-migration database vs. the migrated one, to get real numbers instead of the estimates above.
3. **Update this doc** (or a new one) with real measurements once captured, replacing the "expected" numbers.
4. `build-linux-arm64.yaml` fix, if ARM64 CI matters for releases.

---

## Rollback

```bash
# Mailspring
git log --oneline -10   # find the commit before these merges
git revert <merge-commit-sha>

# Mailspring-Sync submodule
cd mailsync
git checkout <previous-sha>
cd ..
git add mailsync && git commit -m "Revert mailsync to pre-V10"

# Database (only if actually corrupted — the migration is additive/idempotent,
# this should not be necessary in normal circumstances)
# back up first: cp -R ~/Library/Application\ Support/Mailspring ~/Desktop/mailspring-backup
```

---

## Related Docs

- `PROFILING_GUIDE.md` / `PROFILING_QUICK_START.md` — how to use the profiler (custom + CDP)
- `COORDINATED_TESTING_GUIDE.md`, `PERFORMANCE_INVESTIGATION.md`, `PERFORMANCE_OPTIMIZATION_GUIDE.md` — written before this round of review/fixes; describe the original plan and analysis, not all details reflect the final shipped implementation (e.g. cache is now `LRUCache` + selective invalidation, not the plain `Map` + full-clear described in early drafts). Useful for the "why" behind the work, treat specifics with the same caution as the old numbers above.
