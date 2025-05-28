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
    comments?: string[]; // 파일의 주요 주석들
    isUsed?: boolean; // 다른 파일에서 참조되는지 여부
    description?: string; // 파일의 한글 설명
    referenceCount?: number; // 파일이 참조되는 횟수 (중요도)
    functions?: string[]; // 파일에 정의된 함수들
    variables?: string[]; // 파일에 정의된 변수들
    classes?: string[]; // 파일에 정의된 클래스들
}

export interface DependencyInfo {
    from: string;
    to: string;
    type: 'import' | 'export' | 'inheritance' | 'include' | 'script' | 'stylesheet' | 'database';
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
    data?: unknown;
}