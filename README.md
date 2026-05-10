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

## 설치

```bash
npm install
npx playwright install chromium
cp .env.example .env   # ANTHROPIC_API_KEY 채우기
npm start
```

## 스택

- Electron 33 (데스크톱 GUI)
- Playwright (Chromium 자동화, persistent context로 세션 유지)
- Claude Haiku (`@anthropic-ai/sdk`)
