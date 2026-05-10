const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '..', '..', 'session');

/**
 * 이전 실행에서 남은 Chromium Singleton 락 파일을 제거한다.
 * 프로세스가 비정상 종료되면 락이 남아 다음 launch가 즉시 실패한다.
 */
function cleanupSessionLocks() {
  if (!fs.existsSync(SESSION_DIR)) return;
  const entries = fs.readdirSync(SESSION_DIR);
  let removed = 0;
  for (const name of entries) {
    if (/^Singleton/i.test(name) || /lockfile$/i.test(name)) {
      try {
        fs.rmSync(path.join(SESSION_DIR, name), { force: true, recursive: false });
        removed += 1;
      } catch {}
    }
  }
  if (removed > 0) console.log(`[cleanup] removed ${removed} stale lock file(s)`);
}

module.exports = { cleanupSessionLocks };
