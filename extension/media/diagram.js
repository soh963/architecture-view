// State Management
const state = {
    zoom: 0.8,  // Start with 80% zoom for better initial view
    pan: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    selectedComponent: null,
    isSpacePressed: false,
    connections: [],
    components: [],
    layers: {},
    projectData: null,
    initialLoad: true,  // Track first load
    umlView: false  // UML view state
};

// DOM Elements
let viewport, diagramContent, zoomLevel, sidebar, searchBox, searchInput;
let tooltip, activeConnections, notification, layersContainer;

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    attachEventListeners();
    updateTransform();
    
    // Listen for messages from VS Code
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'loadData':
                loadProjectData(message.data);
                break;
            case 'fileContent':
                displayFileContent(message.data);
                break;
        }
    });
    
    vscode.postMessage({ command: 'log', data: 'Webview initialized' });
});

function initializeDOMElements() {
    viewport = document.getElementById('viewport');
    diagramContent = document.getElementById('diagramContent');
    zoomLevel = document.getElementById('zoomLevel');
    sidebar = document.getElementById('sidebar');
    searchBox = document.getElementById('searchBox');
    searchInput = document.getElementById('searchInput');
    tooltip = document.getElementById('tooltip');
    activeConnections = document.getElementById('activeConnections');
    notification = document.getElementById('notification');
    layersContainer = document.getElementById('layersContainer');
}

function loadProjectData(data) {
    state.projectData = data;
    state.connections = data.connections || [];
    state.components = data.components || [];
    state.layers = data.layers || {};
    
    // Process database connections
    processDatabaseConnections(data.dependencies);
    
    renderLayers();
    renderDatabaseNodes();
    renderStats();
    renderFileList();
    updateTransform();
    
    // Render connections after components are rendered
    setTimeout(() => {
        drawConnections();
        setupMinimap();
        
        // Only auto-fit on initial load
        if (state.initialLoad) {
            centerDiagram();
            state.initialLoad = false;
        }
        
        updateMinimap();
    }, 100);
}

function processDatabaseConnections(dependencies) {
    // Extract unique database types from dependencies
    const databases = new Set();
    dependencies.forEach(dep => {
        if (dep.type === 'database' && dep.to.startsWith('[DB:')) {
            databases.add(dep.to);
        }
    });
    
    // Store database nodes for rendering
    state.databases = Array.from(databases);
}

function renderDatabaseNodes() {
    if (!state.databases || state.databases.length === 0) return;
    
    // Create a database layer if it doesn't exist
    let dbLayer = document.querySelector('[data-layer="database"]');
    if (!dbLayer) {
        dbLayer = document.createElement('div');
        dbLayer.className = 'layer layer-database';
        dbLayer.setAttribute('data-layer', 'database');
        dbLayer.innerHTML = `
            <span class="layer-title">Database Connections</span>
            <div class="components-grid" id="database-components"></div>
        `;
        layersContainer.appendChild(dbLayer);
    }
    
    const grid = dbLayer.querySelector('.components-grid');
    
    // Create database nodes
    state.databases.forEach(db => {
        const dbMatch = db.match(/\[DB:(\w+)\]/);
        if (dbMatch) {
            const dbType = dbMatch[1];
            const dbNode = createDatabaseNode(dbType);
            grid.appendChild(dbNode);
        }
    });
}

function createDatabaseNode(dbType) {
    const div = document.createElement('div');
    div.className = 'component database-node';
    div.setAttribute('data-id', `[DB:${dbType}]`);
    div.setAttribute('data-db-type', dbType);
    
    const dbIcons = {
        mysql: '🐬',
        postgres: '🐘',
        mongodb: '🍃',
        redis: '🔴',
        sqlite: '📀',
        database: '🗄️'
    };
    
    const icon = dbIcons[dbType] || dbIcons.database;
    const dbNames = {
        mysql: 'MySQL',
        postgres: 'PostgreSQL',
        mongodb: 'MongoDB',
        redis: 'Redis',
        sqlite: 'SQLite',
        database: 'Database'
    };
    
    const name = dbNames[dbType] || 'Database';
    
    div.innerHTML = `
        <div class="component-header">
            <div class="component-title">
                <span>${icon}</span> ${name}
            </div>
            <div class="component-badge">Database</div>
        </div>
        <div class="component-content">
            <div class="component-section">
                <div class="component-section-title">Type</div>
                <div class="component-item">${dbType.toUpperCase()}</div>
            </div>
        </div>
    `;
    
    // Add event listeners
    div.addEventListener('click', () => selectComponent(div, { name, type: 'database', dbType }));
    div.addEventListener('mouseenter', (e) => showTooltip(e, { name, type: 'database', dbType }));
    div.addEventListener('mouseleave', hideTooltip);
    
    return div;
}

function renderLayers() {
    const layerInfo = {
        vscode: { title: 'VS Code Extension API Layer', class: 'layer-vscode' },
        core: { title: 'Core Services Layer', class: 'layer-core' },
        analysis: { title: 'Analysis & Processing Layer', class: 'layer-analysis' },
        rendering: { title: 'Rendering & UI Layer', class: 'layer-rendering' },
        utility: { title: 'Utility & Support Layer', class: 'layer-utility' }
    };
    
    layersContainer.innerHTML = '';
    
    Object.entries(state.layers).forEach(([layerName, components]) => {
        if (components.length === 0) {
            return;
        }
        
        const layerDiv = document.createElement('div');
        layerDiv.className = `layer ${layerInfo[layerName].class}`;
        layerDiv.setAttribute('data-layer', layerName);
        
        layerDiv.innerHTML = `
            <span class="layer-title">${layerInfo[layerName].title}</span>
            <div class="components-grid" id="${layerName}-components"></div>
        `;
        
        layersContainer.appendChild(layerDiv);
        
        const grid = layerDiv.querySelector('.components-grid');
        
        components.forEach(comp => {
            const componentDiv = createComponentElement(comp);
            grid.appendChild(componentDiv);
        });
    });
}

function createComponentElement(comp) {
    const div = document.createElement('div');
    // 사용되지 않는 파일은 다른 스타일 적용
    const isUnused = comp.isUsed === false;
    div.className = `component ${comp.type || ''} ${isUnused ? 'unused' : ''}`;
    div.setAttribute('data-id', comp.id);
    div.setAttribute('data-file', comp.file);
    
    // Set importance level based on reference count
    const importance = Math.min(5, comp.referenceCount || 0);
    div.setAttribute('data-importance', importance);
    
    const iconMap = {
        service: '📊',
        provider: '🔧',
        webview: '🖼️',
        component: '📄',
        file: '📁'
    };
    
    const icon = iconMap[comp.type] || '📄';
    
    if (state.umlView) {
        // UML Class Diagram format
        div.innerHTML = `
            <div class="uml-class">
                <div class="uml-class-name">
                    ${comp.name}
                    ${isUnused ? '<span class="unused-badge" title="Unused file">⚠️</span>' : ''}
                </div>
                <div class="uml-class-type">${comp.type || 'component'}</div>
                <div class="uml-class-attributes">
                    ${comp.functions && comp.functions.length > 0 ? 
                        comp.functions.slice(0, 3).map(fn => `<div class="uml-attribute">+ ${fn}</div>`).join('') : 
                        '<div class="uml-attribute">No public methods</div>'
                    }
                    ${comp.functions && comp.functions.length > 3 ? 
                        `<div class="uml-attribute">... and ${comp.functions.length - 3} more</div>` : ''
                    }
                </div>
                ${comp.variables && comp.variables.length > 0 ? `
                    <div class="uml-class-properties">
                        ${comp.variables.slice(0, 2).map(v => `<div class="uml-property">- ${v}</div>`).join('')}
                        ${comp.variables.length > 2 ? 
                            `<div class="uml-property">... and ${comp.variables.length - 2} more</div>` : ''
                        }
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        // Normal view
        div.innerHTML = `
            <div class="component-header">
                <div class="component-title">
                    <span>${icon}</span> ${comp.name}
                    ${isUnused ? '<span class="unused-badge" title="Unused file">⚠️</span>' : ''}
                </div>
                ${comp.type === 'service' ? '<div class="component-badge">Service</div>' : ''}
            </div>
            <div class="component-content">
                <div class="component-section">
                    <div class="component-section-title">File</div>
                    <div class="component-item">${comp.file}</div>
                </div>
                ${comp.description ? `
                    <div class="component-section">
                        <div class="component-section-title">Description</div>
                        <div class="component-description">${comp.description}</div>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    // Add event listeners
    div.addEventListener('click', (e) => {
        if (!state.isSpacePressed) {
            selectComponent(div, comp);
        }
        e.stopPropagation();
    });
    div.addEventListener('mouseenter', (e) => showTooltip(e, comp));
    div.addEventListener('mouseleave', hideTooltip);
    
    return div;
}

function renderStats() {
    const stats = state.projectData.stats;
    const statsContent = document.getElementById('statsContent');
    
    statsContent.innerHTML = `
        <div>Total Files: <strong>${stats.totalFiles}</strong></div>
        <div>Total Size: <strong>${formatBytes(stats.totalSize)}</strong></div>
        <div>Dependencies: <strong>${stats.totalDependencies}</strong></div>
        <div>Layers: <strong>${Object.keys(state.layers).length}</strong></div>
    `;
}

function renderFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    // Check if we have fileTree data
    if (state.projectData && state.projectData.fileTree) {
        // Render the hierarchical file tree
        renderFileTree(fileList, state.projectData.fileTree, 0);
    } else {
        // Fallback to the old flat list
        state.components.forEach(comp => {
            const link = document.createElement('div');
            link.className = 'file-link';
            link.setAttribute('data-file', comp.file);
            link.innerHTML = `
                <span class="file-icon">📄</span>
                ${comp.file}
            `;
            link.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'openFile',
                    data: { path: comp.fullPath || comp.file }
                });
            });
            fileList.appendChild(link);
        });
    }
}

function renderFileTree(container, items, level) {
    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = item.isDirectory ? 'folder-item' : 'file-link';
        itemDiv.style.paddingLeft = `${level * 6}px`; // 10px → 6px로 간격 줄임
        
        if (item.isDirectory) {
            // Create folder element
            const folderHeader = document.createElement('div');
            folderHeader.className = 'folder-header';
            folderHeader.innerHTML = `
                <span class="folder-toggle">▼</span>
                <span class="folder-icon">📂</span>
                <span class="folder-name">${item.name}</span>
            `;
            
            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';
            folderContent.style.display = 'block';
            
            // Add click handler for folder toggle
            folderHeader.addEventListener('click', () => {
                const toggle = folderHeader.querySelector('.folder-toggle');
                const isOpen = folderContent.style.display !== 'none';
                
                if (isOpen) {
                    folderContent.style.display = 'none';
                    toggle.textContent = '▶';
                    folderHeader.querySelector('.folder-icon').textContent = '📁';
                } else {
                    folderContent.style.display = 'block';
                    toggle.textContent = '▼';
                    folderHeader.querySelector('.folder-icon').textContent = '📂';
                }
            });
            
            itemDiv.appendChild(folderHeader);
            itemDiv.appendChild(folderContent);
            container.appendChild(itemDiv);
            
            // Recursively render children
            if (item.children && item.children.length > 0) {
                renderFileTree(folderContent, item.children, level + 1);
            }
        } else {
            // Create file element
            itemDiv.innerHTML = `
                <span class="file-icon">${getFileIcon(item.extension)}</span>
                <span class="file-name">${item.name}</span>
            `;
            itemDiv.setAttribute('data-file', item.path);
            
            // Add click handler for file
            itemDiv.addEventListener('click', () => {
                vscode.postMessage({
                    command: 'openFile',
                    data: { path: item.fullPath || item.path }
                });
            });
            
            container.appendChild(itemDiv);
        }
    });
}

function getFileIcon(extension) {
    const iconMap = {
        '.ts': '📘',
        '.js': '📙',
        '.json': '📗',
        '.css': '🎨',
        '.html': '📄',
        '.md': '📝',
        '.yml': '⚙️',
        '.yaml': '⚙️',
        '.xml': '📰',
        '.py': '🐍',
        '.java': '☕',
        '.go': '🐹'
    };
    
    return iconMap[extension] || '📄';
}

// Draw Connections
function drawConnections() {
    const svg = document.getElementById('connectionsSvg');
    svg.innerHTML = '';
    
    // Log connections for debugging
    console.log('Drawing connections:', state.connections.length);
    state.connections.forEach(conn => {
        console.log(`Connection: ${conn.from} -> ${conn.to} (${conn.type})`);
    });
    
    // Set SVG size to match diagram content
    const diagramRect = diagramContent.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${diagramRect.width} ${diagramRect.height}`);
    svg.style.width = '100%';
    svg.style.height = '100%';
    
    // Add defs for markers
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Different arrow markers for different connection types
    const connectionTypes = {
        'import': { color: '#58a6ff', size: 6 },
        'export': { color: '#3fb950', size: 6 },
        'inheritance': { color: '#f78166', size: 7 },
        'database': { color: '#e74c3c', size: 6 },
        'include': { color: '#bc6bd6', size: 6 },
        'script': { color: '#f1fa8c', size: 6 },
        'stylesheet': { color: '#ff79c6', size: 6 }
    };
    
    // Create markers for each type
    Object.entries(connectionTypes).forEach(([type, config]) => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', `arrowhead-${type}`);
        marker.setAttribute('markerWidth', config.size);
        marker.setAttribute('markerHeight', config.size * 0.7);
        marker.setAttribute('refX', config.size - 1);
        marker.setAttribute('refY', config.size * 0.35);
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('fill', config.color);
        
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', `0 0, ${config.size} ${config.size * 0.35}, 0 ${config.size * 0.7}`);
        
        marker.appendChild(polygon);
        defs.appendChild(marker);
    });
    
    svg.appendChild(defs);
    
    // Helper function to calculate optimal connection points
    function getConnectionPoints(fromRect, toRect, index) {
        const fromCenter = {
            x: fromRect.left + fromRect.width / 2,
            y: fromRect.top + fromRect.height / 2
        };
        const toCenter = {
            x: toRect.left + toRect.width / 2,
            y: toRect.top + toRect.height / 2
        };
        
        // Calculate angle between centers
        const angle = Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x);
        
        // Determine best connection points based on relative positions
        let fromPoint, toPoint;
        
        // Horizontal offset for better visual separation
        const hOffset = 20;
        
        if (Math.abs(angle) < Math.PI / 4) {
            // Connect right to left
            fromPoint = { x: fromRect.right, y: fromCenter.y };
            toPoint = { x: toRect.left, y: toCenter.y };
        } else if (Math.abs(angle) > 3 * Math.PI / 4) {
            // Connect left to right
            fromPoint = { x: fromRect.left, y: fromCenter.y };
            toPoint = { x: toRect.right, y: toCenter.y };
        } else if (angle > 0) {
            // Connect bottom to top
            fromPoint = { x: fromCenter.x, y: fromRect.bottom };
            toPoint = { x: toCenter.x, y: toRect.top };
            
            // Add horizontal offset if components are vertically aligned
            if (Math.abs(fromCenter.x - toCenter.x) < 50) {
                // Use consistent offset based on connection index
                const offset = (index % 3 - 1) * 15;
                fromPoint.x += offset;
                toPoint.x += offset;
            }
        } else {
            // Connect top to bottom
            fromPoint = { x: fromCenter.x, y: fromRect.top };
            toPoint = { x: toCenter.x, y: toRect.bottom };
            
            // Add horizontal offset if components are vertically aligned
            if (Math.abs(fromCenter.x - toCenter.x) < 50) {
                // Use consistent offset based on connection index
                const offset = (index % 3 - 1) * 15;
                fromPoint.x += offset;
                toPoint.x += offset;
            }
        }
        
        return { fromPoint, toPoint };
    }
    
    // Draw connections
    state.connections.forEach((conn, index) => {
        const fromEl = document.querySelector(`[data-id="${conn.from}"]`);
        const toEl = document.querySelector(`[data-id="${conn.to}"]`);
        
        if (fromEl && toEl) {
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const containerRect = diagramContent.getBoundingClientRect();
            
            // Get optimal connection points
            const { fromPoint, toPoint } = getConnectionPoints(fromRect, toRect, index);
            
            // Convert to SVG coordinates
            const x1 = (fromPoint.x - containerRect.left);
            const y1 = (fromPoint.y - containerRect.top);
            const x2 = (toPoint.x - containerRect.left);
            const y2 = (toPoint.y - containerRect.top);
            
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('data-connection', `${conn.from}-${conn.to}`);
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            
            // Calculate control points for smoother curves
            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            let d;
            if (Math.abs(dx) > Math.abs(dy)) {
                // Horizontal connection
                const controlOffset = Math.min(distance * 0.5, 100);
                d = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
            } else {
                // Vertical connection
                const controlOffset = Math.min(distance * 0.5, 100);
                d = `M ${x1} ${y1} C ${x1} ${y1 + controlOffset}, ${x2} ${y2 - controlOffset}, ${x2} ${y2}`;
            }
            
            path.setAttribute('d', d);
            path.setAttribute('class', `connection-path connection-${conn.type}`);
            path.setAttribute('id', `path-${index}`);
            path.setAttribute('data-type', conn.type);
            
            // Use appropriate marker based on connection type
            const markerType = connectionTypes[conn.type] ? conn.type : 'import';
            path.setAttribute('marker-end', `url(#arrowhead-${markerType})`);
            
            // Add connection type specific styling
            const typeConfig = connectionTypes[conn.type] || connectionTypes['import'];
            path.style.stroke = typeConfig.color;
            
            g.appendChild(path);
            
            // Add label with better positioning
            if (conn.label) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('class', 'connection-label');
                
                const textPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
                textPath.setAttribute('href', `#path-${index}`);
                textPath.setAttribute('startOffset', '50%');
                textPath.setAttribute('text-anchor', 'middle');
                textPath.textContent = conn.label;
                
                text.appendChild(textPath);
                g.appendChild(text);
            }
            
            // Add hover interaction
            g.addEventListener('mouseenter', () => {
                path.classList.add('hover');
                showConnectionTooltip(conn, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
            });
            
            g.addEventListener('mouseleave', () => {
                path.classList.remove('hover');
                hideTooltip();
            });
            
            svg.appendChild(g);
        }
    });
}

// New function to show connection details
function showConnectionTooltip(connection, position) {
    const tooltipTitle = tooltip.querySelector('.tooltip-title');
    const tooltipContent = tooltip.querySelector('.tooltip-content');
    
    tooltipTitle.textContent = `${connection.type} connection`;
    tooltipContent.innerHTML = `
        <div>From: ${connection.from}</div>
        <div>To: ${connection.to}</div>
        ${connection.label ? `<div>Label: ${connection.label}</div>` : ''}
        <div>Type: ${connection.type}</div>
    `;
    
    const containerRect = diagramContent.getBoundingClientRect();
    
    // 먼저 툴팁을 표시하여 크기를 계산할 수 있도록 함
    tooltip.style.display = 'block';
    
    // 툴팁 크기 가져오기
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipHeight = tooltipRect.height;
    const tooltipWidth = tooltipRect.width;
    
    // 화면 경계 확인
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 마우스 위치 계산
    const mouseX = containerRect.left + position.x;
    const mouseY = containerRect.top + position.y;
    
    // 기본 위치: 마우스 커서 바로 위
    let left = mouseX - tooltipWidth / 2;
    let top = mouseY - tooltipHeight - 10;
    
    // 화면 경계 체크 및 조정
    if (left < 10) left = 10;
    if (left + tooltipWidth > windowWidth - 10) {
        left = windowWidth - tooltipWidth - 10;
    }
    if (top < 10) {
        top = mouseY + 10;
        tooltip.classList.add('tooltip-below');
    } else {
        tooltip.classList.remove('tooltip-below');
    }
    if (top + tooltipHeight > windowHeight - 10) {
        top = mouseY - tooltipHeight - 10;
        tooltip.classList.remove('tooltip-below');
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

// Event Listeners
function attachEventListeners() {
    // Zoom controls
    document.getElementById('zoomIn').addEventListener('click', () => zoom(0.1));
    document.getElementById('zoomOut').addEventListener('click', () => zoom(-0.1));
    document.getElementById('zoomReset').addEventListener('click', resetZoom);
    
    // Pan controls
    viewport.addEventListener('mousedown', startDrag);
    viewport.addEventListener('mousemove', drag);
    viewport.addEventListener('mouseup', endDrag);
    viewport.addEventListener('mouseleave', endDrag);
    
    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        zoomAtPoint(delta, e.clientX, e.clientY);
    });
    
    // Sidebar toggle
    document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);
    
    // Search
    document.getElementById('searchBtn').addEventListener('click', toggleSearch);
    searchInput.addEventListener('input', performSearch);
    
    // Reset View
    const resetViewBtn = document.getElementById('resetViewBtn');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', resetView);
    }
    
    // Export
    document.getElementById('exportBtn').addEventListener('click', exportDiagram);
    
    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    
    // Advanced toggle
    document.getElementById('advancedToggle').addEventListener('click', toggleAdvancedPanel);
    
    // UML toggle
    const umlToggleBtn = document.getElementById('umlToggle');
    if (umlToggleBtn) {
        umlToggleBtn.addEventListener('click', toggleUMLView);
    }
    
    // Analysis tools
    document.getElementById('findCircularDeps').addEventListener('click', findCircularDependencies);
    document.getElementById('showCriticalPath').addEventListener('click', showCriticalPath);
    document.getElementById('generateReport').addEventListener('click', generateReport);
    
    // New advanced actions
    document.getElementById('clearSelection').addEventListener('click', clearSelection);
    document.getElementById('isolateComponent').addEventListener('click', isolateComponent);
    document.getElementById('resetIsolation').addEventListener('click', resetIsolation);
    document.getElementById('showDependencyTree').addEventListener('click', showDependencyTree);
    document.getElementById('resolveDependencies').addEventListener('click', resolveDependencies);
    
    // Layer filters
    document.querySelectorAll('[data-filter-layer]').forEach(checkbox => {
        checkbox.addEventListener('change', filterLayers);
    });
    
    // File preview close button
    document.getElementById('closePreview').addEventListener('click', hideFilePreview);
    
    // File edit buttons
    document.getElementById('editFileBtn').addEventListener('click', enableFileEdit);
    document.getElementById('saveFileBtn').addEventListener('click', saveFileContent);
    document.getElementById('cancelEditBtn').addEventListener('click', cancelFileEdit);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
    document.addEventListener('keyup', handleKeyboardUp);
    
    // Window resize
    window.addEventListener('resize', () => {
        drawConnections();
        updateMinimap();
    });
}

// Zoom functions
function zoom(delta) {
    state.zoom = Math.max(0.1, Math.min(10, state.zoom + delta));
    updateTransform();
    updateZoomLevel();
    updateMinimap();
}

function zoomAtPoint(delta, mouseX, mouseY) {
    const viewportRect = viewport.getBoundingClientRect();
    
    // Get mouse position relative to viewport
    const mouseViewportX = mouseX - viewportRect.left;
    const mouseViewportY = mouseY - viewportRect.top;
    
    // Calculate mouse position in diagram space (before zoom)
    const mouseDiagramX = (mouseViewportX - state.pan.x) / state.zoom;
    const mouseDiagramY = (mouseViewportY - state.pan.y) / state.zoom;
    
    // Store old zoom
    const oldZoom = state.zoom;
    
    // Apply zoom change
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    state.zoom = Math.max(0.1, Math.min(10, state.zoom * zoomFactor));
    
    // Calculate new pan to keep mouse position fixed
    // The mouse should stay at the same diagram position after zoom
    state.pan.x = mouseViewportX - mouseDiagramX * state.zoom;
    state.pan.y = mouseViewportY - mouseDiagramY * state.zoom;
    
    updateTransform();
    updateZoomLevel();
    updateMinimap();
}

function resetZoom() {
    // Always use fitToScreen for reset button
    fitToScreen();
}

function fitToScreen() {
    if (!diagramContent || !viewport) return;
    
    // Get all layers to calculate proper bounding box
    const layers = diagramContent.querySelectorAll('.layer');
    if (layers.length === 0) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    // Calculate the bounding box of all layers
    layers.forEach(layer => {
        const rect = layer.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();
        
        // Get relative positions
        const relativeLeft = rect.left - viewportRect.left;
        const relativeTop = rect.top - viewportRect.top;
        const relativeRight = relativeLeft + rect.width;
        const relativeBottom = relativeTop + rect.height;
        
        minX = Math.min(minX, relativeLeft / state.zoom - state.pan.x / state.zoom);
        minY = Math.min(minY, relativeTop / state.zoom - state.pan.y / state.zoom);
        maxX = Math.max(maxX, relativeRight / state.zoom - state.pan.x / state.zoom);
        maxY = Math.max(maxY, relativeBottom / state.zoom - state.pan.y / state.zoom);
    });
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    // Get viewport dimensions
    const viewportRect = viewport.getBoundingClientRect();
    const viewportWidth = viewportRect.width;
    const viewportHeight = viewportRect.height;
    
    // Calculate scale to fit content in viewport with padding
    const padding = 80;
    const scaleX = (viewportWidth - padding * 2) / contentWidth;
    const scaleY = (viewportHeight - padding * 2) / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 1.2);
    
    // Center the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    state.zoom = newZoom;
    state.pan.x = viewportWidth / 2 - centerX * newZoom;
    state.pan.y = viewportHeight / 2 - centerY * newZoom;
    
    // Apply transform
    updateTransform();
    updateZoomLevel();
    updateMinimap();
}

function centerDiagram() {
    if (!diagramContent || !viewport) return;
    
    // Get viewport dimensions
    const viewportRect = viewport.getBoundingClientRect();
    const viewportWidth = viewportRect.width;
    const viewportHeight = viewportRect.height;
    
    // Calculate diagram dimensions
    const diagramWidth = 1600; // From CSS
    const diagramHeight = diagramContent.scrollHeight || 1200;
    
    // Set initial zoom to show most content nicely
    state.zoom = 0.8;
    
    // Center the diagram
    state.pan.x = (viewportWidth - diagramWidth * state.zoom) / 2;
    state.pan.y = (viewportHeight - diagramHeight * state.zoom) / 2 + 100; // Offset a bit from top
    
    updateTransform();
    updateZoomLevel();
}

function updateZoomLevel() {
    zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
    document.getElementById('statusZoom').textContent = `Zoom: ${Math.round(state.zoom * 100)}%`;
}

// Pan functions
function startDrag(e) {
    if (e.button === 0 && (e.target === viewport || e.target === diagramContent || state.isSpacePressed)) {
        state.isDragging = true;
        state.dragStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
        viewport.classList.add('dragging');
        viewport.style.cursor = 'grabbing';
    }
}

function drag(e) {
    if (state.isDragging) {
        state.pan.x = e.clientX - state.dragStart.x;
        state.pan.y = e.clientY - state.dragStart.y;
        updateTransform();
        updateStatusBar(e);
        updateMinimap();
    }
}

function endDrag() {
    state.isDragging = false;
    viewport.classList.remove('dragging');
    viewport.style.cursor = state.isSpacePressed ? 'grab' : '';
}

function updateTransform() {
    if (diagramContent) {
        diagramContent.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    }
}

// Component selection
function selectComponent(element, component) {
    // Prevent selection when space is pressed (panning mode)
    if (state.isSpacePressed) {
        return;
    }
    
    // Remove previous selection and related classes
    document.querySelectorAll('.component').forEach(comp => {
        comp.classList.remove('selected', 'related');
    });
    
    // Add selection
    element.classList.add('selected');
    state.selectedComponent = component;
    
    // Add has-selection class to diagram container
    document.querySelector('.diagram-container').classList.add('has-selection');
    
    // Mark related components
    const relatedComponents = new Set();
    state.connections.forEach(conn => {
        if (conn.from === component.id) {
            relatedComponents.add(conn.to);
        } else if (conn.to === component.id) {
            relatedComponents.add(conn.from);
        }
    });
    
    // Add related class to connected components
    relatedComponents.forEach(compId => {
        const relatedElement = document.querySelector(`[data-id="${compId}"]`);
        if (relatedElement) {
            relatedElement.classList.add('related');
        }
    });
    
    // Show connections
    showComponentConnections(component);
    
    // Highlight connections
    highlightConnections(component.id);
    
    // Highlight file in navigation
    highlightFileInNavigation(component.file);
    
    // Update advanced panel info
    updateSelectedComponentInfo(component);
    updateConnectionsList(component);
    
    // Show full code in right panel
    if (component.file) {
        vscode.postMessage({
            command: 'openFile',
            data: { path: component.fullPath || component.file }
        });
    }
    
    // Show file preview
    showFilePreview(component);
}

function showFilePreview(component) {
    const preview = document.getElementById('filePreview');
    const title = preview.querySelector('.file-preview-title');
    const code = document.getElementById('filePreviewCode');
    
    // Set title
    title.textContent = component.name || component.file;
    
    // Request file content from VS Code
    vscode.postMessage({
        command: 'getFileContent',
        data: { path: component.fullPath || component.file }
    });
    
    // Show preview panel
    preview.style.display = 'flex';
}

function hideFilePreview() {
    const preview = document.getElementById('filePreview');
    preview.style.display = 'none';
}

function displayFileContent(data) {
    const code = document.getElementById('filePreviewCode');
    const textarea = document.getElementById('fileEditTextarea');
    
    if (data.content) {
        // Store the original content and file path
        state.currentFileContent = data.content;
        state.currentFilePath = data.path;
        
        // Escape HTML entities for display
        const escapedContent = data.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        
        code.innerHTML = escapedContent;
        textarea.value = data.content;
    } else {
        code.textContent = 'Unable to load file content.';
        textarea.value = '';
    }
}

function highlightFileInNavigation(filePath) {
    // Remove previous highlights
    document.querySelectorAll('.file-link.selected, .folder-header.selected').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Find and highlight the file
    const fileElement = document.querySelector(`[data-file="${filePath}"]`);
    if (fileElement) {
        fileElement.classList.add('selected');
        
        // Expand parent folders if needed
        let parent = fileElement.parentElement;
        while (parent && parent.id !== 'fileList') {
            if (parent.classList.contains('folder-content')) {
                parent.style.display = 'block';
                const folderHeader = parent.previousElementSibling;
                if (folderHeader && folderHeader.classList.contains('folder-header')) {
                    const toggle = folderHeader.querySelector('.folder-toggle');
                    const icon = folderHeader.querySelector('.folder-icon');
                    if (toggle) toggle.textContent = '▼';
                    if (icon) icon.textContent = '📂';
                }
            }
            parent = parent.parentElement;
        }
        
        // Scroll into view
        fileElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function enableFileEdit() {
    const pre = document.getElementById('filePreviewPre');
    const textarea = document.getElementById('fileEditTextarea');
    const editBtn = document.getElementById('editFileBtn');
    const saveBtn = document.getElementById('saveFileBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    
    // Switch to edit mode
    pre.style.display = 'none';
    textarea.style.display = 'block';
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    
    // Focus on textarea
    textarea.focus();
}

function cancelFileEdit() {
    const pre = document.getElementById('filePreviewPre');
    const textarea = document.getElementById('fileEditTextarea');
    const editBtn = document.getElementById('editFileBtn');
    const saveBtn = document.getElementById('saveFileBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    
    // Restore original content
    textarea.value = state.currentFileContent || '';
    
    // Switch back to view mode
    pre.style.display = 'block';
    textarea.style.display = 'none';
    editBtn.style.display = 'inline-block';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
}

function saveFileContent() {
    const textarea = document.getElementById('fileEditTextarea');
    const newContent = textarea.value;
    
    // Send save request to VS Code
    vscode.postMessage({
        command: 'saveFileContent',
        data: {
            path: state.currentFilePath,
            content: newContent
        }
    });
    
    // Update stored content
    state.currentFileContent = newContent;
    
    // Update the display
    const code = document.getElementById('filePreviewCode');
    const escapedContent = newContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    code.innerHTML = escapedContent;
    
    // Switch back to view mode
    cancelFileEdit();
    
    // Show notification
    showNotification('File saved successfully!');
}

function showComponentConnections(component) {
    const connections = state.connections.filter(conn => 
        conn.from === component.id || conn.to === component.id
    );
    
    let html = `<h4>${component.name}</h4>`;
    
    if (connections.length > 0) {
        html += '<div class="connections-list">';
        connections.forEach(conn => {
            const isOutgoing = conn.from === component.id;
            const otherComp = state.components.find(c => 
                c.id === (isOutgoing ? conn.to : conn.from)
            );
            
            if (otherComp) {
                html += `
                    <div class="connection-item">
                        <span>${isOutgoing ? '→' : '←'}</span>
                        <span>${otherComp.name}</span>
                        <span class="connection-label-small">${conn.label || conn.type}</span>
                    </div>
                `;
            }
        });
        html += '</div>';
    } else {
        html += '<p>No connections</p>';
    }
    
    activeConnections.innerHTML = html;
}

function highlightConnections(componentId) {
    // Reset all connections
    document.querySelectorAll('.connection-path').forEach(path => {
        path.classList.remove('active');
    });
    
    // Highlight related connections
    state.connections.forEach((conn, index) => {
        if (conn.from === componentId || conn.to === componentId) {
            const path = document.getElementById(`path-${index}`);
            if (path) {
                path.classList.add('active');
            }
        }
    });
}

// Search functionality
function toggleSearch() {
    searchBox.classList.toggle('show');
    if (searchBox.classList.contains('show')) {
        searchInput.focus();
        searchInput.select();
    } else {
        // Clear search when closing
        searchInput.value = '';
        performSearch();
    }
}

function performSearch() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (!query) {
        // Reset all components if search is empty
        document.querySelectorAll('.component').forEach(comp => {
            comp.style.opacity = '1';
            comp.classList.remove('search-match');
            comp.classList.remove('content-match');
        });
        clearSearchResults();
        return;
    }
    
    let hasMatches = false;
    let searchResults = [];
    
    // Search in components using the comprehensive component data
    document.querySelectorAll('.component').forEach(comp => {
        const compId = comp.getAttribute('data-id');
        const compData = state.components.find(c => c.id === compId);
        
        if (!compData) return;
        
        // Comprehensive search across all component data
        const searchableContent = [
            compData.name || '',
            compData.file || '',
            compData.description || '',
            ...(compData.comments || []),
            ...(compData.functions || []),
            ...(compData.variables || []),
            ...(compData.classes || [])
        ].join(' ').toLowerCase();
        
        const matches = searchableContent.includes(query);
        
        if (matches) {
            comp.style.opacity = '1';
            comp.classList.add('search-match');
            hasMatches = true;
            
            // Highlight matching text
            highlightSearchTermInComponent(comp, query);
            
            // Add to search results with details
            const matchDetails = [];
            if ((compData.name || '').toLowerCase().includes(query)) {
                matchDetails.push({ type: 'filename', text: compData.name });
            }
            if ((compData.description || '').toLowerCase().includes(query)) {
                matchDetails.push({ type: 'description', text: compData.description });
            }
            (compData.comments || []).forEach(comment => {
                if (comment.toLowerCase().includes(query)) {
                    matchDetails.push({ type: 'comment', text: comment });
                }
            });
            (compData.functions || []).forEach(func => {
                if (func.toLowerCase().includes(query)) {
                    matchDetails.push({ type: 'function', text: func });
                }
            });
            (compData.variables || []).forEach(variable => {
                if (variable.toLowerCase().includes(query)) {
                    matchDetails.push({ type: 'variable', text: variable });
                }
            });
            (compData.classes || []).forEach(cls => {
                if (cls.toLowerCase().includes(query)) {
                    matchDetails.push({ type: 'class', text: cls });
                }
            });
            
            if (matchDetails.length > 0) {
                searchResults.push({
                    file: compData.file,
                    name: compData.name,
                    matches: matchDetails
                });
            }
        } else {
            comp.style.opacity = '0.2';
            comp.classList.remove('search-match');
        }
    });
    
    // Show search results panel
    displaySearchResults(searchResults);
    
    // Show notification with search results count
    if (hasMatches) {
        showNotification(`Found ${searchResults.length} matches for "${query}"`);
    } else {
        showNotification(`No matches found for "${query}"`);
    }
}

function displaySearchResults(results) {
    // Create or update search results panel
    let resultsPanel = document.getElementById('searchResults');
    if (!resultsPanel) {
        resultsPanel = document.createElement('div');
        resultsPanel.id = 'searchResults';
        resultsPanel.className = 'search-results-panel';
        document.body.appendChild(resultsPanel);
    }
    
    if (results.length === 0) {
        resultsPanel.style.display = 'none';
        return;
    }
    
    resultsPanel.style.display = 'block';
    resultsPanel.innerHTML = `
        <div class="search-results-header">
            <h3>Search Results (${results.length})</h3>
            <button onclick="clearSearchResults()">✖</button>
        </div>
        <div class="search-results-content">
            ${results.map(result => `
                <div class="search-result-item" data-file="${result.file}">
                    <div class="result-file">${result.name || result.file}</div>
                    <div class="result-matches">
                        ${result.matches.map(match => `
                            <div class="result-line">
                                <strong>${match.type}:</strong> ${match.text.substring(0, 100)}${match.text.length > 100 ? '...' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function clearSearchResults() {
    const resultsPanel = document.getElementById('searchResults');
    if (resultsPanel) {
        resultsPanel.style.display = 'none';
    }
}

function highlightSearchTermInComponent(component, searchTerm) {
    // Remove existing highlights
    component.querySelectorAll('.search-highlight').forEach(el => {
        const text = el.textContent;
        el.replaceWith(document.createTextNode(text));
    });
    
    // Add new highlights (simplified - only in title for now)
    const title = component.querySelector('.component-title');
    if (title && title.textContent.toLowerCase().includes(searchTerm)) {
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        title.innerHTML = title.textContent.replace(regex, '<span class="search-highlight">$1</span>');
    }
}

// Close search box and advanced panel when clicking outside
document.addEventListener('click', (e) => {
    // Close search box
    if (searchBox.classList.contains('show') && 
        !searchBox.contains(e.target) && 
        !e.target.matches('#searchBtn')) {
        searchBox.classList.remove('show');
        searchInput.value = '';
        performSearch();
    }
    
    // Close advanced panel
    const advancedPanel = document.getElementById('advancedControls');
    if (advancedPanel && advancedPanel.classList.contains('show') &&
        !advancedPanel.contains(e.target) &&
        !e.target.matches('#advancedToggle') &&
        !e.target.closest('#advancedToggle')) {
        advancedPanel.classList.remove('show');
    }
});

// UI toggles
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    
    // Let CSS handle the positioning - don't modify inline styles
    const diagramContainer = document.querySelector('.diagram-container');
    diagramContainer.style.marginLeft = '';
    diagramContainer.style.width = '';
    
    // Recalculate layout after sidebar toggle
    setTimeout(() => {
        updateTransform();
        // Remove drawConnections() here as it's not needed for sidebar toggle
        // The connections are already drawn and don't need to be redrawn
        updateMinimap();
    }, 300);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function toggleAdvancedPanel() {
    const panel = document.getElementById('advancedControls');
    panel.classList.toggle('show');
}

function resetView() {
    // Reset all state to initial values
    state.zoom = 0.8;
    state.pan = { x: 0, y: 0 };
    state.isDragging = false;
    state.selectedComponent = null;
    state.isSpacePressed = false;
    state.umlView = false;
    
    // Clear any filters or selections
    clearSelection();
    
    // Remove UML view if active
    document.body.classList.remove('uml-view');
    const umlBtn = document.getElementById('umlToggle');
    if (umlBtn) {
        umlBtn.classList.remove('active');
    }
    
    // Reset search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    document.getElementById('searchBox').style.display = 'none';
    
    // Show all components
    document.querySelectorAll('.component').forEach(comp => {
        comp.style.display = '';
        comp.classList.remove('search-match');
    });
    
    // Show all connections
    document.querySelectorAll('.connection-path').forEach(path => {
        path.style.display = '';
    });
    
    // Reset all layer filters
    document.querySelectorAll('[data-filter-layer]').forEach(checkbox => {
        checkbox.checked = true;
    });
    
    // Clear advanced panel selections
    const componentList = document.querySelector('.component-list');
    if (componentList) {
        componentList.innerHTML = '<option value="">Select a component...</option>';
    }
    
    // Re-render with normal view
    if (state.projectData) {
        renderLayers();
        renderDatabaseNodes();
        setTimeout(() => {
            drawConnections();
            centerDiagram();
            updateMinimap();
        }, 100);
    }
    
    showNotification('View fully reset to initial state');
}

// Export functionality
function exportDiagram() {
    // Create export dialog
    const dialog = document.createElement('div');
    dialog.className = 'export-dialog';
    dialog.innerHTML = `
        <div class="export-dialog-content">
            <h3>Export Diagram</h3>
            <div class="export-options">
                <label class="export-option">
                    <input type="radio" name="exportFormat" value="png" checked>
                    <span>PNG Image</span>
                </label>
                <label class="export-option">
                    <input type="radio" name="exportFormat" value="json">
                    <span>JSON Data</span>
                </label>
                <label class="export-option">
                    <input type="radio" name="exportFormat" value="html">
                    <span>Standalone HTML</span>
                </label>
            </div>
            <div class="export-actions">
                <button class="export-btn-cancel">Cancel</button>
                <button class="export-btn-export">Export</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Handle export
    dialog.querySelector('.export-btn-export').addEventListener('click', () => {
        const format = dialog.querySelector('input[name="exportFormat"]:checked').value;
        performExport(format);
        document.body.removeChild(dialog);
    });
    
    // Handle cancel
    dialog.querySelector('.export-btn-cancel').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
}

function performExport(format) {
    showNotification(`Exporting as ${format.toUpperCase()}...`);
    
    const exportData = {
        format: format,
        projectData: state.projectData,
        viewState: {
            zoom: state.zoom,
            pan: state.pan
        }
    };
    
    switch (format) {
        case 'png':
            exportAsPNG();
            break;
        case 'json':
            exportAsJSON(exportData);
            break;
        case 'html':
            exportAsHTML();
            break;
    }
}

function exportAsPNG() {
    showNotification('Generating PNG image...');
    
    try {
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate bounds
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        // Get all components bounds
        const components = diagramContent.querySelectorAll('.component');
        components.forEach(comp => {
            const rect = comp.getBoundingClientRect();
            const diagramRect = diagramContent.getBoundingClientRect();
            
            const x = rect.left - diagramRect.left;
            const y = rect.top - diagramRect.top;
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + rect.width);
            maxY = Math.max(maxY, y + rect.height);
        });
        
        // Add padding
        const padding = 50;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;
        
        const width = maxX - minX;
        const height = maxY - minY;
        
        // Set canvas size
        canvas.width = width;
        canvas.height = height;
        
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        // Draw layers
        const layers = diagramContent.querySelectorAll('.layer');
        layers.forEach(layer => {
            const layerComps = layer.querySelectorAll('.component');
            layerComps.forEach(comp => {
                const rect = comp.getBoundingClientRect();
                const diagramRect = diagramContent.getBoundingClientRect();
                
                const x = rect.left - diagramRect.left - minX;
                const y = rect.top - diagramRect.top - minY;
                
                // Draw component background
                const bgColor = getComputedStyle(comp).backgroundColor || '#f5f5f5';
                ctx.fillStyle = bgColor;
                ctx.fillRect(x, y, rect.width, rect.height);
                
                // Draw border
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, rect.width, rect.height);
                
                // Draw text
                const title = comp.querySelector('.component-title');
                if (title) {
                    ctx.fillStyle = '#333333';
                    ctx.font = '14px Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(title.textContent, x + rect.width/2, y + 30);
                }
            });
        });
        
        // Draw connections
        const svg = document.getElementById('connectionsSvg');
        const paths = svg.querySelectorAll('path');
        paths.forEach(path => {
            const d = path.getAttribute('d');
            const strokeColor = path.style.stroke || '#58a6ff';
            const strokeWidth = path.style.strokeWidth || 2;
            
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeWidth;
            ctx.setLineDash(path.style.strokeDasharray ? path.style.strokeDasharray.split(',').map(n => parseInt(n)) : []);
            
            // Parse and draw path
            const pathCommands = d.match(/[MLCQZ][^MLCQZ]*/g);
            ctx.beginPath();
            
            pathCommands.forEach(cmd => {
                const type = cmd[0];
                const coords = cmd.slice(1).trim().split(/[\s,]+/).map(n => parseFloat(n));
                
                switch(type) {
                    case 'M':
                        ctx.moveTo(coords[0] - minX, coords[1] - minY);
                        break;
                    case 'L':
                        ctx.lineTo(coords[0] - minX, coords[1] - minY);
                        break;
                    case 'C':
                        ctx.bezierCurveTo(
                            coords[0] - minX, coords[1] - minY,
                            coords[2] - minX, coords[3] - minY,
                            coords[4] - minX, coords[5] - minY
                        );
                        break;
                }
            });
            
            ctx.stroke();
            ctx.setLineDash([]);
        });
        
        // Convert to base64
        canvas.toBlob(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                vscode.postMessage({
                    command: 'export',
                    data: {
                        format: 'png',
                        content: base64,
                        isBase64: true
                    }
                });
                showNotification('PNG exported successfully!');
            };
            reader.readAsDataURL(blob);
        }, 'image/png');
        
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Failed to export PNG. Please try again.');
    }
}

// Fallback PNG capture using SVG foreignObject
function captureAsPNG() {
    const rect = diagramContent.getBoundingClientRect();
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
            <foreignObject width="100%" height="100%">
                <div xmlns="http://www.w3.org/1999/xhtml" style="background: white;">
                    ${diagramContent.outerHTML}
                </div>
            </foreignObject>
        </svg>
    `;
    
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    
    return new Promise((resolve) => {
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = rect.width;
            canvas.height = rect.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL.split(',')[1]);
        };
        img.src = url;
    });
}

function exportAsJSON(data) {
    vscode.postMessage({
        command: 'export',
        data: {
            format: 'json',
            content: JSON.stringify(data, null, 2)
        }
    });
}

function exportAsHTML() {
    // Create standalone HTML with embedded styles and scripts
    const html = createStandaloneHTML();
    vscode.postMessage({
        command: 'export',
        data: {
            format: 'html',
            content: html
        }
    });
}

function createStandaloneHTML() {
    // Get current styles
    const styles = Array.from(document.styleSheets)
        .map(sheet => {
            try {
                return Array.from(sheet.cssRules)
                    .map(rule => rule.cssText)
                    .join('\n');
            } catch (e) {
                return '';
            }
        })
        .join('\n');
    
    // Create standalone HTML with embedded everything
    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeSync Architecture Diagram - ${new Date().toLocaleDateString()}</title>
    <style>
        body { 
            margin: 0; 
            padding: 20px; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
        }
        .export-header {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .export-header h1 {
            margin: 0 0 10px 0;
            color: #333;
        }
        .export-info {
            color: #666;
            font-size: 14px;
        }
        .diagram-wrapper {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: auto;
        }
        ${styles}
        
        /* Override some styles for export */
        .diagram-content {
            transform: none !important;
            position: relative !important;
        }
        .minimap, .search-box, .controls, .advanced-controls {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="export-header">
        <h1>CodeSync Architecture Diagram</h1>
        <div class="export-info">
            <p>Project: ${state.projectData?.rootPath || 'Unknown'}</p>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <p>Components: ${state.components.length} | Connections: ${state.connections.length}</p>
        </div>
    </div>
    <div class="diagram-wrapper">
        ${diagramContent.outerHTML}
    </div>
    <script>
        // Basic zoom functionality for exported HTML
        let zoom = 1;
        const diagram = document.querySelector('.diagram-content');
        
        document.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                zoom *= e.deltaY > 0 ? 0.9 : 1.1;
                zoom = Math.max(0.5, Math.min(3, zoom));
                diagram.style.transform = 'scale(' + zoom + ')';
                diagram.style.transformOrigin = 'top left';
            }
        });
        
        // Add tooltip functionality
        document.querySelectorAll('.component').forEach(comp => {
            comp.title = comp.getAttribute('data-name') || comp.textContent;
        });
    </script>
</body>
</html>`;
}


// Analysis functions
function findCircularDependencies() {
    showNotification('Analyzing circular dependencies...');
    
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();
    
    function dfs(nodeId, path = []) {
        if (recursionStack.has(nodeId)) {
            // Found a cycle
            const cycleStart = path.indexOf(nodeId);
            const cycle = path.slice(cycleStart);
            
            // 중복 사이클 제거 (같은 사이클의 다른 시작점)
            const cycleKey = [...cycle].sort().join('-');
            const exists = cycles.some(existing => {
                const existingKey = [...existing.nodes].sort().join('-');
                return existingKey === cycleKey;
            });
            
            if (!exists) {
                cycles.push({
                    nodes: cycle,
                    connections: cycle.map((node, i) => ({
                        from: node,
                        to: cycle[(i + 1) % cycle.length]
                    }))
                });
            }
            return;
        }
        
        if (visited.has(nodeId)) return;
        
        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);
        
        // Find all connections from this node
        const outgoing = state.connections.filter(conn => conn.from === nodeId);
        for (const conn of outgoing) {
            dfs(conn.to, [...path]);
        }
        
        recursionStack.delete(nodeId);
    }
    
    // Check each component
    state.components.forEach(comp => {
        if (!visited.has(comp.id)) {
            dfs(comp.id);
        }
    });
    
    // Clear previous highlights
    document.querySelectorAll('.circular-dependency').forEach(el => {
        el.classList.remove('circular-dependency');
    });
    
    // Display results
    if (cycles.length > 0) {
        showNotification(`Found ${cycles.length} circular dependencies!`);
        
        // Store cycles in state for later use
        state.circularDependencies = cycles;
        
        // Highlight circular dependencies
        cycles.forEach((cycle, cycleIndex) => {
            cycle.connections.forEach(conn => {
                const connectionPath = document.querySelector(
                    `[data-connection="${conn.from}-${conn.to}"] path`
                );
                if (connectionPath) {
                    connectionPath.classList.add('circular-dependency');
                    connectionPath.setAttribute('data-cycle-index', cycleIndex);
                }
            });
        });
        
        // Show circular dependency panel
        showCircularDependencyPanel(cycles);
        
        // Update metrics display
        const cycleDescriptions = cycles.map(cycle => 
            cycle.nodes.map(id => state.components.find(c => c.id === id)?.name || id).join(' → ')
        );
        updateMetrics({ circularDependencies: cycles.length, cycles: cycleDescriptions });
    } else {
        showNotification('No circular dependencies found!');
        updateMetrics({ circularDependencies: 0 });
        state.circularDependencies = [];
    }
}

// 원형 의존성 패널 표시
function showCircularDependencyPanel(cycles) {
    // 기존 패널 제거
    const existingPanel = document.getElementById('circularDepPanel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    // 새 패널 생성
    const panel = document.createElement('div');
    panel.id = 'circularDepPanel';
    panel.className = 'circular-dep-panel';
    
    let panelHTML = `
        <div class="panel-header">
            <h3>🔄 Circular Dependencies Found</h3>
            <button class="close-btn" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
        <div class="panel-content">
    `;
    
    cycles.forEach((cycle, index) => {
        const cycleNames = cycle.nodes.map(id => {
            const comp = state.components.find(c => c.id === id);
            return comp ? comp.name : id;
        });
        
        panelHTML += `
            <div class="cycle-item">
                <div class="cycle-header">
                    <span class="cycle-number">Cycle ${index + 1}</span>
                    <div class="cycle-actions">
                        <button class="action-btn" onclick="highlightCycle(${index})">
                            🔍 Highlight
                        </button>
                        <button class="action-btn" onclick="analyzeCycle(${index})">
                            📊 Analyze
                        </button>
                        <button class="action-btn resolve-btn" onclick="showResolveOptions(${index})">
                            🔧 Resolve
                        </button>
                    </div>
                </div>
                <div class="cycle-path">
                    ${cycleNames.join(' → ')} → ${cycleNames[0]}
                </div>
            </div>
        `;
    });
    
    panelHTML += `
        </div>
        <div class="panel-footer">
            <button class="action-btn" onclick="resolveAllCycles()">
                🔧 Resolve All Cycles
            </button>
            <button class="action-btn" onclick="exportCycleReport()">
                📄 Export Report
            </button>
        </div>
    `;
    
    panel.innerHTML = panelHTML;
    document.body.appendChild(panel);
}

// 특정 사이클 하이라이트
function highlightCycle(cycleIndex) {
    // 모든 하이라이트 제거
    document.querySelectorAll('.circular-dependency').forEach(el => {
        el.classList.remove('active');
    });
    
    // 선택된 사이클만 하이라이트
    document.querySelectorAll(`[data-cycle-index="${cycleIndex}"]`).forEach(el => {
        el.classList.add('active');
    });
    
    // 관련 컴포넌트도 하이라이트
    const cycle = state.circularDependencies[cycleIndex];
    cycle.nodes.forEach(nodeId => {
        const component = document.querySelector(`[data-id="${nodeId}"]`);
        if (component) {
            component.classList.add('highlight-cycle');
            setTimeout(() => component.classList.remove('highlight-cycle'), 3000);
        }
    });
}

// 사이클 분석
function analyzeCycle(cycleIndex) {
    const cycle = state.circularDependencies[cycleIndex];
    const components = cycle.nodes.map(id => state.components.find(c => c.id === id));
    
    let analysis = `Cycle Analysis #${cycleIndex + 1}\n\n`;
    analysis += `Components involved:\n`;
    components.forEach(comp => {
        analysis += `- ${comp.name} (${comp.type})\n`;
        analysis += `  File: ${comp.file}\n`;
        analysis += `  Layer: ${comp.layer}\n\n`;
    });
    
    analysis += `Recommendations:\n`;
    analysis += `1. Consider using dependency injection\n`;
    analysis += `2. Extract common interface or abstraction\n`;
    analysis += `3. Apply Dependency Inversion Principle\n`;
    analysis += `4. Consider using event-based communication\n`;
    
    alert(analysis);
}

// 해결 옵션 표시
function showResolveOptions(cycleIndex) {
    const cycle = state.circularDependencies[cycleIndex];
    
    const dialog = document.createElement('div');
    dialog.className = 'resolve-dialog';
    dialog.innerHTML = `
        <div class="dialog-content">
            <h3>Resolve Circular Dependency</h3>
            <p>Choose a resolution strategy for cycle #${cycleIndex + 1}:</p>
            
            <div class="resolve-options">
                <label class="resolve-option">
                    <input type="radio" name="resolveStrategy" value="breakWeakest">
                    <div>
                        <strong>Break Weakest Link</strong>
                        <p>Remove the least important connection in the cycle</p>
                    </div>
                </label>
                
                <label class="resolve-option">
                    <input type="radio" name="resolveStrategy" value="introduceInterface">
                    <div>
                        <strong>Introduce Interface</strong>
                        <p>Create an abstraction layer to break direct dependency</p>
                    </div>
                </label>
                
                <label class="resolve-option">
                    <input type="radio" name="resolveStrategy" value="extractCommon">
                    <div>
                        <strong>Extract Common Module</strong>
                        <p>Move shared functionality to a separate module</p>
                    </div>
                </label>
                
                <label class="resolve-option">
                    <input type="radio" name="resolveStrategy" value="eventBased">
                    <div>
                        <strong>Event-Based Communication</strong>
                        <p>Replace direct calls with event/message passing</p>
                    </div>
                </label>
            </div>
            
            <div class="dialog-actions">
                <button onclick="this.closest('.resolve-dialog').remove()">Cancel</button>
                <button onclick="applyResolution(${cycleIndex}, this)">Apply</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
}

// 해결책 적용
function applyResolution(cycleIndex, button) {
    const dialog = button.closest('.resolve-dialog');
    const strategy = dialog.querySelector('input[name="resolveStrategy"]:checked')?.value;
    
    if (!strategy) {
        alert('Please select a resolution strategy');
        return;
    }
    
    const cycle = state.circularDependencies[cycleIndex];
    
    switch (strategy) {
        case 'breakWeakest':
            // 가장 약한 연결 찾기 (예: 가장 최근에 추가된 연결)
            showNotification('Breaking weakest link in the cycle...');
            // 실제 구현에서는 연결 강도를 분석하여 제거
            break;
            
        case 'introduceInterface':
            showNotification('Suggesting interface introduction...');
            // 인터페이스 도입 제안 생성
            break;
            
        case 'extractCommon':
            showNotification('Analyzing common functionality...');
            // 공통 모듈 추출 제안
            break;
            
        case 'eventBased':
            showNotification('Generating event-based architecture...');
            // 이벤트 기반 통신 제안
            break;
    }
    
    dialog.remove();
    
    // VS Code에 리팩토링 제안 전송
    vscode.postMessage({
        command: 'resolveCycle',
        data: {
            cycleIndex,
            strategy,
            cycle: cycle.nodes.map(id => {
                const comp = state.components.find(c => c.id === id);
                return { id, name: comp.name, file: comp.file };
            })
        }
    });
}

function showCriticalPath() {
    // Check if critical path is already shown
    const existingCriticalPaths = document.querySelectorAll('.critical-path');
    const existingCriticalNodes = document.querySelectorAll('.critical-node');
    const button = document.getElementById('showCriticalPath');
    
    if (existingCriticalPaths.length > 0 || existingCriticalNodes.length > 0) {
        // Hide critical path
        existingCriticalPaths.forEach(path => path.classList.remove('critical-path'));
        existingCriticalNodes.forEach(node => node.classList.remove('critical-node'));
        
        button.textContent = 'Show Critical Path';
        showNotification('Critical path hidden');
        return;
    }
    
    // Show critical path
    showNotification('Calculating critical path...');
    
    const paths = {};
    const maxPath = { length: 0, path: [] };
    
    function findLongestPath(nodeId, visited = new Set(), path = []) {
        if (visited.has(nodeId)) return path.length;
        
        visited.add(nodeId);
        path.push(nodeId);
        
        let maxLength = path.length;
        const outgoing = state.connections.filter(conn => conn.from === nodeId);
        
        for (const conn of outgoing) {
            const length = findLongestPath(conn.to, new Set(visited), [...path]);
            if (length > maxLength) {
                maxLength = length;
                if (length > maxPath.length) {
                    maxPath.length = length;
                    maxPath.path = [...path, conn.to];
                }
            }
        }
        
        return maxLength;
    }
    
    // Find longest path from each component
    state.components.forEach(comp => {
        findLongestPath(comp.id);
    });
    
    if (maxPath.path.length > 0) {
        // Highlight critical path
        for (let i = 0; i < maxPath.path.length - 1; i++) {
            const from = maxPath.path[i];
            const to = maxPath.path[i + 1];
            const connectionPath = document.querySelector(
                `[data-connection="${from}-${to}"]`
            );
            if (connectionPath) {
                connectionPath.classList.add('critical-path');
            }
            
            // Highlight nodes
            const fromNode = document.querySelector(`[data-id="${from}"]`);
            const toNode = document.querySelector(`[data-id="${to}"]`);
            if (fromNode) fromNode.classList.add('critical-node');
            if (toNode) toNode.classList.add('critical-node');
        }
        
        const pathNames = maxPath.path.map(id => 
            state.components.find(c => c.id === id)?.name || id
        ).join(' → ');
        
        showNotification(`Critical path: ${maxPath.length} components`);
        updateMetrics({ criticalPath: pathNames, pathLength: maxPath.length });
        
        // Update button text
        button.textContent = 'Hide Critical Path';
    } else {
        showNotification('No critical path found');
    }
}

function generateReport() {
    showNotification('Generating analysis report...');
    
    const report = {
        timestamp: new Date().toISOString(),
        project: state.projectData.rootPath,
        statistics: {
            totalFiles: state.components.length,
            totalConnections: state.connections.length,
            layers: Object.keys(state.layers).map(layer => ({
                name: layer,
                components: state.layers[layer].length
            }))
        },
        complexity: calculateComplexity(),
        recommendations: generateRecommendations()
    };
    
    // Send report to extension
    vscode.postMessage({
        command: 'export',
        data: {
            format: 'json',
            content: JSON.stringify(report, null, 2),
            filename: `analysis-report-${new Date().toISOString().slice(0, 10)}.json`
        }
    });
}

function calculateComplexity() {
    const complexity = {
        coupling: 0,
        cohesion: 0,
        fanIn: {},
        fanOut: {}
    };
    
    state.components.forEach(comp => {
        const incoming = state.connections.filter(c => c.to === comp.id).length;
        const outgoing = state.connections.filter(c => c.from === comp.id).length;
        
        complexity.fanIn[comp.name] = incoming;
        complexity.fanOut[comp.name] = outgoing;
        complexity.coupling += outgoing;
    });
    
    complexity.averageCoupling = complexity.coupling / state.components.length;
    
    return complexity;
}

function generateRecommendations() {
    const recommendations = [];
    const complexity = calculateComplexity();
    
    if (complexity.averageCoupling > 5) {
        recommendations.push('High coupling detected. Consider refactoring to reduce dependencies.');
    }
    
    // Check for god components
    Object.entries(complexity.fanOut).forEach(([name, count]) => {
        if (count > 10) {
            recommendations.push(`Component "${name}" has too many dependencies (${count}). Consider splitting.`);
        }
    });
    
    // Check for isolated components
    state.components.forEach(comp => {
        const hasConnections = state.connections.some(
            c => c.from === comp.id || c.to === comp.id
        );
        if (!hasConnections) {
            recommendations.push(`Component "${comp.name}" is isolated. Consider removing or connecting.`);
        }
    });
    
    return recommendations;
}

function updateMetrics(metrics) {
    const metricsDisplay = document.getElementById('metricsDisplay');
    if (!metricsDisplay) return;
    
    const existingMetrics = JSON.parse(metricsDisplay.getAttribute('data-metrics') || '{}');
    const updatedMetrics = { ...existingMetrics, ...metrics };
    
    metricsDisplay.setAttribute('data-metrics', JSON.stringify(updatedMetrics));
    
    let html = '';
    Object.entries(updatedMetrics).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            html += `<div class="metric-item">
                <strong>${key}:</strong>
                <ul>${value.map(v => `<li>${v}</li>`).join('')}</ul>
            </div>`;
        } else {
            html += `<div class="metric-item">
                <strong>${key}:</strong> ${value}
            </div>`;
        }
    });
    
    metricsDisplay.innerHTML = html;
}

// Filter functions
function filterLayers() {
    document.querySelectorAll('[data-filter-layer]').forEach(checkbox => {
        const layer = checkbox.getAttribute('data-filter-layer');
        const isChecked = checkbox.checked;
        
        const layerElement = document.querySelector(`[data-layer="${layer}"]`);
        if (layerElement) {
            layerElement.style.display = isChecked ? 'block' : 'none';
        }
    });
    
    // Redraw connections after filtering
    setTimeout(drawConnections, 100);
}

// UML View Toggle
function toggleUMLView() {
    state.umlView = !state.umlView;
    const btn = document.getElementById('umlToggle');
    
    if (state.umlView) {
        btn.classList.add('active');
        document.body.classList.add('uml-view');
    } else {
        btn.classList.remove('active');
        document.body.classList.remove('uml-view');
    }
    
    // Re-render components with UML format
    renderLayers();
    renderDatabaseNodes();
    
    // Redraw connections
    setTimeout(() => {
        drawConnections();
        updateMinimap();
    }, 100);
}

// Tooltip functions
function showTooltip(event, component) {
    const tooltipTitle = tooltip.querySelector('.tooltip-title');
    const tooltipContent = tooltip.querySelector('.tooltip-content');
    
    tooltipTitle.textContent = component.name;
    
    // 기본 정보
    let contentHTML = `
        <div>File: ${component.file}</div>
        <div>Type: ${component.type}</div>
        <div>Layer: ${component.layer}</div>
    `;
    
    // 중요도 표시
    if (component.referenceCount > 0) {
        contentHTML += `<div>참조 횟수: ${component.referenceCount}회</div>`;
    }
    
    // 사용 여부 표시
    if (component.isUsed === false) {
        contentHTML += '<div class="tooltip-warning">⚠️ 사용되지 않는 파일</div>';
    }
    
    // 파일 설명 추가
    if (component.description) {
        contentHTML += '<div class="tooltip-divider"></div>';
        contentHTML += `<div class="tooltip-description"><strong>설명:</strong> ${component.description}</div>`;
    }
    
    // 주석이 있으면 추가 (최대 3개의 핵심 주석만 표시)
    if (component.comments && component.comments.length > 0) {
        contentHTML += '<div class="tooltip-divider"></div>';
        contentHTML += '<div class="tooltip-comments">';
        contentHTML += '<strong>핵심 주석:</strong>';
        // 가장 중요한 주석 3개만 표시
        component.comments.slice(0, 3).forEach(comment => {
            // 첫 80자만 표시, 더 긴 경우 ...
            const truncated = comment.length > 80 ? comment.substring(0, 80) + '...' : comment;
            contentHTML += `<div class="comment-item">• ${truncated}</div>`;
        });
        if (component.comments.length > 3) {
            contentHTML += `<div class="comment-item">... 외 ${component.comments.length - 3}개 주석</div>`;
        }
        contentHTML += '</div>';
    }
    
    tooltipContent.innerHTML = contentHTML;
    
    // 먼저 툴팁을 표시하여 크기를 계산할 수 있도록 함
    tooltip.style.display = 'block';
    
    // 툴팁 크기 가져오기
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipHeight = tooltipRect.height;
    const tooltipWidth = tooltipRect.width;
    
    // 화면 경계 확인
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 기본 위치: 마우스 커서 오른쪽 위
    let left = event.clientX + 15; // 커서 오른쪽 15px
    let top = event.clientY - tooltipHeight - 10; // 커서 위
    
    // 화면 왼쪽 경계 체크
    if (left < 10) {
        left = 10;
    }
    
    // 화면 오른쪽 경계 체크
    if (left + tooltipWidth > windowWidth - 10) {
        left = windowWidth - tooltipWidth - 10;
    }
    
    // 화면 상단 경계 체크 (툴팁이 화면 위로 나가는 경우)
    if (top < 10) {
        // 마우스 아래쪽에 표시
        top = event.clientY + 10;
        tooltip.classList.add('tooltip-below');
    } else {
        tooltip.classList.remove('tooltip-below');
    }
    
    // 화면 하단 경계 체크
    if (top + tooltipHeight > windowHeight - 10) {
        // 다시 위쪽에 표시하되, 더 위로
        top = event.clientY - tooltipHeight - 10;
        tooltip.classList.remove('tooltip-below');
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

// Minimap
function setupMinimap() {
    const minimap = document.getElementById('minimap');
    const minimapViewport = document.getElementById('minimapViewport');
    
    if (!minimap || !minimapViewport) return;
    
    let isDraggingMinimap = false;
    let isDraggingViewport = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialPanX = 0;
    let initialPanY = 0;
    
    // Minimap viewport drag handling
    minimapViewport.addEventListener('mousedown', (e) => {
        isDraggingViewport = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        initialPanX = state.pan.x;
        initialPanY = state.pan.y;
        e.preventDefault();
        e.stopPropagation();
        
        // Add visual feedback
        minimapViewport.classList.add('dragging');
        console.log('Minimap viewport drag started');
    });
    
    // Minimap click handling
    minimap.addEventListener('mousedown', (e) => {
        // Check if clicking on viewport indicator
        const viewportRect = minimapViewport.getBoundingClientRect();
        const clickX = e.clientX;
        const clickY = e.clientY;
        
        if (clickX >= viewportRect.left && clickX <= viewportRect.right &&
            clickY >= viewportRect.top && clickY <= viewportRect.bottom) {
            // Viewport click is handled by its own event listener
            return;
        } else {
            // Click to jump
            const rect = minimap.getBoundingClientRect();
            const padding = 10;
            
            // Get click position relative to minimap content area
            const clickX = e.clientX - rect.left - padding;
            const clickY = e.clientY - rect.top - padding;
            
            // Get stored scale and bounds
            const scale = parseFloat(minimap.dataset.scale) || 0.1;
            const minX = parseFloat(minimap.dataset.minX) || 0;
            const minY = parseFloat(minimap.dataset.minY) || 0;
            
            // Convert click position to diagram space
            const diagramX = clickX / scale + minX;
            const diagramY = clickY / scale + minY;
            
            // Get viewport dimensions
            const viewportRect = viewport.getBoundingClientRect();
            
            // Calculate pan to center the clicked position
            state.pan.x = viewportRect.width / 2 - diagramX * state.zoom;
            state.pan.y = viewportRect.height / 2 - diagramY * state.zoom;
            
            updateTransform();
            updateMinimap();
        }
    });
    
    // This is now handled above before the minimap click handler
    
    // Global mouse move for dragging
    document.addEventListener('mousemove', (e) => {
        if (isDraggingViewport) {
            const scale = parseFloat(minimap.dataset.scale) || 0.1;
            
            // Calculate drag delta in screen space
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            
            // Convert minimap movement to diagram pan
            // The relationship is inverted: moving minimap viewport right = panning diagram left
            state.pan.x = initialPanX - (deltaX / scale) * state.zoom;
            state.pan.y = initialPanY - (deltaY / scale) * state.zoom;
            
            updateTransform();
            updateMinimap();
            
            e.preventDefault();
        }
    });
    
    // Global mouse up
    document.addEventListener('mouseup', () => {
        if (isDraggingViewport) {
            minimapViewport.classList.remove('dragging');
            console.log('Minimap viewport drag ended');
        }
        isDraggingMinimap = false;
        isDraggingViewport = false;
    });
    
    updateMinimap();
}

function updateMinimap() {
    const minimap = document.getElementById('minimap');
    const minimapViewport = document.getElementById('minimapViewport');
    
    if (!minimap || !minimapViewport || !diagramContent) return;
    
    // Clear existing minimap content
    const existingContent = minimap.querySelector('.minimap-content');
    if (existingContent) {
        existingContent.remove();
    }
    
    // Create minimap content container
    const minimapContent = document.createElement('div');
    minimapContent.className = 'minimap-content';
    
    // Calculate actual diagram bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    // Get all components to calculate actual bounds
    const components = diagramContent.querySelectorAll('.component');
    if (components.length === 0) return;
    
    components.forEach(comp => {
        const rect = comp.getBoundingClientRect();
        const diagramRect = diagramContent.getBoundingClientRect();
        
        // Get position in diagram space (accounting for zoom and pan)
        const x = (rect.left - diagramRect.left - state.pan.x) / state.zoom;
        const y = (rect.top - diagramRect.top - state.pan.y) / state.zoom;
        const right = x + rect.width / state.zoom;
        const bottom = y + rect.height / state.zoom;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
    });
    
    // Add padding
    const diagramPadding = 50;
    minX -= diagramPadding;
    minY -= diagramPadding;
    maxX += diagramPadding;
    maxY += diagramPadding;
    
    const diagramWidth = maxX - minX;
    const diagramHeight = maxY - minY;
    
    // Minimap dimensions
    const minimapRect = minimap.getBoundingClientRect();
    const padding = 10;
    const availableWidth = minimapRect.width - padding * 2;
    const availableHeight = minimapRect.height - padding * 2;
    
    // Calculate scale to fit diagram in minimap
    const scaleX = availableWidth / diagramWidth;
    const scaleY = availableHeight / diagramHeight;
    const minimapScale = Math.min(scaleX, scaleY, 0.2);
    
    // Create minimap layers
    const layers = diagramContent.querySelectorAll('.layer');
    layers.forEach(layer => {
        const components = layer.querySelectorAll('.component');
        if (components.length === 0) return;
        
        // Calculate layer bounds
        let layerMinX = Infinity, layerMinY = Infinity;
        let layerMaxX = -Infinity, layerMaxY = -Infinity;
        
        components.forEach(comp => {
            const rect = comp.getBoundingClientRect();
            const diagramRect = diagramContent.getBoundingClientRect();
            
            const x = (rect.left - diagramRect.left - state.pan.x) / state.zoom;
            const y = (rect.top - diagramRect.top - state.pan.y) / state.zoom;
            const right = x + rect.width / state.zoom;
            const bottom = y + rect.height / state.zoom;
            
            layerMinX = Math.min(layerMinX, x);
            layerMinY = Math.min(layerMinY, y);
            layerMaxX = Math.max(layerMaxX, right);
            layerMaxY = Math.max(layerMaxY, bottom);
        });
        
        if (layerMinX === Infinity) return;
        
        const miniLayer = document.createElement('div');
        miniLayer.className = 'minimap-layer';
        
        // Apply scale and position relative to diagram bounds
        miniLayer.style.position = 'absolute';
        miniLayer.style.left = `${(layerMinX - minX) * minimapScale}px`;
        miniLayer.style.top = `${(layerMinY - minY) * minimapScale}px`;
        miniLayer.style.width = `${(layerMaxX - layerMinX) * minimapScale}px`;
        miniLayer.style.height = `${(layerMaxY - layerMinY) * minimapScale}px`;
        
        // Style based on layer type
        const layerClass = layer.className.match(/layer-(\w+)/);
        if (layerClass) {
            const layerColors = {
                'vscode': 'rgba(255, 71, 87, 0.3)',
                'core': 'rgba(52, 152, 219, 0.3)',
                'analysis': 'rgba(155, 89, 182, 0.3)',
                'rendering': 'rgba(46, 204, 113, 0.3)',
                'utility': 'rgba(243, 156, 18, 0.3)',
                'database': 'rgba(231, 76, 60, 0.3)'
            };
            miniLayer.style.backgroundColor = layerColors[layerClass[1]] || 'rgba(88, 166, 255, 0.3)';
            miniLayer.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            miniLayer.style.borderRadius = '4px';
        }
        
        minimapContent.appendChild(miniLayer);
    });
    
    // Position minimap content
    const scaledWidth = diagramWidth * minimapScale;
    const scaledHeight = diagramHeight * minimapScale;
    minimapContent.style.position = 'absolute';
    minimapContent.style.left = `${padding}px`;
    minimapContent.style.top = `${padding}px`;
    minimapContent.style.width = `${scaledWidth}px`;
    minimapContent.style.height = `${scaledHeight}px`;
    
    minimap.appendChild(minimapContent);
    
    // Update viewport indicator
    const viewportRect = viewport.getBoundingClientRect();
    
    // Calculate visible area in diagram space
    const visibleWidth = viewportRect.width / state.zoom;
    const visibleHeight = viewportRect.height / state.zoom;
    const visibleX = -state.pan.x / state.zoom;
    const visibleY = -state.pan.y / state.zoom;
    
    // Convert to minimap space
    const viewportX = (visibleX - minX) * minimapScale + padding;
    const viewportY = (visibleY - minY) * minimapScale + padding;
    const viewportWidth = visibleWidth * minimapScale;
    const viewportHeight = visibleHeight * minimapScale;
    
    // Update viewport indicator
    minimapViewport.style.width = `${Math.max(viewportWidth, 8)}px`;
    minimapViewport.style.height = `${Math.max(viewportHeight, 8)}px`;
    minimapViewport.style.left = `${Math.max(0, viewportX)}px`;
    minimapViewport.style.top = `${Math.max(0, viewportY)}px`;
    
    // Store scale and bounds for click/drag navigation
    minimap.dataset.scale = minimapScale;
    minimap.dataset.minX = minX;
    minimap.dataset.minY = minY;
    minimap.dataset.diagramWidth = diagramWidth;
    minimap.dataset.diagramHeight = diagramHeight;
}

// Status bar
function updateStatusBar(event) {
    if (event) {
        const rect = viewport.getBoundingClientRect();
        const x = Math.round((event.clientX - rect.left - state.pan.x) / state.zoom);
        const y = Math.round((event.clientY - rect.top - state.pan.y) / state.zoom);
        document.getElementById('statusPosition').textContent = `Position: ${x}, ${y}`;
    }
}

// Keyboard handling
function handleKeyboard(e) {
    switch(e.key) {
        case ' ':
            state.isSpacePressed = true;
            viewport.style.cursor = 'grab';
            // Disable pointer events on interactive elements
            document.querySelectorAll('.component, .file-link, .control-btn').forEach(el => {
                el.style.pointerEvents = 'none';
            });
            e.preventDefault();
            break;
        case '+':
        case '=':
            zoom(0.1);
            break;
        case '-':
        case '_':
            zoom(-0.1);
            break;
        case '0':
            resetZoom();
            break;
        case 's':
        case 'S':
            if (!e.ctrlKey) toggleSidebar();
            break;
        case 'a':
        case 'A':
            if (!e.ctrlKey) toggleAdvancedPanel();
            break;
        case 'f':
        case 'F':
            if (e.ctrlKey) {
                e.preventDefault();
                toggleSearch();
            }
            break;
        case 'F11':
            e.preventDefault();
            toggleFullscreen();
            break;
    }
}

function handleKeyboardUp(e) {
    if (e.key === ' ') {
        state.isSpacePressed = false;
        viewport.style.cursor = '';
        // Restore pointer events on interactive elements
        document.querySelectorAll('.component, .file-link, .control-btn').forEach(el => {
            el.style.pointerEvents = '';
        });
    }
}

// Notifications
function showNotification(message) {
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Utility functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Advanced panel functions
function updateSelectedComponentInfo(component) {
    const infoDiv = document.getElementById('selectedComponentInfo');
    if (!component) {
        infoDiv.innerHTML = '<p class="no-selection">No component selected</p>';
        return;
    }
    
    const fileInfo = state.projectData.files.find(f => f.path === component.file);
    
    infoDiv.innerHTML = `
        <div class="component-details">
            <div class="detail-item">
                <strong>Name:</strong> ${component.name}
            </div>
            <div class="detail-item">
                <strong>Type:</strong> ${component.type}
            </div>
            <div class="detail-item">
                <strong>Layer:</strong> ${component.layer}
            </div>
            <div class="detail-item">
                <strong>File:</strong> ${component.file}
            </div>
            ${fileInfo ? `
                <div class="detail-item">
                    <strong>Size:</strong> ${formatBytes(fileInfo.size)}
                </div>
                <div class="detail-item">
                    <strong>Extension:</strong> ${fileInfo.extension}
                </div>
            ` : ''}
        </div>
    `;
}

function updateConnectionsList(component) {
    const listDiv = document.getElementById('connectionsList');
    if (!component) {
        listDiv.innerHTML = '<p class="no-connections">Select a component to view connections</p>';
        return;
    }
    
    const incoming = state.connections.filter(c => c.to === component.id);
    const outgoing = state.connections.filter(c => c.from === component.id);
    
    let html = '';
    
    if (incoming.length > 0) {
        html += '<div class="connections-group"><h4>Incoming (' + incoming.length + ')</h4><ul>';
        incoming.forEach(conn => {
            const source = state.components.find(c => c.id === conn.from);
            if (source) {
                html += `<li class="connection-item" data-component-id="${source.id}">
                    ← ${source.name} <span class="conn-type">(${conn.type})</span>
                </li>`;
            }
        });
        html += '</ul></div>';
    }
    
    if (outgoing.length > 0) {
        html += '<div class="connections-group"><h4>Outgoing (' + outgoing.length + ')</h4><ul>';
        outgoing.forEach(conn => {
            const target = state.components.find(c => c.id === conn.to);
            if (target) {
                html += `<li class="connection-item" data-component-id="${target.id}">
                    → ${target.name} <span class="conn-type">(${conn.type})</span>
                </li>`;
            }
        });
        html += '</ul></div>';
    }
    
    if (incoming.length === 0 && outgoing.length === 0) {
        html = '<p>No connections found</p>';
    }
    
    listDiv.innerHTML = html;
    
    // Add click handlers to connection items
    listDiv.querySelectorAll('.connection-item').forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.dataset.componentId;
            const targetElement = document.querySelector(`[data-id="${targetId}"]`);
            if (targetElement) {
                const targetComponent = state.components.find(c => c.id === targetId);
                selectComponent(targetElement, targetComponent);
                // Scroll to target
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });
}

function clearSelection() {
    document.querySelectorAll('.component').forEach(comp => {
        comp.classList.remove('selected', 'related');
    });
    document.querySelectorAll('.connection-path').forEach(path => {
        path.classList.remove('active');
    });
    
    // Remove has-selection class
    document.querySelector('.diagram-container').classList.remove('has-selection');
    
    state.selectedComponent = null;
    updateSelectedComponentInfo(null);
    updateConnectionsList(null);
    showNotification('Selection cleared');
}

function isolateComponent() {
    if (!state.selectedComponent) {
        showNotification('Please select a component first');
        return;
    }
    
    const componentId = state.selectedComponent.id;
    const relatedIds = new Set([componentId]);
    
    // Find all connected components
    state.connections.forEach(conn => {
        if (conn.from === componentId) relatedIds.add(conn.to);
        if (conn.to === componentId) relatedIds.add(conn.from);
    });
    
    // Hide unrelated components
    document.querySelectorAll('.component').forEach(comp => {
        const id = comp.dataset.id;
        if (!relatedIds.has(id)) {
            comp.style.opacity = '0.1';
        } else {
            comp.style.opacity = '1';
        }
    });
    
    showNotification(`Isolated ${state.selectedComponent.name} and its connections`);
}

function resetIsolation() {
    // Reset opacity for all components
    document.querySelectorAll('.component').forEach(comp => {
        comp.style.opacity = '';
    });
    
    // Show all connections
    document.querySelectorAll('.connection-path').forEach(path => {
        path.style.display = '';
        path.style.opacity = '';
    });
    
    // Remove any isolation-specific classes
    document.body.classList.remove('isolation-mode');
    
    showNotification('Isolation reset');
}

function showDependencyTree() {
    if (!state.selectedComponent) {
        showNotification('Please select a component first');
        return;
    }
    
    // Build dependency tree
    const tree = buildDependencyTree(state.selectedComponent.id);
    
    // Display in a new panel or dialog
    const treeHtml = renderDependencyTree(tree);
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'dependency-tree-dialog';
    dialog.innerHTML = `
        <div class="dialog-content">
            <h3>Dependency Tree: ${state.selectedComponent.name}</h3>
            <div class="tree-content">${treeHtml}</div>
            <button class="close-btn" onclick="this.parentElement.parentElement.remove()">Close</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
}

function buildDependencyTree(componentId, visited = new Set()) {
    if (visited.has(componentId)) {
        return { id: componentId, name: '(circular)', children: [] };
    }
    
    visited.add(componentId);
    const component = state.components.find(c => c.id === componentId);
    if (!component) return null;
    
    const children = [];
    const outgoing = state.connections.filter(c => c.from === componentId);
    
    outgoing.forEach(conn => {
        const child = buildDependencyTree(conn.to, new Set(visited));
        if (child) children.push(child);
    });
    
    return {
        id: componentId,
        name: component.name,
        type: component.type,
        children
    };
}

function renderDependencyTree(node, level = 0) {
    if (!node) return '';
    
    const indent = '  '.repeat(level);
    let html = `<div class="tree-node" style="margin-left: ${level * 20}px">`;
    html += `<span class="tree-icon">${node.children.length > 0 ? '▼' : '▪'}</span> `;
    html += `<span class="tree-name">${node.name}</span>`;
    if (node.type) html += ` <span class="tree-type">(${node.type})</span>`;
    html += '</div>';
    
    if (node.children.length > 0) {
        html += '<div class="tree-children">';
        node.children.forEach(child => {
            html += renderDependencyTree(child, level + 1);
        });
        html += '</div>';
    }
    
    return html;
}

function resolveDependencies() {
    if (!state.selectedComponent) {
        showNotification('Please select a component first');
        return;
    }
    
    // Find circular dependencies involving this component
    const cycles = findCyclesInvolvingComponent(state.selectedComponent.id);
    
    if (cycles.length === 0) {
        showNotification('No circular dependencies found for this component');
        return;
    }
    
    // Show resolution options
    const dialog = document.createElement('div');
    dialog.className = 'resolve-dialog';
    dialog.innerHTML = `
        <div class="dialog-content">
            <h3>Resolve Dependencies: ${state.selectedComponent.name}</h3>
            <p>Found ${cycles.length} circular dependencies</p>
            <div class="cycles-list">
                ${cycles.map((cycle, i) => `
                    <div class="cycle-item">
                        <strong>Cycle ${i + 1}:</strong> ${cycle.join(' → ')}
                    </div>
                `).join('')}
            </div>
            <div class="resolution-options">
                <h4>Resolution Options:</h4>
                <ul>
                    <li>• Introduce an interface or abstraction layer</li>
                    <li>• Move shared functionality to a common module</li>
                    <li>• Use dependency injection</li>
                    <li>• Refactor to remove bidirectional dependencies</li>
                </ul>
            </div>
            <button class="close-btn" onclick="this.parentElement.parentElement.remove()">Close</button>
        </div>
    `;
    
    document.body.appendChild(dialog);
}

function findCyclesInvolvingComponent(componentId) {
    const cycles = [];
    const visited = new Set();
    const stack = [];
    
    function dfs(nodeId) {
        if (stack.includes(nodeId)) {
            // Found a cycle
            const cycleStart = stack.indexOf(nodeId);
            const cycle = stack.slice(cycleStart).concat(nodeId);
            if (cycle.includes(componentId)) {
                cycles.push(cycle.map(id => {
                    const comp = state.components.find(c => c.id === id);
                    return comp ? comp.name : id;
                }));
            }
            return;
        }
        
        if (visited.has(nodeId)) return;
        
        visited.add(nodeId);
        stack.push(nodeId);
        
        const outgoing = state.connections.filter(c => c.from === nodeId);
        outgoing.forEach(conn => {
            dfs(conn.to);
        });
        
        stack.pop();
    }
    
    dfs(componentId);
    return cycles;
}

// 글로벌 함수들을 window 객체에 추가
window.highlightCycle = highlightCycle;
window.analyzeCycle = analyzeCycle;
window.showResolveOptions = showResolveOptions;
window.applyResolution = applyResolution;
window.resolveAllCycles = function() {
    showNotification('Analyzing all cycles for resolution...');
    state.circularDependencies?.forEach((cycle, index) => {
        setTimeout(() => showResolveOptions(index), index * 100);
    });
};
window.exportCycleReport = function() {
    if (!state.circularDependencies || state.circularDependencies.length === 0) {
        showNotification('No circular dependencies to export');
        return;
    }
    
    const report = {
        timestamp: new Date().toISOString(),
        projectName: state.projectData?.name || 'Unknown Project',
        totalCycles: state.circularDependencies.length,
        cycles: state.circularDependencies.map((cycle, index) => ({
            index: index + 1,
            components: cycle.nodes.map(id => {
                const comp = state.components.find(c => c.id === id);
                return {
                    name: comp?.name || id,
                    file: comp?.file || 'unknown',
                    type: comp?.type || 'unknown',
                    layer: comp?.layer || 'unknown'
                };
            }),
            path: cycle.nodes.map(id => 
                state.components.find(c => c.id === id)?.name || id
            ).join(' → ')
        }))
    };
    
    vscode.postMessage({
        command: 'export',
        data: {
            format: 'json',
            content: JSON.stringify(report, null, 2),
            filename: 'circular-dependencies-report.json'
        }
    });
    
    showNotification('Circular dependency report exported!');
};