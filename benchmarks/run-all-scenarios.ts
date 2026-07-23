import { runSimpleStartupScenario } from './scenarios/simple-startup';
import { runAppStartupScenario } from './scenarios/app-startup';
import { runDatabaseQueryScenario } from './scenarios/database-query';
import { runSearchScenario } from './scenarios/search';
import { runInitialSyncScenario } from './scenarios/initial-sync';
import { runListRenderScenario } from './scenarios/list-render';
import { runFolderNavigationScenario } from './scenarios/folder-navigation';
import { runMessageOpenScenario } from './scenarios/message-open';
import { runComposerScenario } from './scenarios/composer';
import { runAttachmentUploadScenario } from './scenarios/attachment-upload';

async function runAllScenarios() {
  const scenarios = [
    { name: 'Simple Startup', fn: () => runSimpleStartupScenario({ runs: 5 }) },
    { name: 'App Startup (CDP)', fn: () => runAppStartupScenario({ runs: 3 }) },
    { name: 'Database Query', fn: () => runDatabaseQueryScenario({ runs: 3 }) },
    { name: 'Search', fn: () => runSearchScenario({ runs: 3 }) },
    { name: 'Initial Sync', fn: () => runInitialSyncScenario({ runs: 3 }) },
    { name: 'List Render', fn: () => runListRenderScenario({ runs: 3 }) },
    { name: 'Folder Navigation', fn: () => runFolderNavigationScenario({ runs: 3 }) },
    { name: 'Message Open', fn: () => runMessageOpenScenario({ runs: 3 }) },
    { name: 'Composer', fn: () => runComposerScenario({ runs: 3 }) },
    { name: 'Attachment Upload', fn: () => runAttachmentUploadScenario({ runs: 3 }) },
  ];

  console.log('\n' + '='.repeat(70));
  console.log('MAILSPRING PERFORMANCE BENCHMARK SUITE');
  console.log('='.repeat(70));
  console.log(`Running ${scenarios.length} scenarios...\n`);

  const results: { [key: string]: any } = {};
  let completed = 0;

  for (const scenario of scenarios) {
    console.log(`\n▶ [${completed + 1}/${scenarios.length}] ${scenario.name}...`);
    console.log('-'.repeat(70));

    try {
      const result = await scenario.fn();
      results[scenario.name] = result;
      completed++;
      console.log(`✓ ${scenario.name} complete\n`);
    } catch (err) {
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
    if (result) {
      const median = result.median.duration;
      const mean = result.mean.duration;
      const min = result.min.duration;
      const max = result.max.duration;
      const p95 = result.p95.duration;

      console.log(
        `${scenario.name.padEnd(30)} | ${median.toString().padEnd(7)} | ${mean.toFixed(0).padEnd(7)} | ${min.toString().padEnd(7)} | ${max.toString().padEnd(7)} | ${p95}`
      );
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
