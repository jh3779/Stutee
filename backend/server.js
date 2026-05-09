const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const DATA_DIR = path.join(__dirname, 'data');

const LIMITS = {
  minChars: 80,
  maxChars: 5000,
  maxQuestions: 20,
  dailyGenerations: 20,
  minuteGenerations: 5,
  sessionTtlMs: 1000 * 60 * 60 * 24 * 7,
};

const PLAN_LIMITS = {
  free: 20,
  student: 80,
  pro: 200,
};

const DATA_FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  sessions: path.join(DATA_DIR, 'sessions.json'),
  histories: path.join(DATA_DIR, 'histories.json'),
  usage: path.join(DATA_DIR, 'usage.json'),
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

ensureDataFiles();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'home.html'));
});

app.use(express.static(FRONTEND_DIR));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Stutee backend',
    generator: 'local-rule-engine',
    auth: 'local-json',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const validation = validateSignup({ email: normalizedEmail, password, name });
    if (!validation.ok) {
      return sendError(res, validation.status, validation.code, validation.message);
    }

    const users = readStore('users');
    if (users.some((user) => user.email === normalizedEmail)) {
      return sendError(res, 409, 'EMAIL_EXISTS', '이미 가입된 이메일입니다.');
    }

    const user = {
      id: createId('usr'),
      email: normalizedEmail,
      name: sanitizeName(name) || normalizedEmail.split('@')[0],
      passwordHash: hashPassword(password),
      role: 'user',
      plan: 'free',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    users.push(user);
    writeStore('users', users);

    const session = createSession(user.id);
    return res.status(201).json(buildAuthResponse(user, session.token));
  } catch (error) {
    console.error('Signup failed:', error);
    return sendError(res, 500, 'INTERNAL_ERROR', '회원가입 중 오류가 발생했습니다.');
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const users = readStore('users');
    const user = users.find((item) => item.email === normalizedEmail);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const session = createSession(user.id);
    return res.json(buildAuthResponse(user, session.token));
  } catch (error) {
    console.error('Login failed:', error);
    return sendError(res, 500, 'INTERNAL_ERROR', '로그인 중 오류가 발생했습니다.');
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const sessions = readStore('sessions').filter((session) => session.tokenHash !== req.auth.tokenHash);
  writeStore('sessions', sessions);
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: publicUser(req.auth.user),
    quota: getQuota(req.auth.user.id),
    historyCount: readStore('histories').filter((item) => item.userId === req.auth.user.id).length,
  });
});

app.patch('/api/me/plan', requireAuth, (req, res) => {
  const plan = String(req.body?.plan || '').trim();
  if (!Object.prototype.hasOwnProperty.call(PLAN_LIMITS, plan)) {
    return sendError(res, 400, 'INVALID_PLAN', '지원하지 않는 플랜입니다.');
  }

  const users = readStore('users');
  const user = users.find((item) => item.id === req.auth.user.id);
  if (!user) {
    return sendError(res, 404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  }

  user.plan = plan;
  user.updatedAt = new Date().toISOString();
  writeStore('users', users);

  res.json({
    success: true,
    user: publicUser(user),
    quota: getQuota(user.id),
  });
});

app.delete('/api/me', requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!verifyPassword(password, req.auth.user.passwordHash)) {
    return sendError(res, 401, 'INVALID_PASSWORD', '비밀번호가 올바르지 않습니다.');
  }

  writeStore('users', readStore('users').filter((user) => user.id !== req.auth.user.id));
  writeStore('sessions', readStore('sessions').filter((session) => session.userId !== req.auth.user.id));
  writeStore('histories', readStore('histories').filter((item) => item.userId !== req.auth.user.id));
  writeStore('usage', readStore('usage').filter((item) => item.userId !== req.auth.user.id));

  res.json({ success: true });
});

app.get('/api/history', requireAuth, (req, res) => {
  const history = readStore('histories')
    .filter((item) => item.userId === req.auth.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((item) => item.result);

  res.json({ success: true, history });
});

app.delete('/api/history', requireAuth, (req, res) => {
  const remaining = readStore('histories').filter((item) => item.userId !== req.auth.user.id);
  writeStore('histories', remaining);
  res.json({ success: true });
});

app.post('/api/generate-quiz', requireAuth, (req, res) => {
  try {
    const quotaCheck = checkQuota(req.auth.user.id);
    if (!quotaCheck.ok) {
      return sendError(res, 429, quotaCheck.code, quotaCheck.message);
    }

    const request = normalizeRequest(req.body || {});
    const validation = validateRequest(request);
    if (!validation.ok) {
      return sendError(res, validation.status, validation.code, validation.message);
    }

    const result = generateQuestionSet(request, req.auth.user);
    incrementUsage(req.auth.user.id, result.usage);
    saveHistory(req.auth.user.id, result);

    return res.json({
      success: true,
      questions: result.items.map(toLegacyQuestion),
      items: result.items,
      meta: result.meta,
      usage: result.usage,
      quota: getQuota(req.auth.user.id),
    });
  } catch (error) {
    console.error('Quiz generation failed:', error);
    return sendError(res, 500, 'INTERNAL_ERROR', '퀴즈 생성 중 오류가 발생했습니다.', error.message);
  }
});

function requireAuth(req, res, next) {
  const auth = getAuthContext(req);
  if (!auth) {
    return sendError(res, 401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  }
  req.auth = auth;
  return next();
}

function getAuthContext(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const sessions = readStore('sessions');
  const activeSessions = sessions.filter((session) => new Date(session.expiresAt).getTime() > now);

  if (activeSessions.length !== sessions.length) {
    writeStore('sessions', activeSessions);
  }

  const session = activeSessions.find((item) => item.tokenHash === tokenHash);
  if (!session) return null;

  const user = readStore('users').find((item) => item.id === session.userId);
  if (!user) return null;

  return { user, tokenHash, session };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const sessions = readStore('sessions');
  const now = Date.now();
  sessions.push({
    id: createId('ses'),
    userId,
    tokenHash,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LIMITS.sessionTtlMs).toISOString(),
  });
  writeStore('sessions', sessions);
  return { token, tokenHash };
}

function buildAuthResponse(user, token) {
  return {
    success: true,
    token,
    user: publicUser(user),
    quota: getQuota(user.id),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    createdAt: user.createdAt,
  };
}

function validateSignup({ email, password, name }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, code: 'INVALID_EMAIL', message: '올바른 이메일을 입력하세요.' };
  }
  if (typeof password !== 'string' || password.length < 8) {
    return { ok: false, status: 400, code: 'WEAK_PASSWORD', message: '비밀번호는 8자 이상이어야 합니다.' };
  }
  if (name && String(name).length > 40) {
    return { ok: false, status: 400, code: 'NAME_TOO_LONG', message: '이름은 40자 이하로 입력하세요.' };
  }
  return { ok: true };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${key}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [algorithm, salt, key] = stored.split(':');
  if (algorithm !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

function checkQuota(userId) {
  const usage = getUsageRecord(userId);
  const limit = getDailyLimit(userId);
  const now = Date.now();
  const today = todayKey();
  const dailyCount = usage.days[today]?.count || 0;
  const recentEvents = usage.events.filter((time) => now - time < 60_000);

  if (dailyCount >= limit) {
    return { ok: false, code: 'DAILY_LIMIT_EXCEEDED', message: '오늘 생성 한도를 초과했습니다.' };
  }
  if (recentEvents.length >= LIMITS.minuteGenerations) {
    return { ok: false, code: 'RATE_LIMITED', message: '요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.' };
  }
  return { ok: true };
}

function getQuota(userId) {
  const usage = getUsageRecord(userId);
  const limit = getDailyLimit(userId);
  const today = todayKey();
  const daily = usage.days[today] || { count: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
  return {
    dailyCount: daily.count,
    dailyLimit: limit,
    remaining: Math.max(0, limit - daily.count),
    minuteLimit: LIMITS.minuteGenerations,
    inputTokens: daily.inputTokens || 0,
    outputTokens: daily.outputTokens || 0,
    estimatedCostUsd: Number(daily.estimatedCostUsd || 0),
  };
}

function getDailyLimit(userId) {
  const user = readStore('users').find((item) => item.id === userId);
  return PLAN_LIMITS[user?.plan] || PLAN_LIMITS.free;
}

function incrementUsage(userId, tokenUsage) {
  const usageRows = readStore('usage');
  let usage = usageRows.find((item) => item.userId === userId);
  if (!usage) {
    usage = { userId, days: {}, events: [] };
    usageRows.push(usage);
  }

  const today = todayKey();
  usage.days[today] = usage.days[today] || {
    count: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  };
  usage.days[today].count += 1;
  usage.days[today].inputTokens += tokenUsage.inputTokens || 0;
  usage.days[today].outputTokens += tokenUsage.outputTokens || 0;
  usage.days[today].estimatedCostUsd = Number(
    (usage.days[today].estimatedCostUsd + (tokenUsage.estimatedCostUsd || 0)).toFixed(6)
  );
  usage.events = usage.events.filter((time) => Date.now() - time < 60_000);
  usage.events.push(Date.now());

  writeStore('usage', usageRows);
}

function getUsageRecord(userId) {
  const usageRows = readStore('usage');
  return usageRows.find((item) => item.userId === userId) || { userId, days: {}, events: [] };
}

function saveHistory(userId, result) {
  const histories = readStore('histories');
  const questionSetId = result.meta.questionSetId;
  const next = histories.filter((item) => !(item.userId === userId && item.result?.meta?.questionSetId === questionSetId));
  next.push({
    id: createId('hst'),
    userId,
    result,
    createdAt: result.meta.createdAt,
  });
  const trimmed = next
    .filter((item) => item.userId !== userId)
    .concat(
      next
        .filter((item) => item.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50)
    );
  writeStore('histories', trimmed);
}

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

function generateQuestionSet(request, user) {
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
      questionSetId: `qs_${sourceHash.slice(0, 10)}_${Date.now().toString(36)}`,
      sourceHash,
      source: 'local-rule-engine',
      model: 'stutee-local-generator',
      level: request.difficulty,
      count: items.length,
      requestedCount: request.count,
      types: request.questionTypes,
      language: request.language,
      userId: user.id,
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

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  Object.values(DATA_FILES).forEach((file) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]\n');
  });
}

function readStore(name) {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILES[name], 'utf8'));
  } catch {
    return [];
  }
}

function writeStore(name, value) {
  const file = DATA_FILES[name];
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

function sendError(res, status, code, message, detail) {
  return res.status(status).json({
    success: false,
    error: { code, message, detail },
  });
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

app.listen(PORT, HOST, () => {
  console.log(`Stutee running on http://${HOST}:${PORT}`);
});
