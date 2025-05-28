# CodeSync Diagram - Architecture View 개발 가이드

## 📋 목차
1. [프로젝트 구조](#프로젝트-구조)
2. [주요 기능](#주요-기능)
3. [개발 환경 설정](#개발-환경-설정)
4. [아키텍처](#아키텍처)
5. [에러 처리 가이드](#에러-처리-가이드)
6. [테스트 가이드](#테스트-가이드)
7. [빌드 및 배포](#빌드-및-배포)
8. [문제 해결](#문제-해결)

## 프로젝트 구조

```
architecture-view/
├── extension/                    # VS Code 확장 프로그램 코드
│   ├── src/                     # TypeScript 소스 코드
│   │   ├── extension.ts        # 확장 프로그램 진입점
│   │   ├── analyzers/          # 프로젝트 분석 모듈
│   │   │   └── projectAnalyzer.ts  # 다중 언어 지원 분석기
│   │   ├── services/           # 서비스 레이어
│   │   │   ├── diagramService.ts   # 다이어그램 생성 서비스
│   │   │   └── layerService.ts     # 레이어 관리 서비스
│   │   ├── webview/            # 웹뷰 관련 코드
│   │   │   └── webviewProvider.ts  # 웹뷰 HTML 생성
│   │   └── types.ts            # TypeScript 타입 정의
│   ├── media/                  # 웹뷰 리소스
│   │   ├── diagram.js         # 다이어그램 렌더링 로직
│   │   └── diagram.css        # 스타일시트
│   └── test/                  # 테스트 파일
├── .github/workflows/         # GitHub Actions CI/CD
└── docs/                      # 문서

```

## 주요 기능

### 1. 다중 언어 지원 (30+ 언어)
- **지원 언어**: JavaScript, TypeScript, Python, PHP, Java, C++, Go, Rust 등
- **파일 확장자**: `.js`, `.ts`, `.py`, `.php`, `.java`, `.cpp`, `.go`, `.rs` 등
- **데이터베이스 연결**: SQL 쿼리 패턴 감지

### 2. 아키텍처 시각화
- **레이어 기반 구조**: VS Code API, Core, Analysis, Rendering, Utility, Database
- **연결선 타입**: Import, Export, Inheritance, Database, Include, Script, Stylesheet
- **실시간 업데이트**: 파일 변경 시 자동 갱신

### 3. 고급 기능
- **원형 의존성 감지**: DFS 알고리즘으로 순환 참조 찾기
- **의존성 해결**: 4가지 리팩토링 전략 제공
- **검색 기능**: 컴포넌트, 함수, 변수 검색
- **미니맵**: 전체 구조 한눈에 보기
- **내보내기**: PNG, JSON, HTML 형식

### 4. UI/UX 개선사항
- **툴팁**: 마우스 바로 위에 표시
- **연결선**: 정확한 엣지 기반 연결
- **반응형**: 사이드바 토글 시 다이어그램 확장
- **애니메이션**: 부드러운 전환 효과

## 개발 환경 설정

### 1. 필수 요구사항
```bash
- Node.js 18.x 이상
- npm 또는 yarn
- VS Code 1.74.0 이상
```

### 2. 초기 설정
```bash
# 저장소 클론
git clone https://github.com/codesync/architecture-view.git
cd architecture-view/extension

# 의존성 설치
npm install

# 개발 모드 실행
npm run watch
```

### 3. VS Code에서 디버깅
1. VS Code에서 프로젝트 열기
2. F5 키를 눌러 Extension Development Host 실행
3. 새 VS Code 창에서 확장 프로그램 테스트

## 아키텍처

### 1. 분석 흐름
```typescript
프로젝트 폴더 선택
    ↓
ProjectAnalyzer.analyze()
    ↓
파일 시스템 순회 & 의존성 추출
    ↓
LayerService.assignLayers()
    ↓
DiagramService.generateDiagram()
    ↓
WebviewProvider.createWebview()
    ↓
diagram.js 렌더링
```

### 2. 의존성 추출 방식

#### JavaScript/TypeScript
```typescript
// Import 패턴
import { Component } from './component';
const module = require('./module');

// Export 패턴
export class MyClass {}
module.exports = function() {};
```

#### PHP
```php
// Include 패턴
require_once 'config.php';
include 'helpers.php';
use App\Models\User;

// 클래스 정의
class UserController extends Controller {}
```

#### Python
```python
# Import 패턴
import os
from datetime import datetime
from .models import User

# 클래스 정의
class UserService:
    pass
```

### 3. 데이터베이스 연결 감지
```typescript
// 패턴 매칭
const dbPatterns = [
    /\b(mysql|postgres|mongodb|redis)\.connect/,
    /new\s+(MongoClient|Pool|Connection)/,
    /\b(SELECT|INSERT|UPDATE|DELETE)\s+/i
];
```

## 에러 처리 가이드

### 1. 에러 로깅
```typescript
// 에러 로거 사용
private logError(error: Error, context: string): void {
    const errorInfo = {
        timestamp: new Date().toISOString(),
        context,
        message: error.message,
        stack: error.stack,
        // 추가 정보
        projectPath: this.workspacePath,
        nodeVersion: process.version
    };
    
    console.error('[CodeSync Error]', JSON.stringify(errorInfo, null, 2));
    
    // VS Code 출력 채널에 기록
    this.outputChannel.appendLine(`[ERROR] ${context}: ${error.message}`);
}
```

### 2. 일반적인 에러 상황

#### 파일 읽기 실패
```typescript
try {
    const content = await fs.readFile(filePath, 'utf-8');
} catch (error) {
    this.logError(error, `Failed to read file: ${filePath}`);
    // 빈 의존성 반환 (분석 계속)
    return { imports: [], exports: [] };
}
```

#### 순환 참조 감지
```typescript
if (recursionStack.has(nodeId)) {
    console.warn(`Circular dependency detected: ${path.join(' → ')}`);
    // 순환 참조 기록 후 계속 진행
}
```

#### 웹뷰 생성 실패
```typescript
try {
    panel.webview.html = this.getWebviewContent(panel.webview);
} catch (error) {
    this.logError(error, 'Failed to create webview content');
    vscode.window.showErrorMessage('Failed to create diagram view');
}
```

### 3. 에러 복구 전략
- **Graceful Degradation**: 일부 기능 실패 시 나머지 기능은 정상 작동
- **기본값 사용**: 분석 실패 시 기본 구조 표시
- **사용자 알림**: 중요한 에러만 사용자에게 표시

## 테스트 가이드

### 1. 단위 테스트
```bash
# 테스트 실행
npm test

# 감시 모드
npm run test:watch

# 커버리지 확인
npm run test:coverage
```

### 2. 통합 테스트
```typescript
// test/integration/analyzer.test.ts
describe('ProjectAnalyzer', () => {
    it('should analyze JavaScript project', async () => {
        const result = await analyzer.analyze(testProjectPath);
        expect(result.files).toHaveLength(10);
        expect(result.dependencies).toBeDefined();
    });
});
```

### 3. E2E 테스트
- Extension Development Host에서 수동 테스트
- 주요 시나리오:
  1. 프로젝트 분석 실행
  2. 다이어그램 상호작용
  3. 검색 기능
  4. 내보내기 기능

## 빌드 및 배포

### 1. 자동 빌드
```bash
# 파일 변경 감지 & 자동 빌드
npm run watch:auto

# CI 파이프라인 실행
npm run ci
```

### 2. 프로덕션 빌드
```bash
# 전체 검증 후 빌드
npm run build:prod

# VSIX 패키지 생성
npm run package
```

### 3. 릴리스 프로세스
```bash
# 버전 업데이트 & 패키지 & 배포
npm run release
```

### 4. GitHub Actions CI/CD
- Push/PR 시 자동 테스트
- main 브랜치에 `[release]` 커밋 시 자동 릴리스
- 아티팩트 자동 업로드

## 문제 해결

### 1. 일반적인 문제

#### "Cannot find module" 에러
```bash
# node_modules 재설치
rm -rf node_modules package-lock.json
npm install
```

#### 웹뷰가 표시되지 않음
- VS Code 개발자 도구 확인 (Help > Toggle Developer Tools)
- CSP(Content Security Policy) 설정 확인
- 리소스 경로 확인

#### 다이어그램이 느림
- 대용량 프로젝트의 경우 파일 수 제한
- 불필요한 의존성 필터링
- 웹워커 사용 고려

### 2. 디버깅 팁

#### VS Code 출력 채널
```typescript
// 출력 채널 생성
const outputChannel = vscode.window.createOutputChannel('CodeSync Diagram');
outputChannel.appendLine('Debug info...');
```

#### 웹뷰 디버깅
```javascript
// diagram.js에서
console.log('State:', state);
vscode.postMessage({ command: 'debug', data: state });
```

### 3. 성능 최적화

#### 대용량 프로젝트
- 점진적 로딩 구현
- 가상 스크롤 사용
- 레이어별 렌더링 최적화

#### 메모리 사용
- WeakMap 사용으로 메모리 누수 방지
- 불필요한 데이터 정리
- 이벤트 리스너 제거

## 기여 가이드

### 1. 코드 스타일
- ESLint 규칙 준수
- TypeScript strict 모드
- 의미 있는 변수명 사용

### 2. 커밋 메시지
```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 업데이트
style: 코드 스타일 변경
refactor: 코드 리팩토링
test: 테스트 추가/수정
chore: 빌드 프로세스 수정
```

### 3. PR 체크리스트
- [ ] 테스트 통과
- [ ] 린트 검사 통과
- [ ] 문서 업데이트
- [ ] 변경 로그 작성

## 참고 자료

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Webpack Documentation](https://webpack.js.org/concepts/)
- [GitHub Actions](https://docs.github.com/en/actions)

---

이 가이드는 지속적으로 업데이트됩니다. 질문이나 제안사항은 이슈를 생성해주세요.