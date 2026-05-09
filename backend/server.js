const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const LIMITS = {
  minChars: 80,
  maxChars: 5000,
  maxQuestions: 20,
};

const TYPE_LABELS = {
  'multiple-choice': '객관식',
  'short-answer': '주관식',
  'true-false': 'OX',
  'fill-blank': '빈칸',
};

const FORBIDDEN_PATTERNS = [
  /자살|자해|폭탄|마약\s*제조|해킹\s*공격|불법\s*복제/i,
  /주민등록번호|신용카드\s*번호|계좌\s*비밀번호/i,
];

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(FRONTEND_DIR));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Stutee backend',
    generator: 'local-rule-engine',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.post('/api/generate-quiz', (req, res) => {
  try {
    const request = normalizeRequest(req.body || {});
    const validation = validateRequest(request);
    if (!validation.ok) {
      return res.status(validation.status).json({
        success: false,
        error: {
          code: validation.code,
          message: validation.message,
        },
      });
    }

    const result = generateQuestionSet(request);
    return res.json({
      success: true,
      questions: result.items.map(toLegacyQuestion),
      items: result.items,
      meta: result.meta,
      usage: result.usage,
    });
  } catch (error) {
    console.error('Quiz generation failed:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '퀴즈 생성 중 오류가 발생했습니다.',
        detail: error.message,
      },
    });
  }
});

function normalizeRequest(body) {
  const rawText = typeof body.text === 'string' ? body.text : '';
  const text = normalizeText(rawText);
  const count = clamp(Number(body.count) || 5, 1, LIMITS.maxQuestions);
  const difficulty = normalizeDifficulty(body.level || body.difficulty);
  const questionTypes = normalizeQuestionTypes(body.questionTypes || body.type);

  return {
    text,
    count,
    difficulty,
    questionTypes,
    language: 'ko',
  };
}

function validateRequest(request) {
  if (request.text.length < LIMITS.minChars) {
    return {
      ok: false,
      status: 400,
      code: 'TEXT_TOO_SHORT',
      message: `학습 텍스트는 최소 ${LIMITS.minChars}자 이상이어야 합니다.`,
    };
  }

  if (request.text.length > LIMITS.maxChars) {
    return {
      ok: false,
      status: 413,
      code: 'TEXT_TOO_LONG',
      message: `학습 텍스트는 최대 ${LIMITS.maxChars}자까지 입력할 수 있습니다.`,
    };
  }

  if (!request.questionTypes.length) {
    return {
      ok: false,
      status: 400,
      code: 'TYPE_REQUIRED',
      message: '문제 유형을 하나 이상 선택하세요.',
    };
  }

  if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(request.text))) {
    return {
      ok: false,
      status: 400,
      code: 'INPUT_POLICY_VIOLATION',
      message: '입력 정책에 맞지 않는 표현이 포함되어 있습니다.',
    };
  }

  if (/(.)\1{24,}/.test(request.text)) {
    return {
      ok: false,
      status: 400,
      code: 'REPEATED_INPUT',
      message: '반복 문자가 너무 많습니다.',
    };
  }

  return { ok: true };
}

function generateQuestionSet(request) {
  const sentences = extractSentences(request.text);
  const keywords = extractKeywords(request.text);
  const used = new Set();
  const items = [];
  let cursor = 0;
  let guard = 0;

  while (items.length < request.count && guard < request.count * 10) {
    const type = request.questionTypes[items.length % request.questionTypes.length];
    const sentence = sentences[cursor % sentences.length];
    const question = createQuestion({
      type,
      sentence,
      keywords,
      difficulty: request.difficulty,
      index: items.length,
    });

    cursor += 1;
    guard += 1;

    if (!question) continue;
    question.createdAt = new Date().toISOString();
    question.questionHash = hashString(`${question.type}:${question.question}:${question.answer}`);

    const validation = validateQuestion(question);
    if (!validation.ok || used.has(question.questionHash)) continue;

    used.add(question.questionHash);
    items.push(question);
  }

  if (!items.length) {
    throw new Error('문제를 만들 수 있는 핵심 문장을 찾지 못했습니다.');
  }

  const sourceHash = hashString(request.text);
  return {
    items,
    meta: {
      jobId: `job_${Date.now().toString(36)}_${sourceHash.slice(0, 6)}`,
      questionSetId: `qs_${sourceHash.slice(0, 10)}`,
      sourceHash,
      source: 'local-rule-engine',
      model: 'stutee-local-generator',
      level: request.difficulty,
      count: items.length,
      requestedCount: request.count,
      types: request.questionTypes,
      language: request.language,
      createdAt: new Date().toISOString(),
    },
    usage: estimateUsage(request.text, items),
  };
}

function createQuestion({ type, sentence, keywords, difficulty, index }) {
  const answer = chooseAnswer(sentence, keywords, index);
  if (!answer) return null;

  const distractors = keywords
    .filter((word) => word !== answer && !answer.includes(word) && !word.includes(answer))
    .slice(index, index + 12);
  const topic = pickTopic([answer, ...keywords], index);

  if (type === 'multiple-choice') {
    const choices = [answer, ...shuffleUnique(distractors).slice(0, 3)];
    while (choices.length < 4) choices.push(`관련 개념 ${choices.length + 1}`);
    return {
      type,
      question: `다음 설명의 핵심 개념으로 가장 적절한 것은?\n"${replaceFirst(sentence, answer, '____')}"`,
      choices: shuffleUnique(choices),
      answer,
      explanation: `${answer}은(는) 원문에서 해당 설명의 중심 개념으로 사용되었습니다.`,
      difficulty,
      topic,
    };
  }

  if (type === 'short-answer') {
    return {
      type,
      question: `다음 설명이 가리키는 핵심어를 쓰세요.\n"${replaceFirst(sentence, answer, '____')}"`,
      choices: [],
      answer,
      explanation: `문장 안에서 ${answer}이(가) 핵심 의미를 담당합니다.`,
      difficulty,
      topic,
    };
  }

  if (type === 'true-false') {
    const makeFalse = index % 2 === 1 && distractors.length > 0;
    const replacement = makeFalse ? distractors[0] : answer;
    const statement = makeFalse ? replaceFirst(sentence, answer, replacement) : sentence;
    return {
      type,
      question: `다음 설명은 원문 기준으로 맞습니까?\n"${statement}"`,
      choices: ['O', 'X'],
      answer: makeFalse ? 'X' : 'O',
      explanation: makeFalse
        ? `원문에서는 ${replacement}이(가) 아니라 ${answer}이(가) 핵심 표현입니다.`
        : '해당 설명은 원문 내용과 일치합니다.',
      difficulty,
      topic,
    };
  }

  if (type === 'fill-blank') {
    return {
      type,
      question: replaceFirst(sentence, answer, '____'),
      choices: [],
      answer,
      explanation: `빈칸에는 원문에서 사용된 핵심어 ${answer}이(가) 들어갑니다.`,
      difficulty,
      topic,
    };
  }

  return null;
}

function validateQuestion(question) {
  if (!question.question || !question.answer || !question.explanation) {
    return { ok: false };
  }
  if (question.type === 'multiple-choice') {
    return {
      ok: Array.isArray(question.choices)
        && question.choices.length === 4
        && question.choices.includes(question.answer),
    };
  }
  if (question.type === 'true-false') {
    return { ok: question.answer === 'O' || question.answer === 'X' };
  }
  if (question.type === 'fill-blank') {
    return { ok: (question.question.match(/____/g) || []).length === 1 };
  }
  return { ok: true };
}

function toLegacyQuestion(question, index) {
  return {
    id: index + 1,
    question: question.question,
    options: question.choices.length ? question.choices : null,
    answer: question.answer,
    explanation: question.explanation,
    type: question.type,
    difficulty: question.difficulty,
    topic: question.topic,
    createdAt: question.createdAt,
  };
}

function normalizeQuestionTypes(input) {
  const raw = Array.isArray(input) ? input : [input || 'multiple-choice'];
  const expanded = raw.flatMap((type) => {
    if (type === 'mixed') return ['multiple-choice', 'short-answer', 'true-false', 'fill-blank'];
    return [type];
  });
  return Array.from(new Set(expanded.filter((type) => TYPE_LABELS[type])));
}

function normalizeDifficulty(value) {
  return ['easy', 'medium', 'hard'].includes(value) ? value : 'medium';
}

function normalizeText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSentences(text) {
  const parts = normalizeText(text)
    .split(/(?<=[.!?。！？다요음임됨함있없])\s+|[\n\r]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18);

  if (parts.length) {
    return parts.map((sentence) => (sentence.length > 170 ? `${sentence.slice(0, 167)}...` : sentence));
  }

  const chunks = [];
  for (let i = 0; i < text.length; i += 120) chunks.push(text.slice(i, i + 120));
  return chunks.filter(Boolean);
}

function extractKeywords(text) {
  const stopWords = new Set([
    '그리고', '그러나', '하지만', '또한', '사용자', '서비스', '기반', '대한', '위해',
    '있는', '없는', '한다', '된다', '있다', '에서', '으로', '에게', '처럼', '같은',
    '것이다', '및', '또는', 'the', 'and', 'for', 'with', 'that',
  ]);
  const counts = new Map();
  const matches = normalizeText(text).match(/[가-힣A-Za-z0-9][가-힣A-Za-z0-9-]{1,}/g) || [];

  matches.forEach((raw) => {
    const word = raw.replace(/(은|는|이|가|을|를|의|에|로|과|와|도|만|부터|까지)$/u, '');
    if (word.length < 2 || stopWords.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
  });

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word);

  return sorted.length ? sorted.slice(0, 40) : ['핵심개념', '학습내용', '주요내용', '정리'];
}

function chooseAnswer(sentence, keywords, index) {
  const inSentence = keywords.filter((word) => sentence.includes(word));
  return inSentence[index % Math.max(1, inSentence.length)] || keywords[index % keywords.length];
}

function pickTopic(keywords, index) {
  const topic = keywords[index % keywords.length] || '학습 주제';
  return topic.length > 24 ? topic.slice(0, 24) : topic;
}

function replaceFirst(text, target, replacement) {
  if (!target || !text.includes(target)) return text;
  return text.replace(target, replacement);
}

function shuffleUnique(values) {
  const unique = Array.from(new Set(values.filter(Boolean)));
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(seededRandom(hashString(unique.join('|') + i)) * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique;
}

function seededRandom(seed) {
  const value = parseInt(seed.slice(0, 8), 16) || 1;
  return Math.abs(Math.sin(value) * 10000) % 1;
}

function estimateUsage(text, questions) {
  const inputTokens = Math.ceil(text.length / 2.8);
  const outputTokens = Math.ceil(JSON.stringify(questions).length / 2.8);
  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: Number(((inputTokens / 1_000_000) * 0.75 + (outputTokens / 1_000_000) * 4.5).toFixed(6)),
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

app.listen(PORT, HOST, () => {
  console.log(`Stutee running on http://${HOST}:${PORT}`);
});
