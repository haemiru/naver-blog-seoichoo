const SEARCH_BASE = 'https://search.naver.com/search.naver';

/**
 * 한 키워드로 네이버 블로그 검색 결과에서 blogId 목록을 가져온다.
 * 본인 ID와 공식/스폰서 블로그는 제외한다.
 */
async function searchByKeyword(context, keyword, { excludeId, perKeyword = 10 }) {
  const url = `${SEARCH_BASE}?where=blog&query=${encodeURIComponent(keyword)}&sm=tab_jum`;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // 블로그 결과 영역 로드 대기 (셀렉터 자주 바뀌므로 a 링크 기반)
    await page.waitForSelector('a[href*="blog.naver.com/"]', { timeout: 10000 }).catch(() => {});

    const blogIds = await page.evaluate(({ excludeId, perKeyword }) => {
      const seen = new Set();
      const out = [];
      const links = Array.from(document.querySelectorAll('a[href*="blog.naver.com/"]'));
      for (const a of links) {
        const href = a.href;
        // blog.naver.com/{id} 또는 blog.naver.com/{id}/{postNo}
        const m = href.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)(?:\/|\?|$)/);
        if (!m) continue;
        const id = m[1];
        // 시스템/광고/검색 카테고리 ID 제외
        if (['PostList', 'PostView', 'BlogHome', 'CategoryList', 'BookmarkList', 'PostThumbnailAlbumViewList'].includes(id)) continue;
        if (id === excludeId) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        if (out.length >= perKeyword) break;
      }
      return out;
    }, { excludeId, perKeyword });

    return blogIds;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * 여러 키워드로 검색해 후보 블로거를 모은다.
 * 여러 키워드에 걸쳐 등장하는 블로거를 우선순위로 정렬한다 (관련성 ↑).
 *
 * @returns {Promise<Array<{ blogId: string, score: number, hitKeywords: string[] }>>}
 */
async function findCandidateBloggers({
  context,
  keywords,
  excludeId,
  needed,
  perKeyword = 10,
  onProgress = () => {},
}) {
  const tally = new Map(); // blogId -> { score, hitKeywords[] }

  for (let i = 0; i < keywords.length; i += 1) {
    const kw = keywords[i];
    onProgress(`키워드 검색 ${i + 1}/${keywords.length}: "${kw}"`);
    try {
      const ids = await searchByKeyword(context, kw, { excludeId, perKeyword });
      for (const id of ids) {
        const entry = tally.get(id) || { score: 0, hitKeywords: [] };
        entry.score += 1;
        entry.hitKeywords.push(kw);
        tally.set(id, entry);
      }
    } catch (err) {
      console.warn(`[search] "${kw}" 검색 실패:`, err.message);
    }
  }

  const candidates = Array.from(tally.entries())
    .map(([blogId, v]) => ({ blogId, ...v }))
    .sort((a, b) => b.score - a.score);

  // 필요한 수의 1.5배 정도까지 반환 (사용자가 UI에서 일부 제외 가능하도록)
  return candidates.slice(0, Math.max(needed * 2, needed));
}

module.exports = { findCandidateBloggers };
