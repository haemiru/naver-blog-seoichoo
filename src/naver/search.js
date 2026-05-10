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
  const perKeywordHits = new Map(); // keyword -> blogId[]
  const tally = new Map();           // blogId -> { score, hitKeywords[] }

  for (let i = 0; i < keywords.length; i += 1) {
    const kw = keywords[i];
    onProgress(`키워드 검색 ${i + 1}/${keywords.length}: "${kw}"`);
    try {
      const ids = await searchByKeyword(context, kw, { excludeId, perKeyword });
      perKeywordHits.set(kw, ids);
      for (const id of ids) {
        const entry = tally.get(id) || { score: 0, hitKeywords: [] };
        entry.score += 1;
        entry.hitKeywords.push(kw);
        tally.set(id, entry);
      }
    } catch (err) {
      console.warn(`[search] "${kw}" 검색 실패:`, err.message);
      perKeywordHits.set(kw, []);
    }
  }

  // 1단계: 다중 키워드 매칭(score>=2) 우선, score 내림차순
  const multiKeyword = Array.from(tally.entries())
    .filter(([, v]) => v.score >= 2)
    .map(([blogId, v]) => ({ blogId, ...v }))
    .sort((a, b) => b.score - a.score);

  const seen = new Set(multiKeyword.map((c) => c.blogId));
  const result = [...multiKeyword];

  // 2단계: 단일 매칭은 키워드별 round-robin (1번 키워드에서 1명, 2번에서 1명, ...)
  const queues = keywords.map((kw) => (perKeywordHits.get(kw) || []).slice());
  const targetSize = Math.max(needed * 2, needed);
  let exhausted = false;
  while (!exhausted && result.length < targetSize) {
    exhausted = true;
    for (let q = 0; q < queues.length && result.length < targetSize; q += 1) {
      const queue = queues[q];
      while (queue.length > 0) {
        const blogId = queue.shift();
        if (!seen.has(blogId)) {
          seen.add(blogId);
          result.push({ blogId, ...tally.get(blogId) });
          exhausted = false;
          break;
        }
      }
    }
  }

  return result;
}

module.exports = { findCandidateBloggers };
