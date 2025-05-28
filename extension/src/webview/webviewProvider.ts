import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectStructure, WebviewMessage } from '../types';

export class DiagramWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private projectData: ProjectStructure
    ) {}

    createWebview(): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            'codeSyncDiagram',
            'CodeSync Architecture Diagram',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
                ]
            }
        );

        this.panel = panel;
        panel.webview.html = this.getWebviewContent(panel.webview);

        panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            undefined,
            this.context.subscriptions
        );

        // Send project data after webview is ready
        setTimeout(() => {
            panel.webview.postMessage({
                command: 'loadData',
                data: this.transformProjectData()
            });
        }, 500);

        return panel;
    }

    private handleMessage(message: WebviewMessage) {
        const data = message.data as Record<string, any>;
        switch (message.command) {
            case 'openFile':
                this.openFile(data.path as string);
                break;
            case 'showInfo':
                vscode.window.showInformationMessage(data.message as string);
                break;
            case 'showError':
                vscode.window.showErrorMessage(data.message as string);
                break;
            case 'log':
                // Use logger instead of console
                // console.log('[Webview]', message.data);
                break;
            case 'export':
                this.handleExport(data as { format: string; content: string; isBase64?: boolean });
                break;
            case 'getFileContent':
                this.getFileContent(data.path as string);
                break;
            case 'saveFileContent':
                this.saveFileContent(data.path as string, data.content as string);
                break;
        }
    }

    private async openFile(filePath: string) {
        try {
            const fullPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.projectData.rootPath, filePath);
            const document = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`파일을 열 수 없습니다: ${filePath}`);
        }
    }

    private async getFileContent(filePath: string) {
        try {
            const fullPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.projectData.rootPath, filePath);
            
            const fileUri = vscode.Uri.file(fullPath);
            const content = await vscode.workspace.fs.readFile(fileUri);
            const textContent = Buffer.from(content).toString('utf8');
            
            // Limit content size for preview (first 1000 lines)
            const lines = textContent.split('\n');
            let previewContent = lines.slice(0, 1000).join('\n');
            if (lines.length > 1000) {
                previewContent += '\n\n... (file truncated for preview)';
            }
            
            this.panel?.webview.postMessage({
                command: 'fileContent',
                data: { content: previewContent, path: fullPath }
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                command: 'fileContent',
                data: { content: null, error: error instanceof Error ? error.message : String(error) }
            });
        }
    }

    private async saveFileContent(filePath: string, content: string) {
        try {
            const fullPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.projectData.rootPath, filePath);
            
            const fileUri = vscode.Uri.file(fullPath);
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(fileUri, encoder.encode(content));
            
            vscode.window.showInformationMessage(`파일이 저장되었습니다: ${path.basename(filePath)}`);
        } catch (error) {
            vscode.window.showErrorMessage(`파일 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handleExport(data: { format: string; content: string; isBase64?: boolean }) {
        try {
            const diagramDir = path.join(this.projectData.rootPath, 'diagram');
            
            // Create diagram directory if it doesn't exist
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(diagramDir));
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            let fileName: string;
            let content: string | Buffer;
            
            switch (data.format) {
                case 'png':
                    fileName = `architecture-${timestamp}.png`;
                    // Handle base64 PNG data
                    if (data.isBase64) {
                        content = Buffer.from(data.content, 'base64');
                    } else {
                        // Fallback to saving as HTML
                        fileName = `architecture-${timestamp}.html`;
                        content = data.content;
                        vscode.window.showInformationMessage(
                            'PNG export fallback: Saved as HTML.'
                        );
                    }
                    break;
                    
                case 'json':
                    fileName = `architecture-${timestamp}.json`;
                    content = data.content;
                    break;
                    
                case 'html':
                    fileName = `architecture-${timestamp}.html`;
                    content = data.content;
                    break;
                    
                default:
                    throw new Error(`Unknown export format: ${data.format}`);
            }
            
            const filePath = path.join(diagramDir, fileName);
            const buffer = typeof content === 'string' 
                ? Buffer.from(content, 'utf-8')
                : content;
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(filePath),
                buffer
            );
            
            vscode.window.showInformationMessage(
                `Diagram exported to: ${path.relative(this.projectData.rootPath, filePath)}`
            );
            
            // Open the exported file
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc, { preview: false });
            
        } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${error}`);
        }
    }

    private transformProjectData() {
        const layers: Record<string, Array<{ id: string; type: string; label: string; layer: string; dependencies: string[] }>> = {
            vscode: [],
            core: [],
            analysis: [],
            rendering: [],
            utility: []
        };

        // Transform files into components
        const components = this.projectData.files.map(file => {
            const layer = this.determineLayer(file.path);
            const component = {
                id: file.path.replace(/[^a-zA-Z0-9]/g, '_'),
                type: this.getComponentType(file),
                label: file.name,
                name: file.name,
                file: file.path,
                fullPath: file.fullPath,
                layer: layer,
                dependencies: [],
                isUsed: file.isUsed,
                referenceCount: file.referenceCount || 0,
                description: file.description || '',
                comments: file.comments || [],
                functions: file.functions || [],
                variables: file.variables || [],
                classes: file.classes || []
            };
            
            layers[layer].push(component);
            return component;
        });

        // Transform dependencies into connections
        const connections = this.projectData.dependencies.map(dep => ({
            from: dep.from.replace(/[^a-zA-Z0-9]/g, '_'),
            to: dep.to.startsWith('[DB:') ? dep.to : dep.to.replace(/[^a-zA-Z0-9]/g, '_'),
            type: dep.type,
            label: dep.type
        }));

        return {
            layers,
            components,
            connections,
            dependencies: this.projectData.dependencies, // Include raw dependencies for database processing
            stats: this.projectData.stats,
            fileTree: this.projectData.fileTree || [] // Include the file tree
        };
    }

    private determineLayer(filePath: string): string {
        const pathLower = filePath.toLowerCase();
        
        if (pathLower.includes('extension') || pathLower.includes('command')) {
            return 'vscode';
        } else if (pathLower.includes('service') || pathLower.includes('provider')) {
            return 'core';
        } else if (pathLower.includes('analyzer') || pathLower.includes('parser')) {
            return 'analysis';
        } else if (pathLower.includes('view') || pathLower.includes('render') || pathLower.includes('ui')) {
            return 'rendering';
        } else {
            return 'utility';
        }
    }

    private getComponentType(file: { name: string; extension: string }): string {
        if (file.name.includes('Service')) {return 'service';}
        if (file.name.includes('Provider')) {return 'provider';}
        if (file.name.includes('View')) {return 'webview';}
        if (file.extension === '.ts' || file.extension === '.js') {return 'component';}
        return 'file';
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'diagram.js'))
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'diagram.css'))
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>CodeSync Architecture Diagram</title>
</head>
<body>
    <div class="header">
        <h1>CodeSync Diagram - Architecture View</h1>
        <div class="controls">
            <div class="control-group">
                <button class="control-btn" id="toggleSidebar" title="Toggle Sidebar (S)">
                    <span>📋</span> Sidebar
                </button>
                <button class="control-btn" id="searchBtn" title="Search (Ctrl+F)">
                    <span>🔍</span> Search
                </button>
            </div>
            
            <div class="control-group">
                <button class="control-btn" id="zoomOut" title="Zoom Out (-)">
                    <span>➖</span>
                </button>
                <div class="zoom-level" id="zoomLevel">100%</div>
                <button class="control-btn" id="zoomIn" title="Zoom In (+)">
                    <span>➕</span>
                </button>
                <button class="control-btn" id="zoomReset" title="Reset Zoom (0)">
                    <span>🔄</span>
                </button>
            </div>
            
            <div class="control-group">
                <button class="control-btn" id="umlToggle" title="Toggle UML View">
                    <span>📐</span> UML
                </button>
                <button class="control-btn" id="resetViewBtn" title="Reset View">
                    <span>🔄</span> Reset View
                </button>
                <button class="control-btn" id="exportBtn" title="Export Diagram">
                    <span>💾</span> Export
                </button>
                <button class="control-btn" id="fullscreenBtn" title="Fullscreen (F11)">
                    <span>⛶</span>
                </button>
                <button class="control-btn" id="advancedToggle" title="Advanced Controls (A)">
                    <span>⚙️</span> Advanced
                </button>
            </div>
        </div>
    </div>
    
    <div class="main-container">
        <div class="sidebar" id="sidebar">
            <div class="sidebar-section">
                <div class="sidebar-title">
                    <span>📁</span> Quick Navigation
                </div>
                <div class="sidebar-content" id="fileList">
                    <!-- Files will be populated here -->
                </div>
            </div>
            
            <div class="sidebar-section">
                <div class="sidebar-title">
                    <span>🔌</span> Active Connections
                </div>
                <div class="sidebar-content" id="activeConnections">
                    Click on a component to see its connections
                </div>
            </div>
            
            <div class="sidebar-section">
                <div class="sidebar-title">
                    <span>📊</span> Statistics
                </div>
                <div class="sidebar-content" id="statsContent">
                    <!-- Stats will be populated here -->
                </div>
            </div>
            
            <div class="sidebar-section">
                <div class="sidebar-title">
                    <span>🎨</span> Connection Types
                </div>
                <div class="sidebar-content connection-legend">
                    <div class="legend-item">
                        <svg width="40" height="2" style="vertical-align: middle; margin-right: 8px;">
                            <line x1="0" y1="1" x2="40" y2="1" stroke="#58a6ff" stroke-width="2"/>
                        </svg>
                        <span>Import</span>
                    </div>
                    <div class="legend-item">
                        <svg width="40" height="2" style="vertical-align: middle; margin-right: 8px;">
                            <line x1="0" y1="1" x2="40" y2="1" stroke="#3fb950" stroke-width="2" stroke-dasharray="5,5"/>
                        </svg>
                        <span>Export</span>
                    </div>
                    <div class="legend-item">
                        <svg width="40" height="2" style="vertical-align: middle; margin-right: 8px;">
                            <line x1="0" y1="1" x2="40" y2="1" stroke="#f78166" stroke-width="3"/>
                        </svg>
                        <span>Inheritance</span>
                    </div>
                    <div class="legend-item">
                        <svg width="40" height="2" style="vertical-align: middle; margin-right: 8px;">
                            <line x1="0" y1="1" x2="40" y2="1" stroke="#e74c3c" stroke-width="2.5" stroke-dasharray="10,5"/>
                        </svg>
                        <span>Database</span>
                    </div>
                    <div class="legend-item">
                        <svg width="40" height="2" style="vertical-align: middle; margin-right: 8px;">
                            <line x1="0" y1="1" x2="40" y2="1" stroke="#bc6bd6" stroke-width="2" stroke-dasharray="3,3"/>
                        </svg>
                        <span>Include</span>
                    </div>
                    <div class="legend-item">
                        <svg width="40" height="2" style="vertical-align: middle; margin-right: 8px;">
                            <line x1="0" y1="1" x2="40" y2="1" stroke="#f1fa8c" stroke-width="2" stroke-dasharray="8,4"/>
                        </svg>
                        <span>Script</span>
                    </div>
                    <div class="legend-item">
                        <svg width="40" height="2" style="vertical-align: middle; margin-right: 8px;">
                            <line x1="0" y1="1" x2="40" y2="1" stroke="#ff79c6" stroke-width="2" stroke-dasharray="6,6"/>
                        </svg>
                        <span>Stylesheet</span>
                    </div>
                </div>
            </div>
            
            <div class="sidebar-section">
                <div class="sidebar-title">
                    <span>⌨️</span> Keyboard Shortcuts
                </div>
                <div class="sidebar-content">
                    <div><kbd>+</kbd> / <kbd>-</kbd> : Zoom In/Out</div>
                    <div><kbd>0</kbd> : Reset Zoom</div>
                    <div><kbd>S</kbd> : Toggle Sidebar</div>
                    <div><kbd>A</kbd> : Advanced Panel</div>
                    <div><kbd>Ctrl+F</kbd> : Search</div>
                    <div><kbd>F11</kbd> : Fullscreen</div>
                    <div><kbd>Click+Drag</kbd> : Pan</div>
                    <div><kbd>Scroll</kbd> : Zoom</div>
                </div>
            </div>
        </div>
        
        <div class="diagram-container">
            <div class="search-box" id="searchBox">
                <input type="text" class="search-input" id="searchInput" placeholder="Search components, functions, variables...">
            </div>
            
            <div class="diagram-viewport" id="viewport">
                <div class="diagram-content" id="diagramContent">
                    <svg class="connections-svg" id="connectionsSvg"></svg>
                    
                    <!-- Layers will be populated here -->
                    <div id="layersContainer"></div>
                </div>
            </div>
            
            <div class="tooltip" id="tooltip">
                <div class="tooltip-title"></div>
                <div class="tooltip-content"></div>
            </div>
            
            <div class="file-preview" id="filePreview">
                <div class="file-preview-header">
                    <span class="file-preview-title"></span>
                    <div class="file-preview-actions">
                        <button class="file-preview-btn" id="editFileBtn" title="Edit">✏️</button>
                        <button class="file-preview-btn" id="saveFileBtn" style="display: none;" title="Save">💾</button>
                        <button class="file-preview-btn" id="cancelEditBtn" style="display: none;" title="Cancel">❌</button>
                        <button class="file-preview-close" id="closePreview" title="Close">✖</button>
                    </div>
                </div>
                <div class="file-preview-content">
                    <pre id="filePreviewPre"><code id="filePreviewCode"></code></pre>
                    <textarea id="fileEditTextarea" class="file-edit-textarea" style="display: none;"></textarea>
                </div>
            </div>
            
            <div class="minimap" id="minimap">
                <div class="minimap-viewport" id="minimapViewport"></div>
            </div>
            
            <!-- Advanced Controls Panel -->
            <div id="advancedControls">
                <div class="control-section">
                    <h3><span>🎛️</span> Layer Filters</h3>
                    <div class="filter-group">
                        <label class="filter-checkbox">
                            <input type="checkbox" checked data-filter-layer="vscode">
                            <span>VS Code API Layer</span>
                        </label>
                        <label class="filter-checkbox">
                            <input type="checkbox" checked data-filter-layer="core">
                            <span>Core Services Layer</span>
                        </label>
                        <label class="filter-checkbox">
                            <input type="checkbox" checked data-filter-layer="analysis">
                            <span>Analysis Layer</span>
                        </label>
                        <label class="filter-checkbox">
                            <input type="checkbox" checked data-filter-layer="rendering">
                            <span>Rendering Layer</span>
                        </label>
                        <label class="filter-checkbox">
                            <input type="checkbox" checked data-filter-layer="utility">
                            <span>Utility Layer</span>
                        </label>
                    </div>
                </div>
                
                <div class="control-section">
                    <h3><span>📊</span> Complexity Metrics</h3>
                    <div id="metricsDisplay">
                        <!-- Metrics will be populated here -->
                    </div>
                </div>
                
                <div class="control-section">
                    <h3><span>🔍</span> Analysis Tools</h3>
                    <button class="analysis-btn" id="findCircularDeps">
                        Find Circular Dependencies
                    </button>
                    <button class="analysis-btn" id="showCriticalPath">
                        Show Critical Path
                    </button>
                    <button class="analysis-btn" id="generateReport">
                        Generate Report
                    </button>
                </div>
                
                <div class="control-section">
                    <h3><span>📌</span> Selected Component</h3>
                    <div id="selectedComponentInfo">
                        <p class="no-selection">No component selected</p>
                    </div>
                </div>
                
                <div class="control-section">
                    <h3><span>🔗</span> Connections</h3>
                    <div id="connectionsList">
                        <p class="no-connections">Select a component to view connections</p>
                    </div>
                </div>
                
                <div class="control-section">
                    <h3><span>⚙️</span> Actions</h3>
                    <button class="analysis-btn" id="clearSelection">
                        Clear Selection
                    </button>
                    <button class="analysis-btn" id="isolateComponent">
                        Isolate Component
                    </button>
                    <button class="analysis-btn" id="resetIsolation">
                        Reset Isolation
                    </button>
                    <button class="analysis-btn" id="showDependencyTree">
                        Show Dependency Tree
                    </button>
                    <button class="analysis-btn" id="resolveDependencies">
                        Resolve Dependencies
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Status Bar -->
    <div class="status-bar">
        <div class="status-item">
            <span>📍</span>
            <span id="statusPosition">Position: 0, 0</span>
        </div>
        <div class="status-item">
            <span>🔍</span>
            <span id="statusZoom">Zoom: 100%</span>
        </div>
        <div class="status-item">
            <span>📊</span>
            <span id="statusMode">Mode: Normal</span>
        </div>
        <div class="status-item">
            <span>⚡</span>
            <span>CodeSync Diagram v${this.getVersion()}</span>
        </div>
    </div>
    
    <div class="notification" id="notification"></div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private getVersion() {
        return this.context.extension.packageJSON.version || '1.0.0';
    }
}