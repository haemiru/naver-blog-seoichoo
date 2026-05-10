# naver-blog-seoichoo

네이버 블로그 서로이웃 자동 신청 도구. **본인 계정·하루 5~20건 소량 테스트 용도**.

## 경고

네이버는 자동화 도구로 로그인/이웃추가하는 행위를 약관으로 금지합니다. 적발 시 계정 정지될 수 있습니다. 본인 책임 하에 사용하세요.

## 동작 흐름

1. ID/PW + 이웃추가 수 입력
2. Playwright로 네이버 로그인 (캡차는 사용자가 직접 처리)
3. 내 블로그 최근 글 2~3개 본문 스크래핑
4. Claude Haiku로 키워드 5개 추출
5. 키워드로 다른 블로거 검색 → 대상자 목록 표시
6. 한 명씩 서로이웃 신청 (인사말 자동 생성, 30~90초 랜덤 딜레이)
7. 결과 리포트

## 설치 (개발)

```bash
npm install
npx playwright install chromium
cp .env.example .env   # ANTHROPIC_API_KEY 채우기
npm start
```

## .exe 빌드 (배포)

Windows 개발자 모드를 먼저 켜야 합니다 (electron-builder의 mac dylib 심볼릭 링크 추출 때문).

```bash
npm run dist             # portable .exe → dist/naver-blog-seoichoo-<ver>.exe
npm run dist:installer   # NSIS 설치 파일 (선택)
```

**.exe 사용 시 주의**:
- `.exe`와 같은 폴더에 `.env` 파일을 두어야 ANTHROPIC_API_KEY가 로드됩니다
- 실행 시 같은 폴더에 `session/`, `logs/`가 자동 생성됩니다 (각각 로그인 세션, 결과·디버그 스크린샷)
- Playwright Chromium은 번들되지 않습니다. 새 PC라면 `npx playwright install chromium` 한 번 실행 필요

## 스택

- Electron 33 (데스크톱 GUI)
- Playwright (Chromium 자동화, persistent context로 세션 유지)
- Claude Haiku (`@anthropic-ai/sdk`)
