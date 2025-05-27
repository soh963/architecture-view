export interface FileInfo {
    path: string;
    fullPath: string;
    name: string;
    extension: string;
    size: number;
    type: string;
    lastModified: Date;
    isDirectory?: boolean;
    children?: FileInfo[];
}

export interface DependencyInfo {
    from: string;
    to: string;
    type: 'import' | 'export' | 'inheritance';
}

export interface Layer {
    presentation: FileInfo[];
    business: FileInfo[];
    data: FileInfo[];
    utils: FileInfo[];
    config: FileInfo[];
    [key: string]: FileInfo[];
}

export interface ProjectStats {
    totalFiles: number;
    totalSize: number;
    totalDependencies: number;
    filesByType: Record<string, number>;
    avgFileSize: number;
}

export interface ProjectStructure {
    rootPath: string;
    files: FileInfo[];
    fileTree: FileInfo[];
    dependencies: DependencyInfo[];
    layers: Layer;
    stats: ProjectStats;
}

export interface WebviewMessage {
    command: string;
    data?: any;
}