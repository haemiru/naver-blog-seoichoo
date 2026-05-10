const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, ipcMain } = require('electron');
const { loginToNaver } = require('../src/naver/login');
const { getRecentPosts } = require('../src/naver/myBlog');
const { extractKeywords } = require('../src/ai/extractKeywords');
const { findCandidateBloggers } = require('../src/naver/search');
const { applyNeighbor } = require('../src/naver/neighbor');
const { generateGreeting } = require('../src/ai/generateGreeting');
const { sleep, randomDelaySeconds } = require('../src/utils/delay');

let mainWindow;
let activeContext = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 800,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function sendProgress(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('progress', message);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (activeContext) {
    try { await activeContext.close(); } catch {}
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

let discoveryState = null; // { naverId, posts, keywords, candidates }

ipcMain.handle('start-discovery', async (_event, payload) => {
  const { naverId, password, neighborCount } = payload;
  try {
    const { context } = await loginToNaver({ naverId, password, onProgress: sendProgress });
    activeContext = context;

    const posts = await getRecentPosts({ context, naverId, count: 3, onProgress: sendProgress });
    console.log('[main] scraped posts:');
    posts.forEach((p, i) => console.log(`  ${i + 1}. ${p.title} (${p.body.length}자)`));

    sendProgress('Claude Haiku로 키워드 추출 중...');
    const keywords = await extractKeywords(posts, 5);
    console.log('[main] extracted keywords:', keywords);

    const candidates = await findCandidateBloggers({
      context, keywords, excludeId: naverId, needed: neighborCount, perKeyword: 10,
      onProgress: sendProgress,
    });
    console.log(`[main] candidates (${candidates.length}):`);
    candidates.forEach((c, i) =>
      console.log(`  ${i + 1}. ${c.blogId} score=${c.score} [${c.hitKeywords.join(', ')}]`));

    discoveryState = { naverId, posts, keywords, candidates };
    return {
      ok: true,
      message: `키워드: ${keywords.join(', ')}`,
      candidates,
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('start-applying', async (_event, payload) => {
  const { blogIds } = payload;
  if (!discoveryState) return { ok: false, message: '먼저 후보 검색을 실행하세요.' };
  if (!activeContext) return { ok: false, message: '로그인 세션이 없습니다.' };

  // 하드 캡: 한 회 최대 30건
  const targets = blogIds.slice(0, 30);
  console.log('[main] start-applying:', targets);

  const counts = { success: 0, already_buddy: 0, rejected: 0, not_found: 0, error: 0 };
  const results = [];

  for (let i = 0; i < targets.length; i += 1) {
    const blogId = targets[i];
    const candidate = discoveryState.candidates.find((c) => c.blogId === blogId);
    const keyword = (candidate && candidate.hitKeywords[0]) || '관련 주제';

    sendProgress(`[${i + 1}/${targets.length}] ${blogId} 인사말 생성 중...`);
    let message;
    try {
      message = await generateGreeting({ keyword });
    } catch (err) {
      message = '관심 주제가 비슷해 자주 들르고 싶어 신청드립니다.';
      console.warn('[main] greeting generation failed, using default:', err.message);
    }
    console.log(`[main] [${blogId}] message: "${message}"`);

    sendProgress(`[${i + 1}/${targets.length}] ${blogId} 신청 중...`);
    const r = await applyNeighbor({
      context: activeContext,
      blogId,
      message,
      onLog: (m) => console.log(m),
    });
    counts[r.status] = (counts[r.status] || 0) + 1;
    results.push({ blogId, keyword, message, ...r });

    if (i < targets.length - 1) {
      const delaySec = randomDelaySeconds(30, 90);
      sendProgress(`다음 신청까지 ${delaySec}초 대기...`);
      await sleep(delaySec * 1000);
    }
  }

  const summary = [
    `성공 ${counts.success || 0}`,
    `이미이웃 ${counts.already_buddy || 0}`,
    `거부 ${counts.rejected || 0}`,
    `없음 ${counts.not_found || 0}`,
    `오류 ${counts.error || 0}`,
  ].join(' · ');

  console.log('[main] applying done:', summary);
  return {
    ok: true,
    message: `완료. ${summary}`,
    results,
  };
});
