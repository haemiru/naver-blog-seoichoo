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
    width: 480,
    height: 560,
    resizable: false,
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

ipcMain.handle('start-automation', async (_event, payload) => {
  const { naverId, password, neighborCount } = payload;
  try {
    const { context } = await loginToNaver({
      naverId,
      password,
      onProgress: sendProgress,
    });
    activeContext = context;

    const posts = await getRecentPosts({
      context,
      naverId,
      count: 3,
      onProgress: sendProgress,
    });

    console.log('[main] scraped posts:');
    posts.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.title} (${p.body.length}자) — ${p.url}`);
    });

    sendProgress('Claude Haiku로 키워드 추출 중...');
    const keywords = await extractKeywords(posts, 5);
    console.log('[main] extracted keywords:', keywords);

    const candidates = await findCandidateBloggers({
      context,
      keywords,
      excludeId: naverId,
      needed: neighborCount,
      perKeyword: 10,
      onProgress: sendProgress,
    });
    console.log(`[main] candidates (${candidates.length}):`);
    candidates.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.blogId} score=${c.score} [${c.hitKeywords.join(', ')}]`);
    });

    const summary = posts.map((p, i) => `${i + 1}. ${p.title || '(제목없음)'}`).join('\n');
    const candidateList = candidates
      .slice(0, neighborCount)
      .map((c, i) => `${i + 1}. ${c.blogId} (${c.hitKeywords.join('+')})`)
      .join('\n');

    return {
      ok: true,
      message: `최근 글 ${posts.length}개 수집.\n${summary}\n\n추출 키워드: ${keywords.join(', ')}\n\n후보 블로거 ${candidates.length}명 발견 (상위 ${neighborCount}명):\n${candidateList}\n\n다음 단계에서 신청 UI 표시 예정.`,
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});
