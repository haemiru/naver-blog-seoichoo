const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, ipcMain } = require('electron');
const { loginToNaver } = require('../src/naver/login');
const { getRecentPosts } = require('../src/naver/myBlog');
const { extractKeywords } = require('../src/ai/extractKeywords');
const { findCandidateBloggers } = require('../src/naver/search');

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

  console.log('[main] start-applying:', blogIds);
  // 8단계에서 실제 신청 로직 연결
  return {
    ok: true,
    message: `${blogIds.length}명 신청 요청 수신 (실제 신청 로직은 8단계에서 연결).`,
  };
});
