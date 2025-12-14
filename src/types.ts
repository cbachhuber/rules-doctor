export interface ExcludeEntry {
    repository: string; // Repository name in "owner/repo" format
    reason?: string; // Optional reason for exclusion
}

export interface RequiresEntry {
    check: string; // Name of the check that should be fixed first
    reason?: string; // Optional reason explaining the dependency
}

export interface FileCheck {
    name: string;
    file: string;
    pattern: string;
    description?: string;
    enabled?: boolean;  // When false, this check will be skipped
    exclude?: ExcludeEntry[]; // List of repositories to skip for this check
    requires?: RequiresEntry[]; // List of checks that should be fixed first
}

export interface Config {
    repositories?: {
        enabled: boolean;
        list: string[];
    };
    dynamicRepositories?: {
        enabled: boolean;
        source: 'github';
        organization: string;
        topic: string;
    };
    checks: FileCheck[];
}

export interface CheckResult {
    repository: string;
    check: FileCheck;
    filePath: string;
    passed: boolean;
    error?: string;
    requires?: RequiresEntry[]; // Checks that should be fixed first
}
