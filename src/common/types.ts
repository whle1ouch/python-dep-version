import type { Position } from "vscode";

export type DependencySpec = string;

export interface GroupDependencies {
    dependencies: Record<string, DependencySpec>;
}

export interface PoetryConfig {
    dependencies?: Record<string, DependencySpec>;
    dev_dependencies?: Record<string, DependencySpec>;
    group?: {
        [key: string]: Partial<GroupDependencies>;
    };
}

export interface UvConfig{
    ['dev-dependencies']?: string[];
}

export interface PyProjectToml {
    project?: {
        dependencies?: string[];
        
    }
    tool?: {
        poetry?: PoetryConfig;
        uv? : UvConfig;
    };
    ['dependency-groups']?: {
       dev?: string[] 
    }
}


export interface Pipfile {
    source?: Array<{
        name: string;
        url: string;
        verify_ssl?: boolean;
    }>;
    packages?: Record<string, DependencySpec>;
    ['dev-packages']?: Record<string, DependencySpec>;
    requires?: {
        python_version?: string;
    };
} 

export interface GetInlayHintParams {
    position: Position;
    packageName: string,
}