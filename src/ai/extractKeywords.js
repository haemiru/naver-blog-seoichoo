const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. 프로젝트 루트의 .env 파일을 확인하세요.');
  }
  return new Anthropic({ apiKey });
}

/**
 * 블로그 글 본문들에서 핵심 키워드 N개를 추출한다.
 * @param {Array<{title: string, body: string}>} posts
 * @param {number} count 추출할 키워드 수 (기본 5)
 * @returns {Promise<string[]>}
 */
async function extractKeywords(posts, count = 5) {
  const client = getClient();

  const corpus = posts
    .map((p, i) => `[글 ${i + 1}] ${p.title}\n${p.body}`)
    .join('\n\n---\n\n');

  const prompt = `다음은 한 네이버 블로그의 최근 글 ${posts.length}개입니다.
이 블로그와 같은 니치(niche)의 다른 블로거를 검색해서 찾을 수 있는
검색 키워드 ${count}개를 추출하세요.

작업 순서:
1. 먼저 이 블로그의 구체적 니치(어떤 분야의 누구를 위한 블로그인지)를 속으로 파악
2. 다음 두 종류를 섞어서 키워드를 뽑되, 모두 그 니치에 속한 사람의 글에서 자주 등장할 단어:
   (a) 전문 용어 / 진단명 / 특수 표현 — 검색 시 정확도 높지만 결과 수 적음
   (b) 그 니치의 사람들이 일상적으로 쓰는 표현 — 검색 시 결과 수 많음
3. 두 종류를 적당히 섞어 ${count}개를 만들어 검색 결과 수와 정확도를 모두 챙기세요
4. 일반 육아·건강·라이프스타일 블로그에서 흔히 쓰는 무난한 표현은 제외
   (예: "환절기 비염", "아이 건강", "우리 아이", "육아 일기")

키워드 형식:
- 1~3 어절의 한국어 명사구
- 동의어/유사어 중복 금지
- 너무 짧거나 너무 긴 표현 금지 (검색에 적합한 길이)

응답 형식:
- JSON 배열만 출력: ["키워드1", "키워드2", ...]
- 사고 과정·설명·코드블록·접두문 절대 금지

${corpus}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  // JSON 배열 추출 (모델이 코드블록으로 감쌀 수도 있음)
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`키워드 응답을 파싱할 수 없습니다: ${text.slice(0, 200)}`);
  }
  const keywords = JSON.parse(match[0]);
  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error('키워드 배열이 비어있습니다.');
  }
  return keywords.map((k) => String(k).trim()).filter(Boolean);
}

module.exports = { extractKeywords };
