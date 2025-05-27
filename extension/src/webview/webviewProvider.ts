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
        switch (message.command) {
            case 'openFile':
                this.openFile(message.data.path);
                break;
            case 'showInfo':
                vscode.window.showInformationMessage(message.data.message);
                break;
            case 'showError':
                vscode.window.showErrorMessage(message.data.message);
                break;
            case 'log':
                console.log('[Webview]', message.data);
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

    private transformProjectData() {
        const layers: Record<string, any[]> = {
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
                file: file.path,
                name: file.name,
                layer: layer,
                type: this.getComponentType(file),
                functions: [],
                variables: [],
                classes: [],
                fullPath: file.fullPath
            };
            
            layers[layer].push(component);
            return component;
        });

        // Transform dependencies into connections
        const connections = this.projectData.dependencies.map(dep => ({
            from: dep.from.replace(/[^a-zA-Z0-9]/g, '_'),
            to: dep.to.replace(/[^a-zA-Z0-9]/g, '_'),
            type: dep.type,
            label: dep.type
        }));

        return {
            layers,
            components,
            connections,
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

    private getComponentType(file: any): string {
        if (file.name.includes('Service')) return 'service';
        if (file.name.includes('Provider')) return 'provider';
        if (file.name.includes('View')) return 'webview';
        if (file.extension === '.ts' || file.extension === '.js') return 'component';
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