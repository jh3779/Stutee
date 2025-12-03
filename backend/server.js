// server.js
// Stuttee (S.T) backend: Ollama 기반 퀴즈 생성 API
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 헬스체크 엔드포인트
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Stuttee backend', model: OLLAMA_MODEL });
});

// 퀴즈 생성 엔드포인트
app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { text = '', level = 'medium', count = 5, type = 'multiple-choice' } = req.body || {};
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      return res.status(400).json({ message: 'text 필드는 필수입니다.' });
    }

    const allowedLevels = ['easy', 'medium', 'hard'];
    const difficulty = allowedLevels.includes(level) ? level : 'medium';

    const allowedTypes = ['multiple-choice', 'short-answer', 'mixed'];
    const questionType = allowedTypes.includes(type) ? type : 'multiple-choice';
    const targetLanguage = 'ko'; // 기본 출력 언어를 한국어로 설정

    const desiredCount = Number.isFinite(Number(count)) ? Number(count) : 5;
    const questionCount = Math.min(Math.max(desiredCount, 1), 20); // 1~20개로 제한

    const trimmedText = cleanText.slice(0, 4000); // LLM 프롬프트 길이 제한

    const payload = buildOllamaPayload({
      text: trimmedText,
      difficulty,
      questionCount,
      questionType,
      targetLanguage,
    });
    const ollamaResponse = await callOllama(payload);
    const parsed = parseQuestionsFromContent(ollamaResponse, questionCount);

    if (!parsed.length) {
      return res.status(502).json({ message: 'LLM 결과에서 문제를 추출하지 못했습니다.' });
    }

    const questions = normalizeQuestions({
      rawQuestions: parsed,
      desiredCount: questionCount,
      text: trimmedText,
      difficulty,
      questionType,
    });
    return res.json({
      questions,
      meta: {
        source: 'ollama',
        model: OLLAMA_MODEL,
        level: difficulty,
        count: questionCount,
        type: questionType,
        language: targetLanguage,
      },
    });
  } catch (err) {
    console.error('Quiz generation failed:', err);
    return res.status(500).json({ message: '퀴즈 생성 실패', detail: err.message || 'unknown_error' });
  }
});

// Ollama 요청 본문 생성
function buildOllamaPayload({ text, difficulty, questionCount, questionType, targetLanguage }) {
  const systemPrompt = [
    'You are a teacher who writes concise quiz questions (multiple-choice or short-answer).',
    'Return ONLY valid JSON with this shape:',
    '{ "questions": [ { "question": string, "options": [string,string,string,string] | null, "answer": string, "explanation": string } ] }',
    'Rules:',
    '- If question_type is "multiple-choice": include exactly 4 options and answer must match one of them.',
    '- If question_type is "short-answer": set options to null and answer should be a short phrase or sentence.',
    '- If question_type is "mixed": alternate multiple-choice and short-answer, starting with multiple-choice.',
    '- Keep explanations short (1-2 sentences).',
    '- Output must be in Korean, regardless of source language.',
    '- Do not include markdown fences or extra text.',
  ].join(' ');

  const userPrompt = [
    `Source text (trimmed): ${text}`,
    `Difficulty: ${difficulty}`,
    `Number of questions: ${questionCount}`,
    `Question type: ${questionType}`,
    `Target output language: ${targetLanguage} (항상 한국어로 출력)`,
    'Generate the quiz now. Respond with JSON only.',
  ].join('\n');

  return {
    model: OLLAMA_MODEL,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
}

// Ollama /api/chat 호출
async function callOllama(body) {
  const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama 응답 오류: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.message?.content || '';
  if (!content) throw new Error('Ollama 응답에 content가 없습니다.');
  return content;
}

// LLM 응답에서 JSON 추출
function parseQuestionsFromContent(content, limit) {
  const candidates = [];

  // 1) 순수 JSON 파싱 시도
  const direct = safeJsonParse(content);
  if (direct?.questions) candidates.push(direct.questions);

  // 2) ```json 코드블록 추출
  const codeMatch = content.match(/```(?:json)?\\s*([\\s\\S]*?)```/i);
  if (codeMatch) {
    const block = safeJsonParse(codeMatch[1]);
    if (block?.questions) candidates.push(block.questions);
  }

  // 3) 중괄호 범위 추출
  if (!candidates.length) {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = content.slice(firstBrace, lastBrace + 1);
      const maybe = safeJsonParse(sliced);
      if (maybe?.questions) candidates.push(maybe.questions);
    }
  }

  // 배열 하나라도 있으면 반환
  const found = candidates.find((arr) => Array.isArray(arr));
  if (!found) return [];
  return found.slice(0, limit);
}

// 문제 배열 정규화
function normalizeQuestions({ rawQuestions, desiredCount, text, difficulty, questionType }) {
  const fallbackOption = (idx) => `선택지 ${idx + 1}`;
  const base = text.slice(0, 60) || '제공된 학습 내용';
  const resolvedType = ['multiple-choice', 'short-answer', 'mixed'].includes(questionType)
    ? questionType
    : 'multiple-choice';

  return rawQuestions.slice(0, desiredCount).map((q, idx) => {
    const shouldBeMC =
      resolvedType === 'mixed' ? idx % 2 === 0 : resolvedType === 'multiple-choice';

    const questionText =
      typeof q?.question === 'string' && q.question.trim()
        ? q.question.trim()
        : `Q${idx + 1}. ${base} 기반 문제`;

    const optionsRaw = Array.isArray(q?.options) ? q.options.filter(Boolean) : [];
    const options = shouldBeMC ? optionsRaw : null;
    if (shouldBeMC) {
      while (options.length < 4) options.push(fallbackOption(options.length));
    }
    const trimmedOptions = shouldBeMC ? options.slice(0, 4).map((opt) => String(opt).trim()) : null;

    const answer = (() => {
      if (shouldBeMC) {
        if (typeof q?.answer === 'string' && trimmedOptions.includes(q.answer.trim())) {
          return q.answer.trim();
        }
        return trimmedOptions[0];
      }
      if (typeof q?.answer === 'string' && q.answer.trim()) return q.answer.trim();
      return `${base}에 대한 핵심 개념을 요약해 보세요.`;
    })();

    const explanation =
      typeof q?.explanation === 'string' && q.explanation.trim()
        ? q.explanation.trim()
        : `${difficulty} 난이도로 ${base}을(를) 바탕으로 한 정답입니다.`;

    return {
      id: idx + 1,
      question: questionText,
      options: trimmedOptions,
      answer,
      explanation,
      type: shouldBeMC ? 'multiple-choice' : 'short-answer',
    };
  });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

app.listen(PORT, () => {
  console.log(`Stuttee backend running on http://localhost:${PORT}`);
  console.log(`Using Ollama at ${OLLAMA_BASE} with model ${OLLAMA_MODEL}`);
});
