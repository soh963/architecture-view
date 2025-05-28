const path = require('path');

// Simple test runner that validates basic functionality
async function runTests() {
    console.log('Running extension tests...');
    
    const tests = [
        {
            name: 'Extension compiles successfully',
            test: () => {
                const fs = require('fs');
                const extensionPath = path.join(__dirname, '..', 'out', 'extension.js');
                if (!fs.existsSync(extensionPath)) {
                    throw new Error('Compiled extension not found');
                }
            }
        },
        {
            name: 'Package.json is valid',
            test: () => {
                const packageJson = require('../package.json');
                if (!packageJson.name || !packageJson.version) {
                    throw new Error('Invalid package.json');
                }
            }
        },
        {
            name: 'Media files exist',
            test: () => {
                const fs = require('fs');
                const files = ['diagram.js', 'diagram.css'];
                const mediaPath = path.join(__dirname, '..', 'media');
                
                files.forEach(file => {
                    const filePath = path.join(mediaPath, file);
                    if (!fs.existsSync(filePath)) {
                        throw new Error(`Missing media file: ${file}`);
                    }
                });
            }
        },
        {
            name: 'Export formats are correct',
            test: () => {
                const fs = require('fs');
                const diagramJs = fs.readFileSync(
                    path.join(__dirname, '..', 'media', 'diagram.js'), 
                    'utf8'
                );
                
                // Check that SVG is removed and PNG, JSON, HTML exist
                if (diagramJs.includes("value=\"svg\"")) {
                    throw new Error('SVG export option should be removed');
                }
                
                const requiredFormats = ['png', 'json', 'html'];
                requiredFormats.forEach(format => {
                    if (!diagramJs.includes(`value="${format}"`)) {
                        throw new Error(`Missing export format: ${format}`);
                    }
                });
            }
        },
        {
            name: 'Critical functions exist',
            test: () => {
                const fs = require('fs');
                const diagramJs = fs.readFileSync(
                    path.join(__dirname, '..', 'media', 'diagram.js'), 
                    'utf8'
                );
                
                const requiredFunctions = [
                    'fitToScreen',
                    'zoomAtPoint',
                    'updateMinimap',
                    'performSearch',
                    'exportAsPNG',
                    'exportAsHTML',
                    'exportAsJSON'
                ];
                
                requiredFunctions.forEach(func => {
                    if (!diagramJs.includes(`function ${func}`)) {
                        throw new Error(`Missing required function: ${func}`);
                    }
                });
            }
        }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const testCase of tests) {
        try {
            testCase.test();
            console.log(`✓ ${testCase.name}`);
            passed++;
        } catch (error) {
            console.error(`✗ ${testCase.name}: ${error.message}`);
            failed++;
        }
    }
    
    console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});