import { readFile, writeFile } from 'fs/promises';
import { RepositoryChecker } from './checker.js';
import { Config, CheckResult, RequiresEntry } from './types.js';

const REPORT_FILE = 'report.md';

// ============================================================================
// Config & Repository Loading
// ============================================================================

async function loadConfig(configPath: string): Promise<Config> {
    try {
        const configContent = await readFile(configPath, 'utf-8');
        return JSON.parse(configContent) as Config;
    } catch (error) {
        throw new Error(`Failed to load config from ${configPath}: ${error}`);
    }
}

async function getRepositories(config: Config, checker: RepositoryChecker): Promise<string[]> {
    const repositories: string[] = [];

    if (config.dynamicRepositories?.enabled) {
        console.log(`Fetching repositories from ${config.dynamicRepositories.source} for org: ${config.dynamicRepositories.organization} with topic: ${config.dynamicRepositories.topic}`);
        const dynamicRepos = await checker.fetchBazelContribRepositories();
        repositories.push(...dynamicRepos);
    }

    if (config.repositories?.enabled) {
        repositories.push(...config.repositories.list);
    }

    if (repositories.length === 0) {
        throw new Error('No repositories configured. Either provide static repositories or enable dynamic repository fetching.');
    }

    // Remove duplicates
    return [...new Set(repositories)];
}

// ============================================================================
// Result Processing Helpers
// ============================================================================

interface ProcessedFailure {
    failure: CheckResult;
    repo: string;
    status: { emoji: string; message: string };
    failedRequires: RequiresEntry[];
}

interface GroupedResults {
    failedCount: number;
    passedCount: number;
    byCheck: Map<string, Map<string, ProcessedFailure[]>>; // checkName -> repo -> failures
}

function getFailureStatus(failure: CheckResult): { emoji: string; message: string } {
    if (failure.error) {
        if (failure.error.includes('File not found')) {
            return { emoji: '🤷‍♂️', message: 'File not found' };
        }
        return { emoji: '❌', message: failure.error };
    }
    const patternThatDoesntMessUpMarkdownTables = failure.check.pattern.replace(/\|/g, '\\|');
    return { emoji: '🔍', message: `Pattern \`${patternThatDoesntMessUpMarkdownTables}\` not found` };
}

function getFailedRequires(failure: CheckResult, allResults: CheckResult[]): RequiresEntry[] {
    if (!failure.requires || failure.requires.length === 0) {
        return [];
    }

    return failure.requires.filter(req => {
        const requiredCheckResult = allResults.find(
            r => r.check.name === req.check && r.repository === failure.repository
        );
        return requiredCheckResult && !requiredCheckResult.passed;
    });
}

function processResults(results: CheckResult[]): GroupedResults {
    const failedResults = results.filter(r => !r.passed);
    const passedCount = results.filter(r => r.passed).length;

    const byCheck = new Map<string, Map<string, ProcessedFailure[]>>();

    for (const failure of failedResults) {
        if (!byCheck.has(failure.check.name)) {
            byCheck.set(failure.check.name, new Map());
        }
        const repoMap = byCheck.get(failure.check.name)!;

        if (!repoMap.has(failure.repository)) {
            repoMap.set(failure.repository, []);
        }

        repoMap.get(failure.repository)!.push({
            failure,
            repo: failure.repository,
            status: getFailureStatus(failure),
            failedRequires: getFailedRequires(failure, results),
        });
    }

    return { failedCount: failedResults.length, passedCount, byCheck };
}

// ============================================================================
// Report Generation
// ============================================================================

function generateMarkdownReport(results: CheckResult[]): string {
    const processed = processResults(results);
    const lines: string[] = [];

    lines.push('# Rules Doctor Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    if (processed.failedCount === 0) {
        lines.push('## ✅ All checks passed!');
        return lines.join('\n');
    }

    lines.push('## Summary');
    lines.push('');
    lines.push(`- ❌ **Failed checks:** ${processed.failedCount}`);
    lines.push(`- ✅ **Passed checks:** ${processed.passedCount}`);
    lines.push('');
    lines.push('## Failed Checks');
    lines.push('');

    const sortedChecks = [...processed.byCheck.keys()].sort();

    for (const checkName of sortedChecks) {
        const repoMap = processed.byCheck.get(checkName)!;
        lines.push(`### 🔍 ${checkName}`);
        lines.push('');

        // Get reference_example from the first failure's check (all failures in this group share the same check)
        const firstRepo = [...repoMap.keys()][0];
        const firstFailure = repoMap.get(firstRepo)![0];
        const referenceExample = firstFailure.failure.check.reference_example;

        lines.push('| Repository | File | Status | Reference |');
        lines.push('|------------|------|--------|-----------|');

        const sortedRepos = [...repoMap.keys()].sort();
        for (const repo of sortedRepos) {
            for (const { failure, status, failedRequires } of repoMap.get(repo)!) {
                const repoLink = `[${repo}](https://github.com/${repo})`;
                const fileLink = `[${failure.filePath}](https://github.com/${repo}/blob/main/${failure.filePath})`;

                let statusText = `${status.emoji} ${status.message}`;
                if (failedRequires.length > 0) {
                    const reqLinks = failedRequires
                        .map(req => `[\`${req.check}\`](#-${req.check})`)
                        .join(', ');
                    statusText += ` ⚠️ Fix first: ${reqLinks}`;
                }

                const referenceLink = referenceExample ? `[Example](${referenceExample})` : '';
                lines.push(`| ${repoLink} | ${fileLink} | ${statusText} | ${referenceLink} |`);
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}

function reportResults(results: CheckResult[]): void {
    const processed = processResults(results);

    if (processed.failedCount === 0) {
        console.log('✅ All checks passed!');
        return;
    }

    console.log(`\n❌ Found ${processed.failedCount} failed check(s):\n`);

    const sortedChecks = [...processed.byCheck.keys()].sort();

    for (const checkName of sortedChecks) {
        const repoMap = processed.byCheck.get(checkName)!;
        console.log(`🔍 Check: ${checkName}`);

        const sortedRepos = [...repoMap.keys()].sort();
        for (const repo of sortedRepos) {
            console.log(`  📦 Repository: https://github.com/${repo}`);

            for (const { failure, status, failedRequires } of repoMap.get(repo)!) {
                console.log(`     ${status.emoji} ${failure.filePath} - ${status.message}`);
                console.log(`        View: https://github.com/${repo}/blob/main/${failure.filePath}`);

                for (const req of failedRequires) {
                    const reason = req.reason ? ` (${req.reason})` : '';
                    console.log(`        ⚠️  Fix first: ${req.check}${reason}`);
                }
            }
        }
        console.log();
    }
}

async function main(): Promise<void> {
    try {
        const checkName = process.argv[2]; // Optional check name (first argument)
        const configPath = 'config.json';

        console.log(`Loading configuration from: ${configPath}`);
        const config = await loadConfig(configPath);

        const checker = new RepositoryChecker();
        const repositories = await getRepositories(config, checker);

        // Filter checks if a specific check name is provided
        let checks = config.checks;
        if (checkName) {
            checks = checks.filter(check => check.name === checkName);
            if (checks.length === 0) {
                console.error(`Error: No check found with name '${checkName}'`);
                process.exit(1);
            }
            console.log(`Running only check: ${checkName}\n`);
        } else {
            console.log(`Found ${repositories.length} repositories and ${config.checks.length} checks\n`);
        }

        const results = await checker.checkAllRepositories(repositories, checks);

        console.log('\n--- Results ---');
        reportResults(results);

        // Write markdown report
        const markdownReport = generateMarkdownReport(results);
        await writeFile(REPORT_FILE, markdownReport, 'utf-8');
        console.log(`\n📄 Report written to ${REPORT_FILE}`);

        // Exit with error code if any checks failed
        const hasFailures = results.some(result => !result.passed);
        process.exit(hasFailures ? 1 : 0);

    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();
