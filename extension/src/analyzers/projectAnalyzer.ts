import * as path from 'path';
import * as fs from 'fs/promises';
import { FileInfo, ProjectStructure, DependencyInfo } from '../types';
import { logger, ErrorGuidelines, PerformanceTracker, checkMemoryUsage } from '../services/logService';

export class ProjectAnalyzer {
    private supportedExtensions = [
        // JavaScript/TypeScript
        '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
        // Web technologies
        '.html', '.htm', '.css', '.scss', '.sass', '.less',
        '.vue', '.svelte', '.astro',
        // Backend languages
        '.php', '.py', '.java', '.cs', '.cpp', '.c', '.h', '.hpp',
        '.go', '.rs', '.rb', '.swift', '.kt', '.scala',
        // Database & Query
        '.sql', '.graphql', '.gql',
        // Configuration & Data
        '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env',
        '.properties', '.conf', '.config',
        // Documentation
        '.md', '.mdx', '.rst', '.txt',
        // Shell scripts
        '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
        // Other
        '.r', '.m', '.dart', '.lua', '.pl', '.ex', '.exs'
    ];

    private ignoreDirs = [
        'node_modules', '.git', 'dist', 'build', 'out',
        '.vscode', '.idea', '__pycache__', 'venv', '.env',
        'coverage', '.nyc_output', '.cache', 'tmp', 'temp'
    ];

    private fileCache = new Map<string, string>();

    async analyzeProject(rootPath: string): Promise<ProjectStructure> {
        const tracker = new PerformanceTracker('Project Analysis');
        logger.info('Starting project analysis', { rootPath });
        
        // Use parallel file tree building for better performance
        const fileTree = await this.buildFileTreeParallel(rootPath);
        const files = this.flattenFileTree(fileTree);
        
        logger.info('File scan complete', { 
            totalFiles: files.length,
            totalDirs: this.countDirectories(fileTree)
        });
        
        checkMemoryUsage();
        
        // Batch process dependencies for better performance
        const dependencies = await this.analyzeDependenciesParallel(files);
        logger.info('Dependency analysis complete', { count: dependencies.length });
        
        tracker.end();
        
        return {
            rootPath,
            files,
            fileTree,
            dependencies,
            layers: this.organizeLayers(files, dependencies),
            stats: this.calculateStats(files, dependencies)
        };
    }

    private async buildFileTree(dirPath: string, relativePath = ''): Promise<FileInfo[]> {
        const items: FileInfo[] = [];
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relPath = path.join(relativePath, entry.name);
                
                if (entry.isDirectory()) {
                    if (!this.ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
                        const children = await this.buildFileTree(fullPath, relPath);
                        const stats = await fs.stat(fullPath);
                        
                        items.push({
                            path: relPath.replace(/\\/g, '/'),
                            fullPath,
                            name: entry.name,
                            extension: '',
                            size: 0,
                            type: 'Directory',
                            lastModified: stats.mtime,
                            isDirectory: true,
                            children
                        });
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    const stats = await fs.stat(fullPath);
                    
                    items.push({
                        path: relPath.replace(/\\/g, '/'),
                        fullPath,
                        name: entry.name,
                        extension: ext,
                        size: stats.size,
                        type: this.getFileType(ext),
                        lastModified: stats.mtime,
                        isDirectory: false,
                        comments: [] // 나중에 채워질 예정
                    });
                }
            }
        } catch (error) {
            ErrorGuidelines.FILE_READ_ERROR.log(dirPath, error as Error);
        }
        
        // Sort items: directories first, then files
        return items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) {return -1;}
            if (!a.isDirectory && b.isDirectory) {return 1;}
            return a.name.localeCompare(b.name);
        });
    }

    private async buildFileTreeParallel(dirPath: string, relativePath = ''): Promise<FileInfo[]> {
        const items: FileInfo[] = [];
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            // Process entries in parallel batches
            const BATCH_SIZE = 10;
            const batches = [];
            
            for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                const batch = entries.slice(i, i + BATCH_SIZE);
                batches.push(batch);
            }
            
            for (const batch of batches) {
                const batchPromises = batch.map(async (entry) => {
                    const fullPath = path.join(dirPath, entry.name);
                    const relPath = path.join(relativePath, entry.name);
                    
                    if (entry.isDirectory()) {
                        if (!this.ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
                            const [children, stats] = await Promise.all([
                                this.buildFileTreeParallel(fullPath, relPath),
                                fs.stat(fullPath)
                            ]);
                            
                            return {
                                path: relPath.replace(/\\/g, '/'),
                                fullPath,
                                name: entry.name,
                                extension: '',
                                size: 0,
                                type: 'Directory',
                                lastModified: stats.mtime,
                                isDirectory: true,
                                children
                            };
                        }
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name);
                        const stats = await fs.stat(fullPath);
                        
                        return {
                            path: relPath.replace(/\\/g, '/'),
                            fullPath,
                            name: entry.name,
                            extension: ext,
                            size: stats.size,
                            type: this.getFileType(ext),
                            lastModified: stats.mtime,
                            isDirectory: false,
                            comments: [] // 나중에 채워질 예정
                        };
                    }
                    
                    return null;
                });
                
                const batchResults = await Promise.all(batchPromises);
                items.push(...batchResults.filter(item => item !== null) as FileInfo[]);
            }
        } catch (error) {
            ErrorGuidelines.FILE_READ_ERROR.log(dirPath, error as Error);
        }
        
        // Sort items: directories first, then files
        return items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) {return -1;}
            if (!a.isDirectory && b.isDirectory) {return 1;}
            return a.name.localeCompare(b.name);
        });
    }

    private flattenFileTree(tree: FileInfo[]): FileInfo[] {
        const files: FileInfo[] = [];
        
        const flatten = (items: FileInfo[]) => {
            for (const item of items) {
                if (!item.isDirectory && this.supportedExtensions.includes(item.extension)) {
                    files.push(item);
                }
                if (item.children) {
                    flatten(item.children);
                }
            }
        };
        
        flatten(tree);
        return files;
    }

    private countDirectories(tree: FileInfo[]): number {
        let count = 0;
        
        const count_dirs = (items: FileInfo[]) => {
            for (const item of items) {
                if (item.isDirectory) {
                    count++;
                    if (item.children) {
                        count_dirs(item.children);
                    }
                }
            }
        };
        
        count_dirs(tree);
        return count;
    }

    private async analyzeDependencies(files: FileInfo[]): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        const fileMap = new Map(files.map(f => [f.path, f]));
        const usedFiles = new Set<string>(); // 사용되는 파일 추적
        
        for (const file of files) {
            try {
                const content = await this.readFileContent(file.fullPath);
                this.fileCache.set(file.path, content);
                
                // 주석 추출 및 파일 설명 생성
                if (this.supportedExtensions.includes(file.extension)) {
                    file.comments = this.extractComments(content, file.extension);
                    file.description = this.generateFileDescription(file, content);
                    
                    // 코드 요소 추출 (함수, 변수, 클래스)
                    const codeElements = this.extractCodeElements(content, file.extension);
                    file.functions = codeElements.functions;
                    file.variables = codeElements.variables;
                    file.classes = codeElements.classes;
                }
                
                // JavaScript/TypeScript
                if (['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'].includes(file.extension)) {
                    const deps = await this.extractJSDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
                // Python
                else if (file.extension === '.py') {
                    const deps = await this.extractPythonDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
                // Java
                else if (file.extension === '.java') {
                    const deps = await this.extractJavaDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
                // Go
                else if (file.extension === '.go') {
                    const deps = await this.extractGoDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
                // PHP
                else if (file.extension === '.php') {
                    const deps = await this.extractPHPDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
                // CSS/SCSS
                else if (['.css', '.scss', '.sass', '.less'].includes(file.extension)) {
                    const deps = await this.extractCSSDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
                // HTML
                else if (['.html', '.htm'].includes(file.extension)) {
                    const deps = await this.extractHTMLDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
                
                // Extract database connections from any file
                const dbConnections = await this.extractDatabaseConnections(file, content);
                dependencies.push(...dbConnections);
            } catch (error) {
                ErrorGuidelines.ANALYSIS_ERROR.log(file.path, error as Error);
            }
        }
        
        // 모든 의존성을 분석하여 사용되는 파일 표시
        const uniqueDeps = this.deduplicateDependencies(dependencies);
        
        // 참조 횟수 계산을 위한 맵
        const referenceCountMap = new Map<string, number>();
        
        uniqueDeps.forEach(dep => {
            usedFiles.add(dep.to);
            // 참조 횟수 증가
            referenceCountMap.set(dep.to, (referenceCountMap.get(dep.to) || 0) + 1);
        });
        
        // 각 파일의 isUsed 속성과 referenceCount 설정
        // 파일이 다른 파일을 import하는지 확인하기 위한 맵
        const filesWithDependencies = new Set<string>();
        uniqueDeps.forEach(dep => {
            filesWithDependencies.add(dep.from);
        });
        
        files.forEach(file => {
            // 파일이 사용되지 않는 것으로 간주되는 조건:
            // 1. 다른 파일에서 참조되지 않음 (referenceCount === 0)
            // 2. 다른 파일을 import하지 않음 (독립적)
            const hasNoDependencies = !filesWithDependencies.has(file.path);
            const notReferenced = !usedFiles.has(file.path);
            
            file.isUsed = !(hasNoDependencies && notReferenced);
            file.referenceCount = referenceCountMap.get(file.path) || 0;
        });
        
        return uniqueDeps;
    }

    private async analyzeDependenciesParallel(files: FileInfo[]): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        const fileMap = new Map(files.map(f => [f.path, f]));
        const usedFiles = new Set<string>();
        
        // Process files in parallel batches
        const BATCH_SIZE = 20;
        const batches = [];
        
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);
            batches.push(batch);
        }
        
        for (const batch of batches) {
            const batchPromises = batch.map(async (file) => {
                try {
                    const content = await this.readFileContent(file.fullPath);
                    this.fileCache.set(file.path, content);
                    
                    const fileDeps: DependencyInfo[] = [];
                    
                    // Extract comments and file description
                    if (this.supportedExtensions.includes(file.extension)) {
                        file.comments = this.extractComments(content, file.extension);
                        file.description = this.generateFileDescription(file, content);
                        
                        // Extract code elements
                        const codeElements = this.extractCodeElements(content, file.extension);
                        file.functions = codeElements.functions;
                        file.variables = codeElements.variables;
                        file.classes = codeElements.classes;
                    }
                    
                    // Extract dependencies based on file type
                    if (['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'].includes(file.extension)) {
                        const deps = await this.extractJSDependencies(file, content, fileMap);
                        fileDeps.push(...deps);
                    }
                    else if (file.extension === '.py') {
                        const deps = await this.extractPythonDependencies(file, content, fileMap);
                        fileDeps.push(...deps);
                    }
                    else if (file.extension === '.java') {
                        const deps = await this.extractJavaDependencies(file, content, fileMap);
                        fileDeps.push(...deps);
                    }
                    else if (file.extension === '.go') {
                        const deps = await this.extractGoDependencies(file, content, fileMap);
                        fileDeps.push(...deps);
                    }
                    else if (file.extension === '.php') {
                        const deps = await this.extractPHPDependencies(file, content, fileMap);
                        fileDeps.push(...deps);
                    }
                    else if (['.css', '.scss', '.sass', '.less'].includes(file.extension)) {
                        const deps = await this.extractCSSDependencies(file, content, fileMap);
                        fileDeps.push(...deps);
                    }
                    else if (['.html', '.htm'].includes(file.extension)) {
                        const deps = await this.extractHTMLDependencies(file, content, fileMap);
                        fileDeps.push(...deps);
                    }
                    
                    // Extract database connections
                    const dbConnections = await this.extractDatabaseConnections(file, content);
                    fileDeps.push(...dbConnections);
                    
                    return fileDeps;
                } catch (error) {
                    ErrorGuidelines.ANALYSIS_ERROR.log(file.path, error as Error);
                    return [];
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(deps => dependencies.push(...deps));
        }
        
        // Deduplicate and calculate usage
        const uniqueDeps = this.deduplicateDependencies(dependencies);
        
        // Calculate reference counts
        const referenceCountMap = new Map<string, number>();
        
        uniqueDeps.forEach(dep => {
            usedFiles.add(dep.to);
            referenceCountMap.set(dep.to, (referenceCountMap.get(dep.to) || 0) + 1);
        });
        
        // Identify files with dependencies
        const filesWithDependencies = new Set<string>();
        uniqueDeps.forEach(dep => {
            filesWithDependencies.add(dep.from);
        });
        
        // Set isUsed and referenceCount for each file
        files.forEach(file => {
            const hasNoDependencies = !filesWithDependencies.has(file.path);
            const notReferenced = !usedFiles.has(file.path);
            
            file.isUsed = !(hasNoDependencies && notReferenced);
            file.referenceCount = referenceCountMap.get(file.path) || 0;
        });
        
        return uniqueDeps;
    }

    private async readFileContent(filePath: string): Promise<string> {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            ErrorGuidelines.FILE_READ_ERROR.log(filePath, error as Error);
            return '';
        }
    }

    private async extractJSDependencies(
        file: FileInfo, 
        content: string, 
        fileMap: Map<string, FileInfo>
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // ES6 imports
        const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
        // CommonJS requires
        const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;
        // Dynamic imports
        const dynamicImportRegex = /import\s*\(['"]([^'"]+)['"]\)/g;
        
        const allMatches = [
            ...content.matchAll(importRegex),
            ...content.matchAll(requireRegex),
            ...content.matchAll(dynamicImportRegex)
        ];
        
        for (const match of allMatches) {
            const importPath = match[1];
            
            if (importPath.startsWith('.') || importPath.startsWith('/')) {
                // 내부 파일 import
                const resolvedPath = this.resolveImportPath(file.path, importPath);
                const variations = this.getPathVariations(resolvedPath);
                
                let found = false;
                for (const variant of variations) {
                    if (fileMap.has(variant)) {
                        dependencies.push({
                            from: file.path,
                            to: variant,
                            type: 'import'
                        });
                        found = true;
                        break;
                    }
                }
                
                // 파일이 프로젝트에 없더라도 import 추적
                if (!found) {
                    dependencies.push({
                        from: file.path,
                        to: `[Missing] ${resolvedPath}`,
                        type: 'import'
                    });
                }
            } else {
                // 외부 패키지 import도 추적
                dependencies.push({
                    from: file.path,
                    to: `[External] ${importPath}`,
                    type: 'import'
                });
            }
        }
        
        return dependencies;
    }

    private async extractPythonDependencies(
        file: FileInfo, 
        content: string, 
        fileMap: Map<string, FileInfo>
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // Python imports
        const importRegex = /(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1] || match[2];
            if (importPath.startsWith('.')) {
                const resolvedPath = this.resolvePythonImportPath(file.path, importPath);
                const variations = this.getPathVariations(resolvedPath);
                
                for (const variant of variations) {
                    if (fileMap.has(variant)) {
                        dependencies.push({
                            from: file.path,
                            to: variant,
                            type: 'import'
                        });
                        break;
                    }
                }
            }
        }
        
        return dependencies;
    }

    private async extractJavaDependencies(
        file: FileInfo, 
        content: string, 
        fileMap: Map<string, FileInfo>
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // Java imports
        const importRegex = /import\s+(?:static\s+)?[\w.]+\.(\w+);/g;
        const packageRegex = /package\s+([\w.]+);/;
        
        const packageMatch = content.match(packageRegex);
        const currentPackage = packageMatch ? packageMatch[1] : '';
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const className = match[1];
            // Try to find the file in the project
            for (const [path, f] of fileMap) {
                if (f.name === `${className}.java`) {
                    dependencies.push({
                        from: file.path,
                        to: path,
                        type: 'import'
                    });
                }
            }
        }
        
        return dependencies;
    }

    private async extractGoDependencies(
        file: FileInfo, 
        content: string, 
        fileMap: Map<string, FileInfo>
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // Go imports
        const importRegex = /import\s+(?:\(\s*((?:[^)]+))\s*\)|"([^"]+)")/g;
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            const imports = match[1] || match[2];
            const importPaths = imports.match(/"([^"]+)"/g) || [`"${imports}"`];
            
            for (const imp of importPaths) {
                const importPath = imp.replace(/"/g, '');
                if (importPath.startsWith('./') || importPath.startsWith('../')) {
                    const resolvedPath = this.resolveImportPath(file.path, importPath);
                    const variations = this.getPathVariations(resolvedPath);
                    
                    for (const variant of variations) {
                        if (fileMap.has(variant)) {
                            dependencies.push({
                                from: file.path,
                                to: variant,
                                type: 'import'
                            });
                            break;
                        }
                    }
                }
            }
        }
        
        return dependencies;
    }

    private async extractPHPDependencies(
        file: FileInfo, 
        content: string, 
        fileMap: Map<string, FileInfo>
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // PHP includes/requires
        const includeRegex = /(?:include|require|include_once|require_once)\s*\(?['"]([^'"]+)['"]\)?/g;
        // PHP use statements
        const useRegex = /use\s+([\w\\]+)(?:\s+as\s+\w+)?;/g;
        
        let match;
        while ((match = includeRegex.exec(content)) !== null) {
            const includePath = match[1];
            if (includePath.includes('./') || includePath.includes('../')) {
                const resolvedPath = this.resolveImportPath(file.path, includePath);
                const variations = this.getPathVariations(resolvedPath);
                
                for (const variant of variations) {
                    if (fileMap.has(variant)) {
                        dependencies.push({
                            from: file.path,
                            to: variant,
                            type: 'include'
                        });
                        break;
                    }
                }
            }
        }
        
        return dependencies;
    }

    private async extractCSSDependencies(
        file: FileInfo, 
        content: string, 
        fileMap: Map<string, FileInfo>
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // CSS @import
        const importRegex = /@import\s+(?:url\s*\()?\s*['"]([^'"]+)['"]/g;
        
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            if (!importPath.startsWith('http') && !importPath.startsWith('//')) {
                const resolvedPath = this.resolveImportPath(file.path, importPath);
                const variations = this.getPathVariations(resolvedPath);
                
                for (const variant of variations) {
                    if (fileMap.has(variant)) {
                        dependencies.push({
                            from: file.path,
                            to: variant,
                            type: 'import'
                        });
                        break;
                    }
                }
            }
        }
        
        return dependencies;
    }

    private async extractHTMLDependencies(
        file: FileInfo, 
        content: string, 
        fileMap: Map<string, FileInfo>
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // Script tags
        const scriptRegex = /<script[^>]*src=['"]([^'"]+)['"]/g;
        // Link tags (CSS)
        const linkRegex = /<link[^>]*href=['"]([^'"]+)['"]/g;
        // Import statements in script tags
        const moduleRegex = /<script[^>]*type=['"]module['"][^>]*>[\s\S]*?<\/script>/g;
        
        const patterns = [
            { regex: scriptRegex, type: 'script' },
            { regex: linkRegex, type: 'stylesheet' }
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.regex.exec(content)) !== null) {
                const srcPath = match[1];
                if (!srcPath.startsWith('http') && !srcPath.startsWith('//')) {
                    const resolvedPath = this.resolveImportPath(file.path, srcPath);
                    const variations = this.getPathVariations(resolvedPath);
                    
                    for (const variant of variations) {
                        if (fileMap.has(variant)) {
                            dependencies.push({
                                from: file.path,
                                to: variant,
                                type: pattern.type as 'script' | 'stylesheet'
                            });
                            break;
                        }
                    }
                }
            }
        }
        
        return dependencies;
    }

    private async extractDatabaseConnections(
        file: FileInfo, 
        content: string
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];
        
        // Common database connection patterns
        const dbPatterns = [
            // MySQL/MariaDB
            /mysql:\/\/([^:]+):([^@]+)@([^/]+)\/(\w+)/g,
            /new\s+(?:mysql|MySQL).*?host['":\s]+['"]([^'"]+)['"]/g,
            
            // PostgreSQL
            /postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^/]+)\/(\w+)/g,
            /new\s+(?:Pool|Client).*?host['":\s]+['"]([^'"]+)['"]/g,
            
            // MongoDB
            /mongodb(?:\+srv)?:\/\/([^:]+):([^@]+)@([^/]+)\/(\w+)/g,
            /mongoose\.connect\(['"]([^'"]+)['"]/g,
            
            // Redis
            /redis:\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)/g,
            
            // SQLite
            /sqlite:\/\/\/([^'"]+)/g,
            /Database\(['"]([^'"]+\.(?:db|sqlite))['"]/g,
            
            // Generic connection strings
            /(?:connection|database).*?['"](.*?:\/\/[^'"]+)['"]/gi,
            /(?:DB|DATABASE)_(?:HOST|URL|CONNECTION).*?['"](.*?)['"]/gi
        ];
        
        const dbTypes = ['mysql', 'postgres', 'mongodb', 'redis', 'sqlite', 'database'];
        
        for (const pattern of dbPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const connectionString = match[0];
                let dbType = 'database';
                
                // Determine database type
                for (const type of dbTypes) {
                    if (connectionString.toLowerCase().includes(type)) {
                        dbType = type;
                        break;
                    }
                }
                
                // Create a virtual database node
                dependencies.push({
                    from: file.path,
                    to: `[DB:${dbType}]`,
                    type: 'database'
                });
            }
        }
        
        return dependencies;
    }

    private resolveImportPath(fromPath: string, importPath: string): string {
        const fromDir = path.dirname(fromPath);
        const resolved = path.join(fromDir, importPath);
        return path.normalize(resolved).replace(/\\/g, '/');
    }

    private resolvePythonImportPath(fromPath: string, importPath: string): string {
        const fromDir = path.dirname(fromPath);
        const parts = importPath.split('.');
        parts.shift(); // Remove leading dot
        const resolved = path.join(fromDir, ...parts);
        return path.normalize(resolved).replace(/\\/g, '/');
    }

    private getPathVariations(basePath: string): string[] {
        const variations = [basePath];
        const ext = path.extname(basePath);
        
        if (!ext) {
            // Try common extensions
            variations.push(
                `${basePath}.ts`,
                `${basePath}.js`,
                `${basePath}.tsx`,
                `${basePath}.jsx`,
                `${basePath}.py`,
                `${basePath}.java`,
                `${basePath}.go`,
                `${basePath}.php`,
                `${basePath}.html`,
                `${basePath}.htm`,
                `${basePath}.css`,
                `${basePath}.scss`,
                `${basePath}.sql`,
                `${basePath}/index.ts`,
                `${basePath}/index.js`,
                `${basePath}/index.tsx`,
                `${basePath}/index.jsx`,
                `${basePath}/index.php`,
                `${basePath}/index.html`
            );
        }
        
        return variations;
    }

    private deduplicateDependencies(dependencies: DependencyInfo[]): DependencyInfo[] {
        const unique = new Map<string, DependencyInfo>();
        
        for (const dep of dependencies) {
            const key = `${dep.from}::${dep.to}::${dep.type}`;
            if (!unique.has(key)) {
                unique.set(key, dep);
            }
        }
        
        return Array.from(unique.values());
    }

    private getFileType(extension: string): string {
        const typeMap: Record<string, string> = {
            // JavaScript/TypeScript
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript React',
            '.js': 'JavaScript',
            '.jsx': 'JavaScript React',
            '.mjs': 'JavaScript Module',
            '.cjs': 'CommonJS Module',
            // Web
            '.html': 'HTML',
            '.htm': 'HTML',
            '.css': 'CSS',
            '.scss': 'SCSS',
            '.sass': 'Sass',
            '.less': 'Less',
            '.vue': 'Vue',
            '.svelte': 'Svelte',
            '.astro': 'Astro',
            // Backend
            '.php': 'PHP',
            '.py': 'Python',
            '.java': 'Java',
            '.cs': 'C#',
            '.cpp': 'C++',
            '.c': 'C',
            '.h': 'C Header',
            '.hpp': 'C++ Header',
            '.go': 'Go',
            '.rs': 'Rust',
            '.rb': 'Ruby',
            '.swift': 'Swift',
            '.kt': 'Kotlin',
            '.scala': 'Scala',
            // Database
            '.sql': 'SQL',
            '.graphql': 'GraphQL',
            '.gql': 'GraphQL',
            // Config
            '.json': 'JSON',
            '.xml': 'XML',
            '.yaml': 'YAML',
            '.yml': 'YAML',
            '.toml': 'TOML',
            '.ini': 'INI',
            '.env': 'Environment',
            '.properties': 'Properties',
            '.conf': 'Configuration',
            '.config': 'Configuration',
            // Docs
            '.md': 'Markdown',
            '.mdx': 'MDX',
            '.rst': 'reStructuredText',
            '.txt': 'Text',
            // Scripts
            '.sh': 'Shell Script',
            '.bash': 'Bash Script',
            '.zsh': 'Zsh Script',
            '.ps1': 'PowerShell',
            '.bat': 'Batch',
            '.cmd': 'Command',
            // Other
            '.r': 'R',
            '.m': 'MATLAB',
            '.dart': 'Dart',
            '.lua': 'Lua',
            '.pl': 'Perl',
            '.ex': 'Elixir',
            '.exs': 'Elixir Script'
        };
        
        return typeMap[extension] || 'Unknown';
    }

    private organizeLayers(files: FileInfo[], _dependencies: DependencyInfo[]) {
        const layers = {
            presentation: [] as FileInfo[],
            business: [] as FileInfo[],
            data: [] as FileInfo[],
            utils: [] as FileInfo[],
            config: [] as FileInfo[]
        };

        files.forEach(file => {
            const pathLower = file.path.toLowerCase();
            const nameLower = file.name.toLowerCase();
            
            // Presentation layer - UI components
            if (pathLower.includes('view') || pathLower.includes('component') || 
                pathLower.includes('ui') || pathLower.includes('page') ||
                pathLower.includes('screen') || pathLower.includes('widget') ||
                pathLower.includes('template') || pathLower.includes('layout') ||
                file.extension === '.vue' || file.extension === '.svelte' ||
                file.extension === '.tsx' || file.extension === '.jsx' ||
                file.extension === '.html' || file.extension === '.htm' ||
                file.extension === '.css' || file.extension === '.scss' ||
                file.extension === '.sass' || file.extension === '.less') {
                layers.presentation.push(file);
            } 
            // Business layer - controllers and services
            else if (pathLower.includes('service') || pathLower.includes('business') || 
                     pathLower.includes('controller') || pathLower.includes('handler') ||
                     pathLower.includes('manager') || pathLower.includes('provider') ||
                     pathLower.includes('api') || pathLower.includes('route') ||
                     pathLower.includes('endpoint') || pathLower.includes('middleware')) {
                layers.business.push(file);
            } 
            // Data layer - models and database
            else if (pathLower.includes('model') || pathLower.includes('data') || 
                     pathLower.includes('repository') || pathLower.includes('entity') ||
                     pathLower.includes('schema') || pathLower.includes('database') ||
                     pathLower.includes('migration') || pathLower.includes('seed') ||
                     file.extension === '.sql' || file.extension === '.graphql' ||
                     file.extension === '.gql') {
                layers.data.push(file);
            } 
            // Utilities layer - helpers and tools
            else if (pathLower.includes('util') || pathLower.includes('helper') || 
                     pathLower.includes('common') || pathLower.includes('shared') ||
                     pathLower.includes('lib') || pathLower.includes('tool') ||
                     pathLower.includes('constant') || pathLower.includes('enum')) {
                layers.utils.push(file);
            } 
            // Config layer - configuration files
            else if (pathLower.includes('config') || nameLower.includes('config') ||
                     nameLower === 'package.json' || nameLower === 'tsconfig.json' ||
                     nameLower === 'webpack.config.js' || nameLower === 'babel.config.js' ||
                     nameLower === '.env' || file.extension === '.env' ||
                     file.extension === '.json' || file.extension === '.yaml' ||
                     file.extension === '.yml' || file.extension === '.xml' ||
                     file.extension === '.toml' || file.extension === '.ini' ||
                     file.extension === '.properties' || file.extension === '.conf') {
                layers.config.push(file);
            } 
            else {
                // Smart default categorization based on file type
                if (['.php', '.py', '.java', '.cs', '.go', '.rs'].includes(file.extension)) {
                    layers.business.push(file);
                } else if (['.sh', '.bash', '.ps1', '.bat'].includes(file.extension)) {
                    layers.utils.push(file);
                } else {
                    layers.utils.push(file);
                }
            }
        });

        return layers;
    }

    private calculateStats(files: FileInfo[], dependencies: DependencyInfo[]) {
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const filesByType = files.reduce((acc, file) => {
            acc[file.type] = (acc[file.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Calculate complexity metrics
        const avgDependenciesPerFile = dependencies.length / Math.max(files.length, 1);
        const filesWithDependencies = new Set(dependencies.map(d => d.from)).size;
        const dependencyRatio = filesWithDependencies / Math.max(files.length, 1);

        return {
            totalFiles: files.length,
            totalSize,
            totalDependencies: dependencies.length,
            filesByType,
            avgFileSize: Math.round(totalSize / Math.max(files.length, 1)),
            avgDependenciesPerFile: Math.round(avgDependenciesPerFile * 10) / 10,
            dependencyRatio: Math.round(dependencyRatio * 100)
        };
    }

    getFileContent(filePath: string): string | undefined {
        return this.fileCache.get(filePath);
    }
    
    private extractComments(content: string, extension: string): string[] {
        const comments: string[] = [];
        
        // 언어별 주석 패턴
        const patterns: Record<string, RegExp[]> = {
            // C-style comments (JS, TS, Java, C++, etc.)
            '.js': [
                /\/\*\*([\s\S]*?)\*\//g,  // JSDoc
                /\/\*([\s\S]*?)\*\//g,     // Block comments
                /\/\/\s*(.+)/g             // Line comments
            ],
            '.ts': [
                /\/\*\*([\s\S]*?)\*\//g,
                /\/\*([\s\S]*?)\*\//g,
                /\/\/\s*(.+)/g
            ],
            '.java': [
                /\/\*\*([\s\S]*?)\*\//g,
                /\/\*([\s\S]*?)\*\//g,
                /\/\/\s*(.+)/g
            ],
            '.cpp': [
                /\/\*\*([\s\S]*?)\*\//g,
                /\/\*([\s\S]*?)\*\//g,
                /\/\/\s*(.+)/g
            ],
            '.c': [
                /\/\*([\s\S]*?)\*\//g,
                /\/\/\s*(.+)/g
            ],
            // Python
            '.py': [
                /"""([\s\S]*?)"""/g,       // Docstrings
                /'''([\s\S]*?)'''/g,       // Triple quotes
                /#\s*(.+)/g                // Line comments
            ],
            // PHP
            '.php': [
                /\/\*\*([\s\S]*?)\*\//g,
                /\/\*([\s\S]*?)\*\//g,
                /\/\/\s*(.+)/g,
                /#\s*(.+)/g
            ],
            // Ruby
            '.rb': [
                /=begin([\s\S]*?)=end/g,   // Block comments
                /#\s*(.+)/g                // Line comments
            ],
            // HTML
            '.html': [
                /<!--([\s\S]*?)-->/g       // HTML comments
            ],
            '.htm': [
                /<!--([\s\S]*?)-->/g
            ],
            // CSS
            '.css': [
                /\/\*([\s\S]*?)\*\//g      // CSS comments
            ],
            '.scss': [
                /\/\*([\s\S]*?)\*\//g,
                /\/\/\s*(.+)/g
            ],
            // SQL
            '.sql': [
                /\/\*([\s\S]*?)\*\//g,
                /--\s*(.+)/g               // SQL line comments
            ]
        };
        
        // 확장자에 해당하는 패턴 가져오기
        let applicablePatterns = patterns[extension];
        
        // 기본 패턴 (JS 스타일)
        if (!applicablePatterns) {
            applicablePatterns = patterns['.js'];
        }
        
        // 각 패턴으로 주석 추출
        applicablePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const comment = match[1] || match[0];
                // 주석 정리
                const cleaned = comment
                    .replace(/^\s*\*\s?/gm, '') // Remove leading asterisks
                    .replace(/\r\n/g, '\n')      // Normalize line endings
                    .trim();
                
                if (cleaned && cleaned.length > 10) { // 의미있는 주석만
                    comments.push(cleaned);
                }
            }
        });
        
        // 중복 제거 및 처음 5개만 반환
        return [...new Set(comments)].slice(0, 5);
    }

    private generateFileDescription(file: FileInfo, _content: string): string {
        const pathLower = file.path.toLowerCase();
        const nameLower = file.name.toLowerCase();
        
        // 파일 이름과 경로 기반 역할 추론
        if (pathLower.includes('component') || pathLower.includes('view')) {
            if (nameLower.includes('header')) {return '헤더 컴포넌트 - 상단 네비게이션 및 메뉴 표시';}
            if (nameLower.includes('footer')) {return '푸터 컴포넌트 - 하단 정보 및 링크 표시';}
            if (nameLower.includes('sidebar')) {return '사이드바 컴포넌트 - 측면 네비게이션 메뉴';}
            if (nameLower.includes('nav')) {return '네비게이션 컴포넌트 - 페이지 이동 메뉴';}
            if (nameLower.includes('dashboard')) {return '대시보드 컴포넌트 - 주요 정보 요약 표시';}
            if (nameLower.includes('button')) {return '버튼 컴포넌트 - 재사용 가능한 버튼 UI';}
            if (nameLower.includes('modal')) {return '모달 컴포넌트 - 팝업 다이얼로그 표시';}
            if (nameLower.includes('form')) {return '폼 컴포넌트 - 사용자 입력 양식';}
            if (nameLower.includes('table')) {return '테이블 컴포넌트 - 데이터 표 형식 표시';}
            if (nameLower.includes('list')) {return '리스트 컴포넌트 - 목록 형태 데이터 표시';}
            if (nameLower.includes('card')) {return '카드 컴포넌트 - 정보를 카드 형태로 표시';}
            if (nameLower.includes('chart')) {return '차트 컴포넌트 - 데이터 시각화 그래프';}
            return 'UI 컴포넌트 - 사용자 인터페이스 구성 요소';
        }
        
        if (pathLower.includes('service') || pathLower.includes('api')) {
            if (nameLower.includes('auth')) {return '인증 서비스 - 로그인/로그아웃 처리';}
            if (nameLower.includes('user')) {return '사용자 서비스 - 사용자 정보 관리';}
            if (nameLower.includes('data')) {return '데이터 서비스 - 데이터 처리 및 관리';}
            if (nameLower.includes('http')) {return 'HTTP 서비스 - 네트워크 요청 처리';}
            if (nameLower.includes('api')) {return 'API 서비스 - 외부 API 통신';}
            if (nameLower.includes('log')) {return '로깅 서비스 - 시스템 로그 기록';}
            if (nameLower.includes('cache')) {return '캐싱 서비스 - 데이터 임시 저장';}
            if (nameLower.includes('email')) {return '이메일 서비스 - 이메일 발송 처리';}
            if (nameLower.includes('payment')) {return '결제 서비스 - 결제 프로세스 처리';}
            return '비즈니스 서비스 - 핵심 비즈니스 로직 처리';
        }
        
        if (pathLower.includes('model') || pathLower.includes('entity')) {
            if (nameLower.includes('user')) {return '사용자 모델 - 사용자 데이터 구조';}
            if (nameLower.includes('product')) {return '상품 모델 - 상품 정보 구조';}
            if (nameLower.includes('order')) {return '주문 모델 - 주문 데이터 구조';}
            if (nameLower.includes('post')) {return '게시글 모델 - 게시글 데이터 구조';}
            if (nameLower.includes('comment')) {return '댓글 모델 - 댓글 데이터 구조';}
            return '데이터 모델 - 데이터 구조 정의';
        }
        
        if (pathLower.includes('util') || pathLower.includes('helper')) {
            if (nameLower.includes('date')) {return '날짜 유틸리티 - 날짜/시간 처리 함수';}
            if (nameLower.includes('string')) {return '문자열 유틸리티 - 문자열 처리 함수';}
            if (nameLower.includes('validation')) {return '유효성 검사 - 데이터 검증 함수';}
            if (nameLower.includes('format')) {return '포맷터 - 데이터 형식 변환';}
            if (nameLower.includes('crypto')) {return '암호화 유틸리티 - 데이터 암호화/복호화';}
            return '유틸리티 함수 - 공통 기능 헬퍼 함수';
        }
        
        if (pathLower.includes('config')) {
            if (nameLower.includes('database')) {return '데이터베이스 설정 - DB 연결 구성';}
            if (nameLower.includes('server')) {return '서버 설정 - 서버 환경 구성';}
            if (nameLower.includes('app')) {return '애플리케이션 설정 - 앱 전반 설정';}
            if (nameLower.includes('webpack')) {return 'Webpack 설정 - 번들링 구성';}
            if (nameLower.includes('env')) {return '환경 변수 - 환경별 설정값';}
            return '설정 파일 - 시스템 구성 설정';
        }
        
        if (pathLower.includes('test')) {
            if (nameLower.includes('unit')) {return '단위 테스트 - 개별 기능 테스트';}
            if (nameLower.includes('integration')) {return '통합 테스트 - 컴포넌트 간 테스트';}
            if (nameLower.includes('e2e')) {return 'E2E 테스트 - 전체 시나리오 테스트';}
            return '테스트 코드 - 기능 검증 테스트';
        }
        
        if (pathLower.includes('route') || pathLower.includes('router')) {
            return '라우팅 설정 - URL 경로 및 페이지 연결';
        }
        
        if (pathLower.includes('middleware')) {
            if (nameLower.includes('auth')) {return '인증 미들웨어 - 접근 권한 검증';}
            if (nameLower.includes('error')) {return '에러 미들웨어 - 에러 처리';}
            if (nameLower.includes('log')) {return '로깅 미들웨어 - 요청/응답 로깅';}
            return '미들웨어 - 요청 처리 중간 계층';
        }
        
        if (pathLower.includes('controller')) {
            return '컨트롤러 - 요청 처리 및 응답 생성';
        }
        
        if (pathLower.includes('repository') || pathLower.includes('dao')) {
            return '데이터 저장소 - 데이터베이스 접근 계층';
        }
        
        // 파일 확장자 기반 설명
        switch (file.extension) {
            case '.html': return 'HTML 파일 - 웹 페이지 구조';
            case '.css': return 'CSS 파일 - 스타일 정의';
            case '.scss': return 'SCSS 파일 - 확장된 스타일 정의';
            case '.sql': return 'SQL 파일 - 데이터베이스 쿼리';
            case '.json': return 'JSON 파일 - 구조화된 데이터';
            case '.xml': return 'XML 파일 - 마크업 데이터';
            case '.md': return 'Markdown 파일 - 문서화';
            case '.yaml': return 'YAML 파일 - 구성 데이터';
            case '.env': return '환경 변수 파일 - 비밀 설정값';
            case '.gitignore': return 'Git 무시 파일 - 버전 관리 제외 목록';
            case '.dockerignore': return 'Docker 무시 파일 - 빌드 제외 목록';
            case 'Dockerfile': return 'Docker 파일 - 컨테이너 빌드 설정';
        }
        
        // 첫 번째 주석이나 내용에서 추론
        if (file.comments && file.comments.length > 0) {
            const firstComment = file.comments[0];
            if (firstComment.length < 100) {
                return firstComment;
            }
        }
        
        // 기본 설명
        return `${file.type} 파일 - ${file.name}`;
    }

    private extractCodeElements(content: string, extension: string): {
        functions: string[];
        variables: string[];
        classes: string[];
    } {
        const functions: string[] = [];
        const variables: string[] = [];
        const classes: string[] = [];

        // JavaScript/TypeScript
        if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(extension)) {
            // Extract functions
            const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const funcName = match[1] || match[2];
                if (funcName && !functions.includes(funcName)) {
                    functions.push(funcName);
                }
            }

            // Extract classes
            const classRegex = /class\s+(\w+)/g;
            while ((match = classRegex.exec(content)) !== null) {
                if (!classes.includes(match[1])) {
                    classes.push(match[1]);
                }
            }

            // Extract exported variables/constants
            const varRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g;
            while ((match = varRegex.exec(content)) !== null) {
                if (!variables.includes(match[1]) && !functions.includes(match[1])) {
                    variables.push(match[1]);
                }
            }
        }
        // Python
        else if (extension === '.py') {
            // Extract functions
            const pyFuncRegex = /def\s+(\w+)\s*\(/g;
            let match;
            while ((match = pyFuncRegex.exec(content)) !== null) {
                if (!functions.includes(match[1])) {
                    functions.push(match[1]);
                }
            }

            // Extract classes
            const pyClassRegex = /class\s+(\w+)/g;
            while ((match = pyClassRegex.exec(content)) !== null) {
                if (!classes.includes(match[1])) {
                    classes.push(match[1]);
                }
            }

            // Extract module-level variables
            const pyVarRegex = /^(\w+)\s*=/gm;
            while ((match = pyVarRegex.exec(content)) !== null) {
                if (!variables.includes(match[1]) && match[1].toUpperCase() === match[1]) {
                    // Only include CONSTANT style variables
                    variables.push(match[1]);
                }
            }
        }
        // Java
        else if (extension === '.java') {
            // Extract methods
            const javaMethodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*\)\s*(?:throws\s+\w+\s*)?{/g;
            let match;
            while ((match = javaMethodRegex.exec(content)) !== null) {
                if (!functions.includes(match[1]) && match[1] !== 'if' && match[1] !== 'for' && match[1] !== 'while') {
                    functions.push(match[1]);
                }
            }

            // Extract classes
            const javaClassRegex = /(?:public\s+)?class\s+(\w+)/g;
            while ((match = javaClassRegex.exec(content)) !== null) {
                if (!classes.includes(match[1])) {
                    classes.push(match[1]);
                }
            }

            // Extract fields
            const javaFieldRegex = /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*[;=]/g;
            while ((match = javaFieldRegex.exec(content)) !== null) {
                if (!variables.includes(match[1])) {
                    variables.push(match[1]);
                }
            }
        }

        return { functions, variables, classes };
    }
}