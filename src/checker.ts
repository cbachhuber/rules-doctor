import { FileCheck, CheckResult } from './types.js';

interface GitHubRepository {
    full_name: string;
    topics: string[];
}

interface GitHubSearchResponse {
    items: GitHubRepository[];
    total_count: number;
}

export class RepositoryChecker {
    async fetchBazelContribRepositories(): Promise<string[]> {
        try {
            // Search for repositories in bazel-contrib org with aspect-build topic
            const query = 'org:bazel-contrib topic:aspect-build';
            const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=100`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as GitHubSearchResponse;

            // Extract repository names in "owner/repo" format
            const repositories = data.items.map(repo => repo.full_name);

            console.log(`Found ${repositories.length} bazel-contrib repositories with aspect-build topic`);
            return repositories;
        } catch (error) {
            console.error('Failed to fetch repositories from GitHub API:', error);
            throw new Error(`Failed to fetch repositories: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async fetchFileContent(repoPath: string, filePath: string): Promise<string> {
        // repoPath is in format "owner/repo"
        const [owner, repoName] = repoPath.split('/');
        if (!owner || !repoName) {
            throw new Error(`Invalid repository format: ${repoPath}. Expected "owner/repo"`);
        }

        // Use GitHub's raw content API
        const url = `https://raw.githubusercontent.com/${owner}/${repoName}/main/${filePath}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Try 'master' branch if 'main' fails
                const masterUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/master/${filePath}`;
                const masterResponse = await fetch(masterUrl);
                if (!masterResponse.ok) {
                    throw new Error(`File not found: ${filePath}`);
                }
                return await masterResponse.text();
            }
            return await response.text();
        } catch (error) {
            throw new Error(`Failed to fetch ${filePath}: ${error}`);
        }
    }

    private runCheck(content: string, check: FileCheck): boolean {
        const isNegated = check.pattern.startsWith('!');
        const pattern = isNegated ? check.pattern.slice(1) : check.pattern;
        const regex = new RegExp(pattern);
        const matches = regex.test(content);
        return isNegated ? !matches : matches;
    }

    async checkRepository(repoPath: string, checks: FileCheck[]): Promise<CheckResult[]> {
        const results: CheckResult[] = [];

        for (const check of checks) {
            // Skip check if repository is in exclude list
            if (check.exclude && check.exclude.some(exclude => exclude.repository === repoPath)) {
                continue;
            }

            try {
                const content = await this.fetchFileContent(repoPath, check.file);
                const passed = this.runCheck(content, check);

                results.push({
                    repository: repoPath,
                    check: check,
                    filePath: check.file,
                    passed,
                    requires: passed ? undefined : check.requires
                });
            } catch (error) {
                results.push({
                    repository: repoPath,
                    check: check,
                    filePath: check.file,
                    passed: false,
                    error: error instanceof Error ? error.message : String(error),
                    requires: check.requires
                });
            }
        }

        return results;
    }

    async checkAllRepositories(repositories: string[], checks: FileCheck[]): Promise<CheckResult[]> {
        const allResults: CheckResult[] = [];
        const enabledChecks = checks.filter(check => check.enabled !== false);

        console.log(`\n🔍 Running ${enabledChecks.length} checks across ${repositories.length} repositories\n`);

        for (const repo of repositories) {
            console.log(`📦 Repository: ${repo}`);
            const results = await this.checkRepository(repo, checks);
            allResults.push(...results);
        }

        return allResults;
    }
}
