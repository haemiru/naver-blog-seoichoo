const BLOG_BASE = 'https://blog.naver.com';

/**
 * 네이버 블로그는 본문이 iframe[name="mainFrame"] 안에 있다.
 * 이 헬퍼는 그 프레임이 로드될 때까지 대기 후 반환한다.
 */
async function getMainFrame(page, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frame = page.frames().find((f) => f.name() === 'mainFrame');
    if (frame) {
      try {
        await frame.waitForLoadState('domcontentloaded', { timeout: 3000 });
        return frame;
      } catch {}
    }
    await page.waitForTimeout(500);
  }
  throw new Error('blog mainFrame을 찾지 못했습니다.');
}

async function extractPostUrls(frame, naverId, max) {
  return frame.evaluate(({ blogId, max }) => {
    const seen = new Set();
    const out = [];
    const links = Array.from(document.querySelectorAll('a'));
    for (const a of links) {
      const href = a.href || '';
      const m = href.match(/logNo=(\d+)/) || href.match(new RegExp(`/${blogId}/(\\d+)`));
      if (!m) continue;
      const logNo = m[1];
      if (seen.has(logNo)) continue;
      seen.add(logNo);
      out.push(`https://blog.naver.com/${blogId}/${logNo}`);
      if (out.length >= max) break;
    }
    return out;
  }, { blogId: naverId, max });
}

async function extractPostContent(frame) {
  return frame.evaluate(() => {
    const titleEl = document.querySelector('.se-title-text, .pcol1, .htitle, .se_title');
    const bodyEl = document.querySelector('.se-main-container, #postViewArea, .post-view, #post-view');
    return {
      title: titleEl ? titleEl.textContent.trim() : '',
      body: bodyEl
        ? bodyEl.textContent.replace(/\s+/g, ' ').trim().slice(0, 3000)
        : '',
    };
  });
}

/**
 * 사용자 블로그의 최근 글 N개를 가져온다.
 * @returns {Promise<Array<{ url, title, body }>>}
 */
async function getRecentPosts({ context, naverId, count = 3, onProgress = () => {} }) {
  onProgress(`내 블로그 진입 중 (${naverId})...`);
  const page = await context.newPage();
  try {
    await page.goto(`${BLOG_BASE}/${naverId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const listFrame = await getMainFrame(page);
    onProgress('최근 글 목록 추출 중...');
    const urls = await extractPostUrls(listFrame, naverId, count);
    if (urls.length === 0) {
      throw new Error('최근 글 URL을 찾지 못했습니다. 블로그가 비어있거나 스킨이 특수합니다.');
    }

    const posts = [];
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      onProgress(`글 ${i + 1}/${urls.length} 본문 읽는 중...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const postFrame = await getMainFrame(page);
      const content = await extractPostContent(postFrame);
      posts.push({ url, ...content });
    }
    return posts;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { getRecentPosts };
