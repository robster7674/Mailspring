"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const startup_profile_1 = require("./scenarios/startup-profile");
const simple_startup_1 = require("./scenarios/simple-startup");
const app_startup_1 = require("./scenarios/app-startup");
const database_query_1 = require("./scenarios/database-query");
const search_1 = require("./scenarios/search");
const initial_sync_1 = require("./scenarios/initial-sync");
const list_render_1 = require("./scenarios/list-render");
const folder_navigation_1 = require("./scenarios/folder-navigation");
const message_open_1 = require("./scenarios/message-open");
const composer_1 = require("./scenarios/composer");
const attachment_upload_1 = require("./scenarios/attachment-upload");
async function runAllScenarios() {
    const scenarios = [
        { name: 'Startup Profile', fn: () => (0, startup_profile_1.runStartupProfileScenario)() },
        { name: 'Simple Startup', fn: () => (0, simple_startup_1.runSimpleStartupScenario)({ runs: 5 }) },
        { name: 'App Startup (CDP)', fn: () => (0, app_startup_1.runAppStartupScenario)({ runs: 3 }) },
        { name: 'Database Query', fn: () => (0, database_query_1.runDatabaseQueryScenario)({ runs: 3 }) },
        { name: 'Search', fn: () => (0, search_1.runSearchScenario)({ runs: 3 }) },
        { name: 'Initial Sync', fn: () => (0, initial_sync_1.runInitialSyncScenario)({ runs: 3 }) },
        { name: 'List Render', fn: () => (0, list_render_1.runListRenderScenario)({ runs: 3 }) },
        { name: 'Folder Navigation', fn: () => (0, folder_navigation_1.runFolderNavigationScenario)({ runs: 3 }) },
        { name: 'Message Open', fn: () => (0, message_open_1.runMessageOpenScenario)({ runs: 3 }) },
        { name: 'Composer', fn: () => (0, composer_1.runComposerScenario)({ runs: 3 }) },
        { name: 'Attachment Upload', fn: () => (0, attachment_upload_1.runAttachmentUploadScenario)({ runs: 3 }) },
    ];
    console.log('\n' + '='.repeat(70));
    console.log('MAILSPRING PERFORMANCE BENCHMARK SUITE');
    console.log('='.repeat(70));
    console.log(`Running ${scenarios.length} scenarios...\n`);
    const results = {};
    let completed = 0;
    for (const scenario of scenarios) {
        console.log(`\n▶ [${completed + 1}/${scenarios.length}] ${scenario.name}...`);
        console.log('-'.repeat(70));
        try {
            const result = await scenario.fn();
            results[scenario.name] = result;
            completed++;
            console.log(`✓ ${scenario.name} complete\n`);
        }
        catch (err) {
            console.error(`✗ ${scenario.name} failed:`, err instanceof Error ? err.message : String(err));
            process.exit(1);
        }
    }
    // Print final summary
    console.log('\n' + '='.repeat(70));
    console.log('BENCHMARK RESULTS SUMMARY');
    console.log('='.repeat(70));
    console.log(`\n${' '.padEnd(30)} | Median  | Mean    | Min     | Max     | P95`);
    console.log('-'.repeat(70));
    for (const scenario of scenarios) {
        const result = results[scenario.name];
        if (result && result.median && result.median.duration !== undefined) {
            const median = result.median.duration;
            const mean = result.mean.duration || 0;
            const min = result.min.duration;
            const max = result.max.duration;
            const p95 = result.p95.duration;
            console.log(`${scenario.name.padEnd(30)} | ${median.toString().padEnd(7)} | ${mean.toFixed(0).padEnd(7)} | ${min.toString().padEnd(7)} | ${max.toString().padEnd(7)} | ${p95}`);
        }
    }
    console.log('-'.repeat(70));
    console.log(`\n✓ All ${scenarios.length} scenarios complete!`);
    console.log(`Results saved to: benchmarks/dist/results/\n`);
}
runAllScenarios().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
