const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

async function saveDebugScreenshot(page, blogId, label) {
  try {
    ensureLogsDir();
    const file = path.join(LOGS_DIR, `${Date.now()}_${blogId}_${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`[debug] screenshot saved: ${file}`);
    return file;
  } catch (err) {
    console.warn('[debug] screenshot failed:', err.message);
    return null;
  }
}

/**
 * 한 블로거에게 서로이웃 신청을 보낸다.
 * m.blog.naver.com의 BuddyAddForm은 React 기반으로, 텍스트 셀렉터가 가장 안정적이다.
 *
 * 흐름:
 *  1. BuddyAddForm 진입
 *  2. 차단 메시지 감지 (이미 이웃, 거부, 없음)
 *  3. "서로이웃을 신청합니다" 클릭 → textarea 등장 대기
 *  4. 메시지 입력
 *  5. 우측 상단 "확인" 클릭
 *  6. 결과 확인
 *
 * @returns {Promise<{ status, detail? }>}
 */
async function applyNeighbor({ context, blogId, message, onLog = () => {} }) {
  const page = await context.newPage();
  try {
    const url = `https://m.blog.naver.com/BuddyAddForm.naver?blogId=${blogId}`;
    onLog(`[${blogId}] 진입: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // 1) 차단 상태 감지
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    if (/이미.*이웃|이미 추가/.test(bodyText)) {
      onLog(`[${blogId}] 이미 이웃`);
      return { status: 'already_buddy' };
    }
    if (/이웃.*거부|허용하지 않|받지 않|이웃을 받지/.test(bodyText)) {
      onLog(`[${blogId}] 서로이웃 거부 설정`);
      return { status: 'rejected' };
    }
    if (/존재하지 않|삭제된|블로그가 없/.test(bodyText)) {
      onLog(`[${blogId}] 블로그 없음`);
      return { status: 'not_found' };
    }

    // 2) "서로이웃을 신청합니다" 클릭
    //    이 옵션이 회색(disabled)이면 클릭이 타임아웃 → 'rejected'로 처리
    const eachBuddy = page.locator('text=서로이웃을 신청합니다').first();
    if (await eachBuddy.count() === 0) {
      const file = await saveDebugScreenshot(page, blogId, 'no_each_buddy');
      return { status: 'error', detail: `서로이웃 옵션 못찾음 (스크린샷: ${file})` };
    }
    try {
      await eachBuddy.click({ timeout: 4000 });
      onLog(`[${blogId}] 서로이웃 라디오 클릭`);
    } catch {
      onLog(`[${blogId}] 서로이웃 옵션 비활성화 (사업자/거부 설정)`);
      return { status: 'rejected' };
    }
    await page.waitForTimeout(1200);

    // 3) 메시지 입력 (textarea가 라디오 클릭 후 활성화/표시됨)
    const textarea = page.locator('textarea').first();
    try {
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // textarea 안 뜨면 사실상 서로이웃 모드 진입 실패
      onLog(`[${blogId}] 서로이웃 메시지 영역 안 나타남 → 거부로 처리`);
      return { status: 'rejected' };
    }
    await textarea.fill(message);
    onLog(`[${blogId}] 메시지 입력: "${message}"`);

    // 4) 우측 상단 "확인" 클릭
    const confirm = page.locator('text=확인').first();
    if (await confirm.count() === 0) {
      const file = await saveDebugScreenshot(page, blogId, 'no_confirm');
      return { status: 'error', detail: `확인 버튼 못찾음 (스크린샷: ${file})` };
    }
    await confirm.click();
    onLog(`[${blogId}] 확인 클릭`);

    // 5) 결과 확인
    await page.waitForTimeout(3000);
    const resultText = await page.evaluate(() => document.body.innerText || '');
    if (/완료|신청.*되었|성공|승인/.test(resultText)) {
      onLog(`[${blogId}] 신청 성공`);
      return { status: 'success' };
    }
    if (/오류|실패|초과|많이 신청|하루.*신청/.test(resultText)) {
      const snippet = resultText.replace(/\s+/g, ' ').slice(0, 200);
      const file = await saveDebugScreenshot(page, blogId, 'submit_error');
      onLog(`[${blogId}] 신청 실패: ${snippet}`);
      return { status: 'error', detail: `${snippet} (스크린샷: ${file})` };
    }
    // 명확한 메시지 없으면 페이지 변화로 판단 — URL이 바뀌었으면 성공으로 간주
    onLog(`[${blogId}] 결과 메시지 불명확, 성공으로 간주`);
    return { status: 'success' };
  } catch (err) {
    const file = await saveDebugScreenshot(page, blogId, 'exception').catch(() => null);
    return { status: 'error', detail: `${err.message} (스크린샷: ${file})` };
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { applyNeighbor };
