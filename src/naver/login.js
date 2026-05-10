const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 패키징(.exe) 시 __dirname이 asar 내부라 쓰기 불가.
// portable 빌드는 PORTABLE_EXECUTABLE_DIR이 원본 .exe 위치를 가리킨다.
const PACKAGED = __dirname.includes('app.asar');
function appRoot() {
  if (!PACKAGED) return path.join(__dirname, '..', '..');
  return process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
}
const SESSION_DIR = path.join(appRoot(), 'session');
const NAVER_LOGIN_URL = 'https://nid.naver.com/nidlogin.login';
const NAVER_HOME_URL = 'https://www.naver.com';

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
}

async function isLoggedIn(page) {
  try {
    await page.goto(NAVER_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const loggedIn = await page.evaluate(() => {
      return Boolean(document.querySelector('a[href*="logout"]')) ||
             Boolean(document.querySelector('.MyView-module__my_menu'));
    });
    return loggedIn;
  } catch {
    return false;
  }
}

async function fillCredentials(page, naverId, password) {
  console.log('[login] waiting for #id selector...');
  await page.waitForSelector('#id', { timeout: 10000 });
  console.log('[login] #id found, current url:', page.url());

  // page.fill로 직접 값 주입 — 키 입력 자동화 탐지 회피
  await page.fill('#id', naverId);
  await page.fill('#pw', password);
  console.log('[login] credentials filled, looking for login button...');

  // 셀렉터 우선순위: id="log.login" → .btn_login → button[type=submit]
  const buttonSelectors = ['#log\\.login', '.btn_login', 'button[type="submit"]'];
  let clicked = false;
  for (const sel of buttonSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      console.log('[login] clicking selector:', sel);
      await btn.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    console.log('[login] no button matched, falling back to Enter key');
    await page.press('#pw', 'Enter');
  }
}

async function waitForLoginResolution(page, timeoutMs = 180000) {
  // 셋 중 하나가 나올 때까지 대기:
  //  1) naver 홈/마이로 리다이렉트 → 성공
  //  2) 캡차/2FA/기기등록 페이지 → 사용자 수동 처리 필요 (계속 대기)
  //  3) 에러 메시지
  const start = Date.now();
  let lastLoggedUrl = '';
  while (Date.now() - start < timeoutMs) {
    const url = page.url();
    if (url !== lastLoggedUrl) {
      console.log('[login] url changed:', url);
      lastLoggedUrl = url;
    }
    // nid.naver.com 도메인을 벗어나면 로그인 흐름 종료로 간주
    if (!url.includes('nid.naver.com') && url.includes('naver.com')) {
      return { status: 'success' };
    }
    const errorText = await page.evaluate(() => {
      const el = document.querySelector('.error_message, #err_capslock, .login_error_txt, .err_msg');
      return el && el.offsetParent !== null ? el.textContent.trim() : null;
    }).catch(() => null);
    if (errorText && errorText.length > 0) {
      console.log('[login] error text detected:', errorText);
      return { status: 'error', message: errorText };
    }
    await page.waitForTimeout(1500);
  }
  return { status: 'timeout' };
}

/**
 * 네이버에 로그인하고, 이후 단계에서 재사용 가능한 context와 page를 반환한다.
 * persistent context를 사용해 세션을 디스크에 보존하므로 다음 실행에서 캡차 빈도가 줄어든다.
 *
 * 캡차/2FA가 나오면 브라우저 창을 닫지 않고 사용자가 직접 처리하도록 둔다.
 */
async function loginToNaver({ naverId, password, onProgress = () => {} }) {
  ensureSessionDir();

  onProgress('브라우저 시작 중...');
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'ko-KR',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();

  onProgress('기존 세션 확인 중...');
  if (await isLoggedIn(page)) {
    onProgress('이미 로그인된 세션 발견.');
    return { context, page };
  }

  onProgress('로그인 페이지 이동...');
  await page.goto(NAVER_LOGIN_URL, { waitUntil: 'domcontentloaded' });

  onProgress('자격증명 입력...');
  await fillCredentials(page, naverId, password);

  onProgress('로그인 결과 대기 중 (캡차/2FA가 뜨면 직접 처리하세요, 최대 3분)...');
  const result = await waitForLoginResolution(page);

  if (result.status === 'error') {
    await context.close();
    throw new Error(`로그인 실패: ${result.message}`);
  }
  if (result.status === 'timeout') {
    await context.close();
    throw new Error('로그인 시간 초과 (3분). 캡차/2FA를 처리하지 못했거나 응답이 없습니다.');
  }

  onProgress('로그인 성공.');
  return { context, page };
}

module.exports = { loginToNaver };
