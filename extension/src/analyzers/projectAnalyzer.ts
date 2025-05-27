import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { FileInfo, ProjectStructure, DependencyInfo } from '../types';
import { logger } from '../utils/logger';

export class ProjectAnalyzer {
    private supportedExtensions = [
        '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
        '.py', '.java', '.cpp', '.cs', '.go', '.rs',
        '.vue', '.svelte', '.html', '.css', '.scss',
        '.json', '.xml', '.yaml', '.yml', '.md'
    ];

    private ignoreDirs = [
        'node_modules', '.git', 'dist', 'build', 'out',
        '.vscode', '.idea', '__pycache__', 'venv', '.env',
        'coverage', '.nyc_output', '.cache', 'tmp', 'temp'
    ];

    private fileCache = new Map<string, string>();

    async analyzeProject(rootPath: string): Promise<ProjectStructure> {
        logger.info('Starting project analysis', { rootPath });
        
        const fileTree = await this.buildFileTree(rootPath);
        const files = this.flattenFileTree(fileTree);
        
        logger.info('File scan complete', { 
            totalFiles: files.length,
            totalDirs: this.countDirectories(fileTree)
        });
        
        const dependencies = await this.analyzeDependencies(files);
        logger.info('Dependency analysis complete', { count: dependencies.length });
        
        return {
            rootPath,
            files,
            fileTree,
            dependencies,
            layers: this.organizeLayers(files, dependencies),
            stats: this.calculateStats(files, dependencies)
        };
    }

    private async buildFileTree(dirPath: string, relativePath: string = ''): Promise<FileInfo[]> {
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
                        isDirectory: false
                    });
                }
            }
        } catch (error) {
            logger.error('Error scanning directory', error, { dirPath });
        }
        
        // Sort items: directories first, then files
        return items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
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
        
        for (const file of files) {
            try {
                const content = await this.readFileContent(file.fullPath);
                this.fileCache.set(file.path, content);
                
                if (file.extension === '.ts' || file.extension === '.js' || 
                    file.extension === '.tsx' || file.extension === '.jsx' ||
                    file.extension === '.mjs' || file.extension === '.cjs') {
                    const deps = await this.extractJSDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                } else if (file.extension === '.py') {
                    const deps = await this.extractPythonDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                } else if (file.extension === '.java') {
                    const deps = await this.extractJavaDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                } else if (file.extension === '.go') {
                    const deps = await this.extractGoDependencies(file, content, fileMap);
                    dependencies.push(...deps);
                }
            } catch (error) {
                logger.error('Error analyzing dependencies', error, { file: file.path });
            }
        }
        
        return this.deduplicateDependencies(dependencies);
    }

    private async readFileContent(filePath: string): Promise<string> {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            logger.error('Error reading file', error, { filePath });
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
            if (!importPath.startsWith('.')) continue; // Skip node_modules
            
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
                `${basePath}/index.ts`,
                `${basePath}/index.js`,
                `${basePath}/index.tsx`,
                `${basePath}/index.jsx`
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
            '.ts': 'TypeScript',
            '.tsx': 'TypeScript React',
            '.js': 'JavaScript',
            '.jsx': 'JavaScript React',
            '.mjs': 'JavaScript Module',
            '.cjs': 'CommonJS Module',
            '.py': 'Python',
            '.java': 'Java',
            '.cpp': 'C++',
            '.cs': 'C#',
            '.go': 'Go',
            '.rs': 'Rust',
            '.vue': 'Vue',
            '.svelte': 'Svelte',
            '.html': 'HTML',
            '.css': 'CSS',
            '.scss': 'SCSS',
            '.json': 'JSON',
            '.xml': 'XML',
            '.yaml': 'YAML',
            '.yml': 'YAML',
            '.md': 'Markdown'
        };
        
        return typeMap[extension] || 'Unknown';
    }

    private organizeLayers(files: FileInfo[], dependencies: DependencyInfo[]) {
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
            
            if (pathLower.includes('view') || pathLower.includes('component') || 
                pathLower.includes('ui') || pathLower.includes('page') ||
                pathLower.includes('screen') || pathLower.includes('widget') ||
                file.extension === '.vue' || file.extension === '.svelte' ||
                file.extension === '.tsx' || file.extension === '.jsx') {
                layers.presentation.push(file);
            } else if (pathLower.includes('service') || pathLower.includes('business') || 
                       pathLower.includes('controller') || pathLower.includes('handler') ||
                       pathLower.includes('manager') || pathLower.includes('provider')) {
                layers.business.push(file);
            } else if (pathLower.includes('model') || pathLower.includes('data') || 
                       pathLower.includes('repository') || pathLower.includes('entity') ||
                       pathLower.includes('schema') || pathLower.includes('database')) {
                layers.data.push(file);
            } else if (pathLower.includes('util') || pathLower.includes('helper') || 
                       pathLower.includes('common') || pathLower.includes('shared') ||
                       pathLower.includes('lib') || pathLower.includes('tool')) {
                layers.utils.push(file);
            } else if (pathLower.includes('config') || nameLower.includes('config') ||
                       nameLower === 'package.json' || nameLower === 'tsconfig.json' ||
                       file.extension === '.json' || file.extension === '.yaml' ||
                       file.extension === '.yml' || file.extension === '.xml') {
                layers.config.push(file);
            } else {
                // Default to utils for unclassified files
                layers.utils.push(file);
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
}