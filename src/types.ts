export interface PoetryDependencyConstraint {
    version: string;
    extras?: string[];
    optional?: boolean;
    [key: string]: unknown;
}

export type PoetryDependencySpec = string | PoetryDependencyConstraint;

export interface PoetryGroupDependencies {
    dependencies: Record<string, PoetryDependencySpec>;
}

export interface PoetryConfig {
    dependencies?: Record<string, PoetryDependencySpec>;
    dev_dependencies?: Record<string, PoetryDependencySpec>;
    group?: {
        [key: string]: Partial<PoetryGroupDependencies>;
    };
}

export interface PyProjectToml {
    tool?: {
        poetry?: PoetryConfig;
    };
}

// Pipenv 的类型定义
export interface PipfileDependency {
    version?: string;
    path?: string;
    ref?: string;
    git?: string;
    editable?: boolean;
}

export interface Pipfile {
    source?: Array<{
        name: string;
        url: string;
        verify_ssl?: boolean;
    }>;
    packages?: Record<string, string | PipfileDependency>;
    dev_packages?: Record<string, string | PipfileDependency>;
    requires?: {
        python_version?: string;
    };
} 