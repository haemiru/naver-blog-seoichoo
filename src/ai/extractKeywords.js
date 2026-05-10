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
이 블로그의 핵심 주제 키워드를 ${count}개 추출하세요.

요구사항:
- 너무 일반적인 단어(예: "방법", "이야기")는 피하고, 검색 시 비슷한 주제의 다른 블로거를 찾기 좋은 구체적인 키워드여야 함
- 1~3 어절의 한국어 명사구
- JSON 배열로만 응답: ["키워드1", "키워드2", ...]
- 다른 설명은 절대 추가하지 말 것

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
