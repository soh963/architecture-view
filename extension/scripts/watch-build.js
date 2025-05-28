#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting automatic build on test success...\n');

let isBuilding = false;
let pendingBuild = false;

function runTests() {
    return new Promise((resolve, reject) => {
        console.log('🧪 Running tests...');
        const testProcess = spawn('npm', ['test'], {
            stdio: 'inherit',
            shell: true
        });

        testProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Tests passed!');
                resolve();
            } else {
                console.log('❌ Tests failed!');
                reject(new Error('Tests failed'));
            }
        });
    });
}

function runBuild() {
    return new Promise((resolve, reject) => {
        console.log('🔨 Building extension...');
        const buildProcess = spawn('npm', ['run', 'compile'], {
            stdio: 'inherit',
            shell: true
        });

        buildProcess.on('close', (code) => {
            if (code === 0) {
                console.log('✅ Build successful!');
                console.log(`📦 Extension built at: ${new Date().toLocaleTimeString()}`);
                resolve();
            } else {
                console.log('❌ Build failed!');
                reject(new Error('Build failed'));
            }
        });
    });
}

async function watchAndBuild() {
    if (isBuilding) {
        pendingBuild = true;
        return;
    }

    isBuilding = true;
    
    try {
        await runTests();
        await runBuild();
        
        // 빌드 성공 시 알림
        if (process.platform === 'darwin') {
            spawn('osascript', ['-e', 'display notification "Build completed successfully!" with title "CodeSync Diagram"']);
        } else if (process.platform === 'win32') {
            spawn('msg', ['*', '/TIME:5', 'CodeSync Diagram: Build completed successfully!']);
        }
    } catch (error) {
        console.error('🚨 Build process failed:', error.message);
    } finally {
        isBuilding = false;
        
        if (pendingBuild) {
            pendingBuild = false;
            setTimeout(watchAndBuild, 1000);
        }
    }
}

// 파일 변경 감지
const srcDir = path.join(__dirname, '..', 'src');
const mediaDir = path.join(__dirname, '..', 'media');

console.log('👀 Watching for file changes...\n');

// 초기 빌드
watchAndBuild();

// 파일 변경 감지
fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.ts')) {
        console.log(`\n📝 File changed: ${filename}`);
        watchAndBuild();
    }
});

fs.watch(mediaDir, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith('.js') || filename.endsWith('.css'))) {
        console.log(`\n📝 File changed: ${filename}`);
        watchAndBuild();
    }
});

// Ctrl+C 처리
process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping watch mode...');
    process.exit(0);
});

console.log('Press Ctrl+C to stop\n');