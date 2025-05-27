// State Management
const state = {
    zoom: 1,
    pan: { x: 0, y: 0 },
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    selectedComponent: null,
    isSpacePressed: false,
    connections: [
        { from: 'extension', to: 'diagramService', label: 'activate', type: 'control' },
        { from: 'extension', to: 'commands', label: 'register', type: 'control' },
        { from: 'commands', to: 'codeParser', label: 'analyze', type: 'data' },
        { from: 'codeParser', to: 'analyzers', label: 'AST', type: 'data' },
        { from: 'analyzers', to: 'elementExtractor', label: 'elements', type: 'data' },
        { from: 'elementExtractor', to: 'dependencyResolver', label: 'relations', type: 'data' },
        { from: 'diagramService', to: 'diagramRenderer', label: 'render', type: 'control' },
        { from: 'diagramRenderer', to: 'mermaidIntegration', label: 'mermaid', type: 'data' },
        { from: 'diagramRenderer', to: 'd3Visualization', label: 'd3', type: 'data' },
        { from: 'webviewProvider', to: 'reactComponents', label: 'postMessage', type: 'bidirectional' },
        { from: 'reactComponents', to: 'webviewProvider', label: 'events', type: 'bidirectional' },
        { from: 'fileWatcher', to: 'codeParser', label: 'onChange', type: 'event' },
        { from: 'exportService', to: 'fileUtils', label: 'save', type: 'data' },
        { from: 'errorDetection', to: 'logging', label: 'log', type: 'data' },
        { from: 'themeManager', to: 'configService', label: 'config', type: 'data' },
        { from: 'architectureService', to: 'diagramService', label: 'architecture', type: 'data' },
        { from: 'navigationService', to: 'extension', label: 'navigate', type: 'control' },
        { from: 'providers', to: 'analyzers', label: 'provide', type: 'data' }
    ]
};

// DOM Elements
const viewport = document.getElementById('viewport');
const diagramContent = document.getElementById('diagramContent');
const zoomLevel = document.getElementById('zoomLevel');
const sidebar = document.getElementById('sidebar');
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const tooltip = document.getElementById('tooltip');
const activeConnections = document.getElementById('activeConnections');
const notification = document.getElementById('notification');

// Initialize
function init() {
    drawConnections();
    attachEventListeners();
    updateTransform();
    setupMinimap();
    updateStatusBar();
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
            
            if (conn.type === 'bidirectional') {
                path.setAttribute('marker-end', 'url(#arrowhead)');
                path.setAttribute('marker-start', 'url(#arrowhead)');
            } else {
                path.setAttribute('marker-end', 'url(#arrowhead)');
            }
            
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
    document.getElementById('zoomReset').addEventListener('click', () => resetZoom());
    
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
    
    // Component clicks
    document.querySelectorAll('.component').forEach(comp => {
        comp.addEventListener('click', (e) => {
            if (!state.isSpacePressed) {
                selectComponent(comp);
            }
        });
        comp.addEventListener('mouseenter', (e) => showTooltip(e, comp));
        comp.addEventListener('mouseleave', hideTooltip);
    });
    
    // File links
    document.querySelectorAll('.file-link').forEach(link => {
        link.addEventListener('click', () => {
            const file = link.getAttribute('data-file');
            console.log(`Opening file: ${file}`);
            // In VS Code extension, this would trigger file opening
            showNotification(`Would open: ${file}`);
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
    document.addEventListener('keyup', handleKeyboard);
    
    // Window resize
    window.addEventListener('resize', () => {
        drawConnections();
        updateMinimap();
    });
    
    // Mouse move for status bar
    viewport.addEventListener('mousemove', updateStatusBar);
}

// Zoom functions
function zoom(delta) {
    state.zoom = Math.max(0.3, Math.min(3, state.zoom + delta));
    updateTransform();
    updateZoomLevel();
    updateStatusBar();
    smoothMinimapUpdate(true);
}

function resetZoom() {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    updateTransform();
    updateZoomLevel();
    updateStatusBar();
    smoothMinimapUpdate(true);
}

function updateTransform() {
    diagramContent.style.transform = `translate(-50%, -50%) translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
}

function updateZoomLevel() {
    zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
    document.getElementById('statusZoom').textContent = `Zoom: ${Math.round(state.zoom * 100)}%`;
}

// Pan functions
function startDrag(e) {
    if (!state.isSpacePressed && e.target.closest('.component')) return;
    state.isDragging = true;
    state.dragStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
    viewport.classList.add('dragging');
    if (state.isSpacePressed) {
        e.preventDefault();
    }
}

function drag(e) {
    if (!state.isDragging) return;
    state.pan.x = e.clientX - state.dragStart.x;
    state.pan.y = e.clientY - state.dragStart.y;
    updateTransform();
    smoothMinimapUpdate();
    
    // Cursor is handled by the global style rule when space is pressed
}

function endDrag() {
    state.isDragging = false;
    viewport.classList.remove('dragging');
    
    // Cursor is handled by the global style rule when space is pressed
}

// Component selection
function selectComponent(comp) {
    // Remove previous selection
    document.querySelectorAll('.component.selected').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.connection-path.active').forEach(c => c.classList.remove('active'));
    
    // Add selection
    comp.classList.add('selected');
    state.selectedComponent = comp.getAttribute('data-id');
    
    // Highlight connections
    const connections = state.connections.filter(c => 
        c.from === state.selectedComponent || c.to === state.selectedComponent
    );
    
    connections.forEach(conn => {
        const path = document.querySelector(`[data-connection="${conn.from}-${conn.to}"] path`);
        if (path) path.classList.add('active');
    });
    
    // Update sidebar
    updateActiveConnections(connections);
}

function updateActiveConnections(connections) {
    if (connections.length === 0) {
        activeConnections.innerHTML = '<div style="color: #8b949e;">No connections</div>';
        return;
    }
    
    const html = connections.map(conn => {
        const direction = conn.from === state.selectedComponent ? '→' : '←';
        const other = conn.from === state.selectedComponent ? conn.to : conn.from;
        return `
            <div class="file-link" style="cursor: pointer;" onclick="scrollToComponent('${other}')">
                <span>${direction}</span>
                <span>${other}</span>
                <span style="color: #8b949e; font-size: 11px;">(${conn.label})</span>
            </div>
        `;
    }).join('');
    
    activeConnections.innerHTML = html;
}

function scrollToComponent(id) {
    const comp = document.querySelector(`[data-id="${id}"]`);
    if (comp) {
        comp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        selectComponent(comp);
    }
}

// UI Functions
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    document.getElementById('toggleSidebar').classList.toggle('active');
}

function toggleSearch() {
    searchBox.classList.toggle('show');
    if (searchBox.classList.contains('show')) {
        searchInput.focus();
    } else {
        searchInput.value = '';
        performSearch();
    }
}

function performSearch() {
    const query = searchInput.value.toLowerCase();
    
    document.querySelectorAll('.component').forEach(comp => {
        const text = comp.textContent.toLowerCase();
        if (query && !text.includes(query)) {
            comp.style.opacity = '0.3';
        } else {
            comp.style.opacity = '1';
        }
    });
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
    document.getElementById('advancedToggle').classList.toggle('active');
}

// Keyboard Shortcuts
function handleKeyboard(e) {
    if (e.key === ' ' && e.target.tagName !== 'INPUT') {
        if (e.type === 'keydown' && !state.isSpacePressed) {
            state.isSpacePressed = true;
            // Add a global style rule to override all cursors
            const style = document.createElement('style');
            style.id = 'space-cursor-override';
            style.textContent = '* { cursor: grab !important; } *:active { cursor: grabbing !important; }';
            document.head.appendChild(style);
            e.preventDefault();
        } else if (e.type === 'keyup') {
            state.isSpacePressed = false;
            // Remove the style override
            const style = document.getElementById('space-cursor-override');
            if (style) style.remove();
            e.preventDefault();
        }
    } else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
    } else if (e.key === 's' && !e.ctrlKey && e.target.tagName !== 'INPUT') {
        toggleSidebar();
    } else if (e.key === 'a' && !e.ctrlKey && e.target.tagName !== 'INPUT') {
        toggleAdvancedPanel();
    } else if (e.key === '0' && e.target.tagName !== 'INPUT') {
        resetZoom();
    } else if (e.key === '+' || e.key === '=') {
        zoom(0.1);
    } else if (e.key === '-') {
        zoom(-0.1);
    } else if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
    } else if (e.key === 'Escape') {
        searchBox.classList.remove('show');
        searchInput.value = '';
        performSearch();
    }
}

// Tooltip Functions
function showTooltip(e, comp) {
    const id = comp.getAttribute('data-id');
    const file = comp.getAttribute('data-file');
    const title = comp.querySelector('.component-title').textContent.trim();
    
    tooltip.querySelector('.tooltip-title').textContent = title;
    
    // Get connection count
    const connectionCount = state.connections.filter(c => 
        c.from === id || c.to === id
    ).length;
    
    tooltip.querySelector('.tooltip-content').innerHTML = `
        <div><strong>ID:</strong> ${id}</div>
        <div><strong>File:</strong> ${file}</div>
        <div><strong>Connections:</strong> ${connectionCount}</div>
        <div style="margin-top: 8px; font-size: 11px; color: #8b949e;">
            Click to select • Double-click to open file
        </div>
    `;
    
    tooltip.classList.add('show');
    
    // Position tooltip
    const rect = comp.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = rect.bottom + 10 + 'px';
    
    // Adjust if off screen
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left = window.innerWidth - tooltipRect.width - 20 + 'px';
    }
    if (tooltipRect.bottom > window.innerHeight) {
        tooltip.style.top = rect.top - tooltipRect.height - 10 + 'px';
    }
}

function hideTooltip() {
    tooltip.classList.remove('show');
}

// Export Functions
function exportDiagram() {
    const menu = document.createElement('div');
    menu.style.cssText = `
        position: absolute;
        background: #1f2428;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 1000;
    `;
    
    const formats = ['PNG', 'SVG', 'PDF', 'HTML'];
    formats.forEach(format => {
        const option = document.createElement('div');
        option.style.cssText = `
            padding: 8px 16px;
            cursor: pointer;
            border-radius: 4px;
            transition: background 0.2s;
        `;
        option.textContent = `Export as ${format}`;
        option.onmouseover = () => option.style.background = '#30363d';
        option.onmouseout = () => option.style.background = 'transparent';
        option.onclick = () => {
            exportAs(format);
            document.body.removeChild(menu);
        };
        menu.appendChild(option);
    });
    
    // Position menu
    const btnRect = document.getElementById('exportBtn').getBoundingClientRect();
    menu.style.top = btnRect.bottom + 5 + 'px';
    menu.style.right = window.innerWidth - btnRect.right + 'px';
    
    document.body.appendChild(menu);
    
    // Close menu on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
            document.removeEventListener('click', closeMenu);
        });
    }, 0);
}

function exportAs(format) {
    showNotification(`Exporting as ${format}...`);
    
    // In a real implementation, this would use canvas or other methods
    // to actually export the diagram
    setTimeout(() => {
        showNotification(`Exported successfully as ${format}!`);
    }, 1000);
}

// Minimap Functions
function setupMinimap() {
    const minimap = document.getElementById('minimap');
    const viewport = document.getElementById('minimapViewport');
    
    // Initialize minimap state
    state.minimap = {
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        scale: 1,
        isDragging: false,
        dragOffset: { x: 0, y: 0 },
        lastMousePos: { x: 0, y: 0 },
        startPan: { x: 0, y: 0 }  // Store pan position at drag start
    };
    
    calculateDiagramBounds();
    renderMinimapComponents();
    updateMinimapViewport();
    
    // Minimap click to navigate
    minimap.addEventListener('click', (e) => {
        // Skip if we just finished dragging
        if (state.minimap.wasDragging) {
            state.minimap.wasDragging = false;
            return;
        }
        
        const minimapRect = minimap.getBoundingClientRect();
        const clickX = e.clientX - minimapRect.left;
        const clickY = e.clientY - minimapRect.top;
        
        // Convert minimap coordinates to world coordinates
        const worldX = (clickX - 8) / state.minimap.scale + state.minimap.bounds.minX;
        const worldY = (clickY - 8) / state.minimap.scale + state.minimap.bounds.minY;
        
        // Center the view on the clicked position
        state.pan.x = -worldX * state.zoom + window.innerWidth / 2;
        state.pan.y = -worldY * state.zoom + window.innerHeight / 2;
        
        updateTransform();
        updateMinimapViewport();
    });
    
    // Viewport dragging - improved version
    viewport.addEventListener('mousedown', (e) => {
        state.minimap.isDragging = true;
        
        // Store the current mouse position and pan state
        state.minimap.lastMousePos = {
            x: e.clientX,
            y: e.clientY
        };
        
        // Store the pan position at drag start
        state.minimap.startPan = {
            x: state.pan.x,
            y: state.pan.y
        };
        
        // Calculate the offset from mouse to viewport center
        const viewportRect = viewport.getBoundingClientRect();
        const viewportCenterX = viewportRect.left + viewportRect.width / 2;
        const viewportCenterY = viewportRect.top + viewportRect.height / 2;
        
        state.minimap.dragOffset = {
            x: e.clientX - viewportCenterX,
            y: e.clientY - viewportCenterY
        };
        
        // Don't set cursor here, let the global rules handle it
        if (!state.isSpacePressed) {
            viewport.style.cursor = 'grabbing';
        }
        e.stopPropagation();
        e.preventDefault();
    });
    
    // Global mouse move handler for smoother dragging
    document.addEventListener('mousemove', (e) => {
        if (!state.minimap.isDragging) return;
        
        // Calculate mouse movement delta
        const deltaX = e.clientX - state.minimap.lastMousePos.x;
        const deltaY = e.clientY - state.minimap.lastMousePos.y;
        
        // Update last mouse position
        state.minimap.lastMousePos = { x: e.clientX, y: e.clientY };
        
        // Convert mouse delta to world coordinate delta
        // The minimap shows a scaled-down version of the world
        // When dragging the minimap viewport, we need to invert the movement
        const worldDeltaX = -deltaX / state.minimap.scale;
        const worldDeltaY = -deltaY / state.minimap.scale;
        
        // Apply the movement to pan
        state.pan.x += worldDeltaX;
        state.pan.y += worldDeltaY;
        
        updateTransform();
        updateMinimapViewport(); // Direct update for immediate response
    });
    
    // Global mouse up handler
    document.addEventListener('mouseup', (e) => {
        if (state.minimap.isDragging) {
            state.minimap.isDragging = false;
            state.minimap.wasDragging = true; // Flag to prevent click event
            
            // Don't set cursor here if space is pressed
            if (!state.isSpacePressed) {
                viewport.style.cursor = 'grab';
            }
            
            // Update viewport one final time
            updateMinimapViewport();
        }
    });
    
    // Set initial cursor
    if (!state.isSpacePressed) {
        viewport.style.cursor = 'grab';
    }
}

// Helper function to constrain pan within reasonable bounds
function constrainPan() {
    if (!state.minimap.bounds) return;
    
    // During minimap dragging, use more lenient constraints to prevent position jumps
    if (state.minimap.isDragging) {
        // Allow more freedom during minimap dragging
        const maxPanX = (state.minimap.bounds.maxX - state.minimap.bounds.minX) * state.zoom;
        const maxPanY = (state.minimap.bounds.maxY - state.minimap.bounds.minY) * state.zoom;
        
        // Very lenient constraints - only prevent extreme values
        state.pan.x = Math.max(-maxPanX * 2, Math.min(maxPanX * 2, state.pan.x));
        state.pan.y = Math.max(-maxPanY * 2, Math.min(maxPanY * 2, state.pan.y));
    } else {
        // Normal constraints when not dragging minimap
        const maxPanX = (state.minimap.bounds.maxX - state.minimap.bounds.minX) * state.zoom / 2;
        const maxPanY = (state.minimap.bounds.maxY - state.minimap.bounds.minY) * state.zoom / 2;
        
        state.pan.x = Math.max(-maxPanX, Math.min(maxPanX, state.pan.x));
        state.pan.y = Math.max(-maxPanY, Math.min(maxPanY, state.pan.y));
    }
}

// Throttled minimap update for better performance during dragging
let minimapUpdateTimeout = null;
function throttledMinimapUpdate() {
    if (minimapUpdateTimeout) return;
    
    minimapUpdateTimeout = requestAnimationFrame(() => {
        updateMinimapViewport();
        minimapUpdateTimeout = null;
    });
}

// Smooth minimap update with optional delay
function smoothMinimapUpdate(immediate = false) {
    if (immediate || !state.minimap.isDragging) {
        updateMinimapViewport();
    } else {
        throttledMinimapUpdate();
    }
}

function calculateDiagramBounds() {
    const components = document.querySelectorAll('.component');
    if (components.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    components.forEach(comp => {
        const rect = comp.getBoundingClientRect();
        const containerRect = diagramContent.getBoundingClientRect();
        
        // Get component position relative to diagram center
        const x = rect.left - containerRect.left - containerRect.width / 2;
        const y = rect.top - containerRect.top - containerRect.height / 2;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + rect.width);
        maxY = Math.max(maxY, y + rect.height);
    });
    
    // Add padding
    const padding = 100;
    state.minimap.bounds = {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding
    };
    
    // Calculate scale to fit minimap
    const minimapWidth = 184 - 16; // minimap width minus padding
    const minimapHeight = 134 - 16; // minimap height minus padding
    const diagramWidth = state.minimap.bounds.maxX - state.minimap.bounds.minX;
    const diagramHeight = state.minimap.bounds.maxY - state.minimap.bounds.minY;
    
    state.minimap.scale = Math.min(
        minimapWidth / diagramWidth,
        minimapHeight / diagramHeight
    );
}

function renderMinimapComponents() {
    const minimap = document.getElementById('minimap');
    
    // Remove existing minimap components
    const existingComponents = minimap.querySelectorAll('.minimap-component');
    existingComponents.forEach(comp => comp.remove());
    
    // Add components to minimap
    document.querySelectorAll('.component').forEach(comp => {
        const rect = comp.getBoundingClientRect();
        const containerRect = diagramContent.getBoundingClientRect();
        
        // Get component position relative to diagram center
        const x = rect.left - containerRect.left - containerRect.width / 2;
        const y = rect.top - containerRect.top - containerRect.height / 2;
        
        // Convert to minimap coordinates
        const minimapX = (x - state.minimap.bounds.minX) * state.minimap.scale + 8;
        const minimapY = (y - state.minimap.bounds.minY) * state.minimap.scale + 8;
        const minimapWidth = rect.width * state.minimap.scale;
        const minimapHeight = rect.height * state.minimap.scale;
        
        // Create minimap component
        const minimapComp = document.createElement('div');
        minimapComp.className = 'minimap-component';
        minimapComp.style.cssText = `
            position: absolute;
            left: ${minimapX}px;
            top: ${minimapY}px;
            width: ${Math.max(2, minimapWidth)}px;
            height: ${Math.max(2, minimapHeight)}px;
            background: #58a6ff;
            border-radius: 1px;
            opacity: 0.7;
            pointer-events: none;
        `;
        
        // Add layer-specific colors
        const layer = comp.closest('.layer');
        if (layer) {
            const layerId = layer.getAttribute('data-layer');
            const colors = {
                'vscode': '#58a6ff',
                'core': '#7c3aed',
                'analysis': '#10b981',
                'rendering': '#f59e0b',
                'utility': '#ef4444'
            };
            minimapComp.style.background = colors[layerId] || '#58a6ff';
        }
        
        minimap.appendChild(minimapComp);
    });
}

function updateMinimapViewport() {
    const viewport = document.getElementById('minimapViewport');
    
    if (!state.minimap.bounds) return;
    
    // Calculate what area of the diagram is currently visible
    const viewWidth = window.innerWidth / state.zoom;
    const viewHeight = window.innerHeight / state.zoom;
    
    // Current center of the view in world coordinates
    const centerX = -state.pan.x / state.zoom;
    const centerY = -state.pan.y / state.zoom;
    
    // Visible area bounds in world coordinates
    const visibleMinX = centerX - viewWidth / 2;
    const visibleMinY = centerY - viewHeight / 2;
    const visibleMaxX = centerX + viewWidth / 2;
    const visibleMaxY = centerY + viewHeight / 2;
    
    // Convert to minimap coordinates with proper scaling
    const minimapPadding = 8;
    const minimapX = (visibleMinX - state.minimap.bounds.minX) * state.minimap.scale + minimapPadding;
    const minimapY = (visibleMinY - state.minimap.bounds.minY) * state.minimap.scale + minimapPadding;
    const minimapWidth = (visibleMaxX - visibleMinX) * state.minimap.scale;
    const minimapHeight = (visibleMaxY - visibleMinY) * state.minimap.scale;
    
    // Minimap container bounds
    const minimapBounds = { width: 184, height: 134 };
    
    // Constrain viewport to minimap bounds with smooth clamping
    const minViewportSize = 8; // Minimum viewport size
    const maxX = minimapBounds.width - minimapPadding;
    const maxY = minimapBounds.height - minimapPadding;
    
    const constrainedX = Math.max(minimapPadding, Math.min(minimapX, maxX - Math.max(minViewportSize, minimapWidth)));
    const constrainedY = Math.max(minimapPadding, Math.min(minimapY, maxY - Math.max(minViewportSize, minimapHeight)));
    const constrainedWidth = Math.max(minViewportSize, Math.min(minimapWidth, maxX - constrainedX));
    const constrainedHeight = Math.max(minViewportSize, Math.min(minimapHeight, maxY - constrainedY));
    
    // Apply smooth transitions for better visual feedback
    const currentStyle = viewport.style;
    const targetLeft = constrainedX + 'px';
    const targetTop = constrainedY + 'px';
    const targetWidth = constrainedWidth + 'px';
    const targetHeight = constrainedHeight + 'px';
    
    // Remove transition during dragging for immediate response
    viewport.style.transition = state.minimap.isDragging ? 'none' : '';
    
    // Update viewport position and size
    viewport.style.left = targetLeft;
    viewport.style.top = targetTop;
    viewport.style.width = targetWidth;
    viewport.style.height = targetHeight;
    
    // Update viewport opacity based on zoom level for better visibility
    const baseOpacity = 0.6;
    const zoomFactor = Math.max(0.3, Math.min(1, 1 / state.zoom));
    const opacity = Math.max(0.2, Math.min(0.9, baseOpacity * zoomFactor));
    viewport.style.opacity = opacity;
    
    // Add visual feedback for active state
    if (state.minimap.isDragging) {
        viewport.style.borderColor = '#58a6ff';
        viewport.style.borderWidth = '2px';
    } else {
        viewport.style.borderColor = '#30363d';
        viewport.style.borderWidth = '1px';
    }
}

function updateMinimap() {
    calculateDiagramBounds();
    renderMinimapComponents();
    updateMinimapViewport();
}

// Status Bar
function updateStatusBar(e) {
    if (e) {
        const rect = diagramContent.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left - rect.width / 2) / state.zoom);
        const y = Math.round((e.clientY - rect.top - rect.height / 2) / state.zoom);
        document.getElementById('statusPosition').textContent = `Position: ${x}, ${y}`;
    }
    
    document.getElementById('statusZoom').textContent = `Zoom: ${Math.round(state.zoom * 100)}%`;
    
    // Update mode based on current state
    let mode = 'Normal';
    if (state.isDragging) mode = 'Panning';
    else if (searchBox.classList.contains('show')) mode = 'Searching';
    else if (state.selectedComponent) mode = 'Selected';
    
    document.getElementById('statusMode').textContent = `Mode: ${mode}`;
}

// Notification Function
function showNotification(message) {
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Animation Functions
function animateConnections() {
    const paths = document.querySelectorAll('.connection-path');
    paths.forEach((path, index) => {
        setTimeout(() => {
            path.classList.add('animated');
            setTimeout(() => {
                path.classList.remove('animated');
            }, 2000);
        }, index * 100);
    });
}

// Double click handling for file opening
document.addEventListener('dblclick', (e) => {
    const comp = e.target.closest('.component');
    if (comp) {
        const file = comp.getAttribute('data-file');
        showNotification(`Opening ${file} in VS Code...`);
        // In VS Code extension, this would actually open the file
    }
});

// Context Menu
document.addEventListener('contextmenu', (e) => {
    const comp = e.target.closest('.component');
    if (comp) {
        e.preventDefault();
        showContextMenu(e, comp);
    }
});

function showContextMenu(e, comp) {
    const menu = document.createElement('div');
    menu.style.cssText = `
        position: absolute;
        background: #1f2428;
        border: 1px solid #30363d;
        border-radius: 6px;
        padding: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        min-width: 200px;
    `;
    
    const actions = [
        { icon: '📂', text: 'Open File', action: () => openFile(comp) },
        { icon: '🔍', text: 'Find References', action: () => findReferences(comp) },
        { icon: '📋', text: 'Copy Component ID', action: () => copyToClipboard(comp.getAttribute('data-id')) },
        { icon: '🎯', text: 'Focus on This', action: () => focusComponent(comp) },
        { icon: '🔗', text: 'Show All Connections', action: () => showAllConnections(comp) }
    ];
    
    actions.forEach(({ icon, text, action }) => {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s;
        `;
        item.innerHTML = `<span>${icon}</span> ${text}`;
        item.onmouseover = () => item.style.background = '#30363d';
        item.onmouseout = () => item.style.background = 'transparent';
        item.onclick = () => {
            action();
            document.body.removeChild(menu);
        };
        menu.appendChild(item);
    });
    
    // Position menu
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    
    // Adjust if off screen
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
        menu.style.left = e.pageX - menuRect.width + 'px';
    }
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = e.pageY - menuRect.height + 'px';
    }
    
    // Close menu on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            if (document.body.contains(menu)) {
                document.body.removeChild(menu);
            }
            document.removeEventListener('click', closeMenu);
        });
    }, 0);
}

// Context Menu Actions
function openFile(comp) {
    const file = comp.getAttribute('data-file');
    showNotification(`Opening ${file}...`);
}

function findReferences(comp) {
    const id = comp.getAttribute('data-id');
    showNotification(`Finding references for ${id}...`);
    selectComponent(comp);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied to clipboard!');
    });
}

function focusComponent(comp) {
    selectComponent(comp);
    
    // Center the component in view
    const rect = comp.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const viewCenterX = window.innerWidth / 2;
    const viewCenterY = window.innerHeight / 2;
    
    state.pan.x -= (centerX - viewCenterX) / state.zoom;
    state.pan.y -= (centerY - viewCenterY) / state.zoom;
    
    updateTransform();
    updateMinimap();
}

function showAllConnections(comp) {
    const id = comp.getAttribute('data-id');
    
    // Highlight all connections
    document.querySelectorAll('.connection-path').forEach(path => {
        path.classList.remove('active');
    });
    
    state.connections.forEach(conn => {
        if (conn.from === id || conn.to === id) {
            const path = document.querySelector(`[data-connection="${conn.from}-${conn.to}"] path`);
            if (path) {
                path.classList.add('active');
                
                // Also highlight connected components
                const otherId = conn.from === id ? conn.to : conn.from;
                const otherComp = document.querySelector(`[data-id="${otherId}"]`);
                if (otherComp) {
                    otherComp.style.boxShadow = '0 0 0 2px #58a6ff';
                    setTimeout(() => {
                        otherComp.style.boxShadow = '';
                    }, 3000);
                }
            }
        }
    });
}

// Initialize on load
window.addEventListener('load', () => {
    init();
    
    // Show welcome message
    setTimeout(() => {
        showNotification('Welcome to CodeSync Enhanced! Press "A" for advanced controls.');
    }, 500);
    
    // Demo animation
    setTimeout(() => {
        animateConnections();
    }, 1000);
});


// Enhanced features code (simplified version integrated)
class DiagramEnhancements {
    constructor() {
        this.filters = {
            layers: new Set(['vscode', 'core', 'analysis', 'rendering', 'utility']),
            connectionTypes: new Set(['control', 'data', 'event', 'bidirectional'])
        };
        
        this.metrics = {
            componentComplexity: new Map(),
            connectionDensity: new Map()
        };
        
        this.init();
    }
    
    init() {
        this.calculateMetrics();
        this.setupFilterListeners();
        this.updateMetricsDisplay();
    }
    
    calculateMetrics() {
        document.querySelectorAll('.component').forEach(comp => {
            const id = comp.getAttribute('data-id');
            const methods = comp.querySelectorAll('.component-item').length;
            const connections = state.connections.filter(c => 
                c.from === id || c.to === id
            ).length;
            
            const complexity = methods * 0.6 + connections * 0.4;
            this.metrics.componentComplexity.set(id, complexity);
        });
    }
    
    setupFilterListeners() {
        // Layer filters
        document.querySelectorAll('[data-filter-layer]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const layer = e.target.getAttribute('data-filter-layer');
                if (e.target.checked) {
                    this.filters.layers.add(layer);
                } else {
                    this.filters.layers.delete(layer);
                }
                this.applyFilters();
            });
        });
        
        // Connection filters
        document.querySelectorAll('[data-filter-connection]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const type = e.target.getAttribute('data-filter-connection');
                if (e.target.checked) {
                    this.filters.connectionTypes.add(type);
                } else {
                    this.filters.connectionTypes.delete(type);
                }
                this.applyFilters();
            });
        });
    }
    
    applyFilters() {
        // Filter layers
        document.querySelectorAll('.layer').forEach(layer => {
            const layerId = layer.getAttribute('data-layer');
            layer.style.display = this.filters.layers.has(layerId) ? 'block' : 'none';
        });
        
        // Filter connections
        document.querySelectorAll('.connection-path').forEach(path => {
            const type = path.getAttribute('data-type');
            const shouldShow = this.filters.connectionTypes.has(type);
            path.parentElement.style.display = shouldShow ? 'block' : 'none';
        });
        
        // Redraw connections
        setTimeout(() => drawConnections(), 100);
    }
    
    updateMetricsDisplay() {
        const display = document.getElementById('metricsDisplay');
        
        const topComponents = Array.from(this.metrics.componentComplexity.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        display.innerHTML = `
            <div class="metric-item">
                <span>Total Components:</span>
                <span class="metric-value">25</span>
            </div>
            <div class="metric-item">
                <span>Total Connections:</span>
                <span class="metric-value">18</span>
            </div>
            <div style="margin-top: 12px; font-size: 12px; color: #8b949e;">
                Top Complex Components:
            </div>
            ${topComponents.map(([id, complexity]) => {
                const level = complexity > 10 ? 'high' : complexity > 5 ? 'medium' : 'low';
                return `
                    <div class="metric-item">
                        <span>${id}</span>
                        <span class="metric-value">
                            ${complexity.toFixed(1)}
                            <span class="complexity-indicator complexity-${level}"></span>
                        </span>
                    </div>
                `;
            }).join('')}
        `;
    }
    
    findCircularDependencies() {
        const visited = new Set();
        const recursionStack = new Set();
        const circles = [];
        
        const dfs = (nodeId, path = []) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);
            
            const connections = state.connections.filter(c => c.from === nodeId);
            
            for (const conn of connections) {
                if (!visited.has(conn.to)) {
                    dfs(conn.to, [...path]);
                } else if (recursionStack.has(conn.to)) {
                    const cycleStart = path.indexOf(conn.to);
                    if (cycleStart !== -1) {
                        circles.push([...path.slice(cycleStart), conn.to]);
                    }
                }
            }
            
            recursionStack.delete(nodeId);
        };
        
        document.querySelectorAll('.component').forEach(comp => {
            const id = comp.getAttribute('data-id');
            if (!visited.has(id)) {
                dfs(id);
            }
        });
        
        if (circles.length > 0) {
            circles.forEach(circle => {
                circle.forEach(nodeId => {
                    const comp = document.querySelector(`[data-id="${nodeId}"]`);
                    if (comp) {
                        comp.style.border = '2px solid #ff6b6b';
                    }
                });
            });
            showNotification(`Found ${circles.length} circular dependencies!`);
        } else {
            showNotification('No circular dependencies found!');
        }
    }
    
    analyzeCriticalPath() {
        const entryPoints = ['extension', 'commands'];
        const paths = [];
        
        const findPaths = (nodeId, path = [], visited = new Set()) => {
            if (visited.has(nodeId)) return;
            
            visited.add(nodeId);
            path.push(nodeId);
            
            const connections = state.connections.filter(c => c.from === nodeId);
            
            if (connections.length === 0) {
                paths.push([...path]);
            } else {
                connections.forEach(conn => {
                    findPaths(conn.to, [...path], new Set(visited));
                });
            }
        };
        
        entryPoints.forEach(entry => findPaths(entry));
        
        const criticalPath = paths.reduce((longest, current) => 
            current.length > longest.length ? current : longest, []
        );
        
        // Highlight critical path
        criticalPath.forEach((nodeId, index) => {
            const comp = document.querySelector(`[data-id="${nodeId}"]`);
            if (comp) {
                comp.style.boxShadow = `0 0 0 3px #51cf66`;
            }
        });
        
        showNotification(`Critical path: ${criticalPath.length} components`);
    }
    
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            overview: {
                totalComponents: 25,
                totalConnections: 18,
                layers: 5
            },
            complexityAnalysis: {
                average: 0,
                highest: null
            }
        };
        
        const complexities = Array.from(this.metrics.componentComplexity.values());
        report.complexityAnalysis.average = (
            complexities.reduce((a, b) => a + b, 0) / complexities.length
        ).toFixed(2);
        
        const sorted = Array.from(this.metrics.componentComplexity.entries())
            .sort((a, b) => b[1] - a[1]);
        
        report.complexityAnalysis.highest = {
            component: sorted[0][0],
            value: sorted[0][1].toFixed(2)
        };
        
        const content = JSON.stringify(report, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `codesync-analysis-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Report downloaded successfully!');
    }
    
    plugins = {
        heatmap: {
            enable: () => {
                document.querySelectorAll('.component').forEach(comp => {
                    const id = comp.getAttribute('data-id');
                    const complexity = this.metrics.componentComplexity.get(id) || 0;
                    
                    const hue = 120 - (complexity * 10);
                    const saturation = 70;
                    const lightness = 50;
                    
                    comp.style.backgroundColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`;
                });
                showNotification('Heatmap enabled!');
            },
            disable: () => {
                document.querySelectorAll('.component').forEach(comp => {
                    comp.style.backgroundColor = '';
                });
                showNotification('Heatmap disabled!');
            }
        }
    };
}

// Initialize enhancements
let diagramEnhancements;
window.addEventListener('load', () => {
    setTimeout(() => {
        diagramEnhancements = new DiagramEnhancements();
        window.diagramEnhancements = diagramEnhancements;
    }, 100);
});
