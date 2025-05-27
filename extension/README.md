# CodeSync Diagram - Architecture View

프로젝트의 전체 구조를 시각적으로 분석하고 탐색할 수 있는 Cursor AI 확장 프로그램입니다.

## 기능

- **프로젝트 분석**: 모든 소스 코드 파일의 구조와 의존성을 자동으로 분석
- **인터랙티브 다이어그램**: D3.js 기반의 동적 시각화
- **레이어별 구조화**: Presentation, Business, Data, Utils, Config 레이어로 자동 분류
- **실시간 네비게이션**: 다이어그램 노드 클릭 시 해당 파일로 즉시 이동
- **검색 및 필터링**: 파일명 검색, 레이어별 필터링 지원
- **줌/팬 컨트롤**: 대규모 프로젝트도 쉽게 탐색

## 사용법

1. 파일 탐색기나 에디터에서 마우스 우클릭
2. "프로젝트 분석" 메뉴 선택
3. 생성된 다이어그램에서:
   - 노드 클릭: 해당 파일 열기
   - 드래그: 노드 위치 이동
   - 마우스 휠: 줌 인/아웃
   - 검색창: 파일 검색
   - 체크박스: 레이어 필터링

## 설치

1. `.vsix` 파일 다운로드
2. VS Code/Cursor에서 Extensions 뷰 열기
3. "..." 메뉴에서 "Install from VSIX..." 선택
4. 다운로드한 파일 선택

## 지원 파일 형식

- JavaScript/TypeScript (.js, .jsx, .ts, .tsx)
- Python (.py)
- Java (.java)
- C++ (.cpp)
- C# (.cs)
- Go (.go)
- Rust (.rs)
- Vue (.vue)
- HTML/CSS (.html, .css, .scss)

## 시스템 요구사항

- VS Code/Cursor 1.100.0 이상
- Node.js 14.0 이상

## 라이선스

MIT License