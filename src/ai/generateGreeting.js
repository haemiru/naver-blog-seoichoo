const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-haiku-4-5-20251001';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
  return new Anthropic({ apiKey });
}

/**
 * 서로이웃 신청 메시지 1문장 생성.
 * - 친근하지만 절제된 톤
 * - 광고/이모지/느낌표 금지
 * - 25자 이내
 */
async function generateGreeting({ keyword }) {
  const client = getClient();
  const prompt = `네이버 블로그 서로이웃 신청 메시지를 1문장으로 작성해주세요.

조건:
- 친근하지만 절제된 톤 (반말 사용 금지, 정중한 존댓말)
- 광고성 표현, 이모지, 느낌표 사용 금지
- 35자 이내, 마침표로 끝나는 완결된 문장
- 상대 블로그 주제: "${keyword}"
- 따옴표 없이 메시지 본문 1문장만 응답

예시 톤: "관심 주제가 비슷해 자주 들르고 싶어 신청드립니다."`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 80,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\n+/g, ' ');

  // 50자 초과만 잘라내기 (어색한 잘림 방지)
  if (text.length > 50) {
    const cut = text.slice(0, 48).replace(/[\s,]*$/, '');
    return /[.!?。]$/.test(cut) ? cut : cut + '.';
  }
  // 마침표 없이 끝나면 추가
  if (!/[.!?。]$/.test(text)) return text + '.';
  return text;
}

module.exports = { generateGreeting };
