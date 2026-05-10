const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { loginToNaver } = require('../src/naver/login');
const { getRecentPosts } = require('../src/naver/myBlog');

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

    const summary = posts.map((p, i) => `${i + 1}. ${p.title || '(제목없음)'}`).join('\n');
    return {
      ok: true,
      message: `최근 글 ${posts.length}개 수집 완료. 이웃 ${neighborCount}명 예정.\n${summary}`,
    };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});
