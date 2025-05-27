// State Management
const state = {
    zoom: 1,
    pan: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    selectedComponent: null,
    isSpacePressed: false,
    connections: [],
    components: [],
    layers: {},
    projectData: null
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
    
    renderLayers();
    renderStats();
    renderFileList();
    updateTransform();
    
    // Render connections after components are rendered
    setTimeout(() => {
        drawConnections();
        setupMinimap();
    }, 100);
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
        if (components.length === 0) return;
        
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
    div.className = `component ${comp.type || ''}`;
    div.setAttribute('data-id', comp.id);
    div.setAttribute('data-file', comp.file);
    
    const iconMap = {
        service: '📊',
        provider: '🔧',
        webview: '🖼️',
        component: '📄',
        file: '📁'
    };
    
    const icon = iconMap[comp.type] || '📄';
    
    div.innerHTML = `
        <div class="component-header">
            <div class="component-title">
                <span>${icon}</span> ${comp.name}
            </div>
            ${comp.type === 'service' ? '<div class="component-badge">Service</div>' : ''}
        </div>
        <div class="component-content">
            <div class="component-section">
                <div class="component-section-title">File</div>
                <div class="component-item">${comp.file}</div>
            </div>
        </div>
    `;
    
    // Add event listeners
    div.addEventListener('click', () => selectComponent(div, comp));
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
        state.components.slice(0, 10).forEach(comp => {
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
        itemDiv.style.paddingLeft = `${level * 20}px`;
        
        if (item.isDirectory) {
            // Create folder element
            const folderHeader = document.createElement('div');
            folderHeader.className = 'folder-header';
            folderHeader.innerHTML = `
                <span class="folder-toggle">▶</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name">${item.name}</span>
            `;
            
            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';
            folderContent.style.display = 'none';
            
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
    
    // Add defs for markers
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Arrow marker
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('fill', '#58a6ff');
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);
    
    // Draw connections
    state.connections.forEach((conn, index) => {
        const fromEl = document.querySelector(`[data-id="${conn.from}"]`);
        const toEl = document.querySelector(`[data-id="${conn.to}"]`);
        
        if (fromEl && toEl) {
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const containerRect = diagramContent.getBoundingClientRect();
            
            const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
            const y1 = fromRect.bottom - containerRect.top;
            const x2 = toRect.left + toRect.width / 2 - containerRect.left;
            const y2 = toRect.top - containerRect.top;
            
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('data-connection', `${conn.from}-${conn.to}`);
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const midY = (y1 + y2) / 2;
            const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
            
            path.setAttribute('d', d);
            path.setAttribute('class', 'connection-path');
            path.setAttribute('id', `path-${index}`);
            path.setAttribute('data-type', conn.type);
            path.setAttribute('marker-end', 'url(#arrowhead)');
            
            g.appendChild(path);
            
            // Add label
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
            
            svg.appendChild(g);
        }
    });
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
        zoom(delta);
    });
    
    // Sidebar toggle
    document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);
    
    // Search
    document.getElementById('searchBtn').addEventListener('click', toggleSearch);
    searchInput.addEventListener('input', performSearch);
    
    // Export
    document.getElementById('exportBtn').addEventListener('click', exportDiagram);
    
    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    
    // Advanced toggle
    document.getElementById('advancedToggle').addEventListener('click', toggleAdvancedPanel);
    
    // Analysis tools
    document.getElementById('findCircularDeps').addEventListener('click', findCircularDependencies);
    document.getElementById('showCriticalPath').addEventListener('click', showCriticalPath);
    document.getElementById('generateReport').addEventListener('click', generateReport);
    
    // Layer filters
    document.querySelectorAll('[data-filter-layer]').forEach(checkbox => {
        checkbox.addEventListener('change', filterLayers);
    });
    
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
}

function resetZoom() {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
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
    }
}

function drag(e) {
    if (state.isDragging) {
        state.pan.x = e.clientX - state.dragStart.x;
        state.pan.y = e.clientY - state.dragStart.y;
        updateTransform();
        updateStatusBar(e);
    }
}

function endDrag() {
    state.isDragging = false;
    viewport.classList.remove('dragging');
}

function updateTransform() {
    if (diagramContent) {
        diagramContent.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    }
}

// Component selection
function selectComponent(element, component) {
    // Remove previous selection
    document.querySelectorAll('.component').forEach(comp => {
        comp.classList.remove('selected');
    });
    
    // Add selection
    element.classList.add('selected');
    state.selectedComponent = component;
    
    // Show connections
    showComponentConnections(component);
    
    // Highlight connections
    highlightConnections(component.id);
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
    }
}

function performSearch() {
    const query = searchInput.value.toLowerCase();
    
    document.querySelectorAll('.component').forEach(comp => {
        const name = comp.querySelector('.component-title').textContent.toLowerCase();
        const file = comp.getAttribute('data-file').toLowerCase();
        
        if (name.includes(query) || file.includes(query)) {
            comp.style.opacity = '1';
        } else {
            comp.style.opacity = '0.3';
        }
    });
}

// UI toggles
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
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

// Export functionality
function exportDiagram() {
    showNotification('Exporting diagram...');
    
    // In a real implementation, this would generate an image or PDF
    setTimeout(() => {
        vscode.postMessage({
            command: 'showInfo',
            data: { message: 'Diagram exported successfully!' }
        });
    }, 1000);
}

// Analysis functions
function findCircularDependencies() {
    showNotification('Analyzing circular dependencies...');
    // Implementation would analyze the connections graph
}

function showCriticalPath() {
    showNotification('Calculating critical path...');
    // Implementation would find the longest dependency chain
}

function generateReport() {
    showNotification('Generating analysis report...');
    // Implementation would create a detailed report
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

// Tooltip functions
function showTooltip(event, component) {
    const tooltipTitle = tooltip.querySelector('.tooltip-title');
    const tooltipContent = tooltip.querySelector('.tooltip-content');
    
    tooltipTitle.textContent = component.name;
    tooltipContent.innerHTML = `
        <div>File: ${component.file}</div>
        <div>Type: ${component.type}</div>
        <div>Layer: ${component.layer}</div>
    `;
    
    tooltip.style.display = 'block';
    tooltip.style.left = event.pageX + 10 + 'px';
    tooltip.style.top = event.pageY + 10 + 'px';
}

function hideTooltip() {
    tooltip.style.display = 'none';
}

// Minimap
function setupMinimap() {
    updateMinimap();
}

function updateMinimap() {
    // Minimap implementation would go here
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