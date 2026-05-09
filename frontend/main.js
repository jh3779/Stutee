const STORAGE_KEYS = {
  history: 'stutee.history.v2',
  cache: 'stutee.cache.v2',
  usage: 'stutee.usage.v2',
};

const LIMITS = {
  minChars: 80,
  maxChars: 5000,
  dailyGenerations: 20,
  minuteGenerations: 5,
  cacheLimit: 40,
  historyLimit: 12,
};

const TYPE_LABELS = {
  'multiple-choice': '객관식',
  'short-answer': '주관식',
  'true-false': 'OX',
  'fill-blank': '빈칸',
};

const DIFFICULTY_LABELS = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};

const SAMPLE_TEXT = `클라우드 컴퓨팅은 인터넷을 통해 서버, 저장소, 데이터베이스, 네트워크, 소프트웨어와 같은 컴퓨팅 자원을 필요한 만큼 사용하는 방식이다. 사용자는 직접 물리 서버를 구매하지 않아도 되고, 사용량에 따라 비용을 지불할 수 있다. AWS의 VPC는 사용자가 정의한 가상 네트워크로, public subnet과 private subnet을 나누어 보안 경계를 만들 수 있다. Application Load Balancer는 사용자 요청을 여러 EC2 인스턴스로 분산하며, Auto Scaling Group은 트래픽 증가에 따라 인스턴스 수를 자동으로 조정한다. RDS Multi-AZ는 장애 발생 시 대기 인스턴스로 전환하여 데이터베이스 가용성을 높인다. SQS는 비동기 작업을 큐에 저장하여 웹 요청 처리와 시간이 오래 걸리는 작업을 분리하는 데 사용된다. Redis는 캐시와 rate limit에 활용할 수 있으며, CloudWatch는 로그와 지표를 수집해 장애 상황을 빠르게 파악하도록 돕는다.`;

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:4000' : '';
const elements = {};
const state = {
  currentResult: null,
  currentView: 'cards',
};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  updateUsageUI();
  updateCacheStat();
  renderHistory();
  validateInput();
});

function bindElements() {
  Object.assign(elements, {
    form: document.querySelector('#generator'),
    studyText: document.querySelector('#studyText'),
    charCount: document.querySelector('#charCount'),
    inputMessage: document.querySelector('#inputMessage'),
    count: document.querySelector('#count'),
    countValue: document.querySelector('#countValue'),
    generateBtn: document.querySelector('#generateBtn'),
    sampleBtn: document.querySelector('#sampleBtn'),
    resetBtn: document.querySelector('#resetBtn'),
    dailyUsage: document.querySelector('#dailyUsage'),
    dailyMeter: document.querySelector('#dailyMeter'),
    statusText: document.querySelector('#statusText'),
    jobLabel: document.querySelector('#jobLabel'),
    steps: document.querySelector('#steps'),
    cacheStat: document.querySelector('#cacheStat'),
    latestStat: document.querySelector('#latestStat'),
    validationStat: document.querySelector('#validationStat'),
    costStat: document.querySelector('#costStat'),
    questionList: document.querySelector('#questionList'),
    jsonView: document.querySelector('#jsonView'),
    resultSummary: document.querySelector('#resultSummary'),
    historyList: document.querySelector('#historyList'),
    questionTemplate: document.querySelector('#questionTemplate'),
    clearHistoryBtn: document.querySelector('#clearHistoryBtn'),
    copyBtn: document.querySelector('#copyBtn'),
    tabButtons: Array.from(document.querySelectorAll('.tab-button')),
  });
}

function bindEvents() {
  elements.studyText.addEventListener('input', validateInput);
  elements.count.addEventListener('input', () => {
    elements.countValue.textContent = elements.count.value;
  });
  elements.form.addEventListener('submit', handleGenerate);
  elements.sampleBtn.addEventListener('click', () => {
    elements.studyText.value = SAMPLE_TEXT;
    validateInput();
    elements.studyText.focus();
  });
  elements.resetBtn.addEventListener('click', clearWorkspace);
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
  elements.copyBtn.addEventListener('click', copyAll);
  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });
}

async function handleGenerate(event) {
  event.preventDefault();

  const request = getRequest();
  const validation = validateRequest(request);
  if (!validation.ok) {
    showInputMessage(validation.message, 'error');
    return;
  }

  const quota = checkQuota();
  if (!quota.ok) {
    showInputMessage(quota.message, 'error');
    return;
  }

  const cacheKey = buildCacheKey(request);
  const cached = readCache()[cacheKey];
  const jobId = `job_${Date.now().toString(36)}`;
  elements.jobLabel.textContent = jobId;
  elements.generateBtn.disabled = true;
  resetSteps();

  try {
    setStep('input', '입력 검증 완료');
    await wait(120);
    setStep('cache', '캐시 확인 중');

    if (cached) {
      await wait(160);
      setStep('api', '캐시 결과 사용');
      setStep('validate', '검증 완료');
      setStep('save', '결과 표시');
      displayResult(cached, true);
      showInputMessage('동일 조건의 생성 결과를 불러왔습니다.', 'ok');
      return;
    }

    setStep('api', '백엔드 요청 중');
    const result = await requestQuiz(request);
    setStep('validate', '결과 검증 중');

    const resultValidation = validateResult(result);
    if (!resultValidation.ok) {
      throw new Error(resultValidation.message);
    }

    setStep('save', '결과 저장');
    incrementUsage();
    saveCache(cacheKey, result);
    saveHistory(result);
    displayResult(result, false);
    showInputMessage('문제 생성이 완료되었습니다.', 'ok');
  } catch (error) {
    elements.statusText.textContent = '생성 실패';
    elements.validationStat.textContent = '실패';
    showInputMessage(error.message || '문제 생성 중 오류가 발생했습니다.', 'error');
  } finally {
    elements.generateBtn.disabled = false;
    updateUsageUI();
    updateCacheStat();
    renderHistory();
  }
}

async function requestQuiz(request) {
  const response = await fetch(`${API_BASE}/api/generate-quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: request.text,
      difficulty: request.difficulty,
      count: request.count,
      questionTypes: request.questionTypes,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || `요청 실패 (${response.status})`);
  }

  const items = Array.isArray(data.items) ? data.items : normalizeLegacyQuestions(data.questions || []);
  return {
    meta: data.meta || {},
    usage: data.usage || { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    items,
  };
}

function getRequest() {
  return {
    text: normalizeText(elements.studyText.value),
    difficulty: document.querySelector('input[name="difficulty"]:checked').value,
    count: Number(elements.count.value) || 5,
    questionTypes: Array.from(document.querySelectorAll('input[name="questionType"]:checked')).map((input) => input.value),
  };
}

function validateInput() {
  const length = elements.studyText.value.trim().length;
  elements.charCount.textContent = `${length} / ${LIMITS.maxChars}`;
  const validation = validateRequest(getRequest(), true);

  if (!length) {
    showInputMessage('', '');
  } else if (validation.ok) {
    showInputMessage('입력 조건이 유효합니다.', 'ok');
  } else {
    showInputMessage(validation.message, 'error');
  }
}

function validateRequest(request, soft = false) {
  if (!request.text && soft) return { ok: false, message: '' };
  if (request.text.length < LIMITS.minChars) return { ok: false, message: `원문은 최소 ${LIMITS.minChars}자 이상이어야 합니다.` };
  if (request.text.length > LIMITS.maxChars) return { ok: false, message: `원문은 최대 ${LIMITS.maxChars}자까지 입력할 수 있습니다.` };
  if (!request.questionTypes.length) return { ok: false, message: '문제 유형을 하나 이상 선택하세요.' };
  if (/(.)\1{24,}/.test(request.text)) return { ok: false, message: '반복 문자가 너무 많습니다.' };
  return { ok: true };
}

function validateResult(result) {
  if (!result || !Array.isArray(result.items) || !result.items.length) {
    return { ok: false, message: '생성된 문제가 없습니다.' };
  }

  for (const item of result.items) {
    if (!item.question || !item.answer || !item.explanation) {
      return { ok: false, message: '문제 응답 구조가 올바르지 않습니다.' };
    }
    if (item.type === 'multiple-choice' && (!Array.isArray(item.choices) || !item.choices.includes(item.answer))) {
      return { ok: false, message: '객관식 정답이 선택지에 없습니다.' };
    }
  }

  return { ok: true };
}

function displayResult(result, fromCache) {
  state.currentResult = result;
  elements.statusText.textContent = fromCache ? '캐시 결과 표시' : '생성 완료';
  elements.latestStat.textContent = `${result.items.length}문항`;
  elements.validationStat.textContent = '통과';
  elements.costStat.textContent = `$${Number(result.usage?.estimatedCostUsd || 0).toFixed(6)}`;
  elements.resultSummary.textContent = `${result.items.length}개 문항 · ${formatDate(result.meta?.createdAt || new Date())} · ${result.meta?.source || 'local'}`;
  renderQuestions(result.items);
  renderJson(result);
  switchView('cards');
  document.querySelector('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderQuestions(items) {
  elements.questionList.innerHTML = '';

  items.forEach((item) => {
    const node = elements.questionTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.type').textContent = TYPE_LABELS[item.type] || item.type;
    node.querySelector('.difficulty').textContent = DIFFICULTY_LABELS[item.difficulty] || item.difficulty || '보통';
    node.querySelector('.topic').textContent = item.topic || '학습 주제';
    node.querySelector('h3').textContent = item.question;

    const choices = node.querySelector('.choices');
    if (Array.isArray(item.choices) && item.choices.length) {
      item.choices.forEach((choice, index) => {
        const row = document.createElement('div');
        row.className = 'choice';
        row.innerHTML = `<strong>${choiceLabel(index)}</strong><span></span>`;
        row.querySelector('span').textContent = choice;
        choices.appendChild(row);
      });
    } else {
      choices.classList.add('hidden');
    }

    const answerBox = node.querySelector('.answer-box');
    answerBox.innerHTML = '<strong></strong><p></p>';
    answerBox.querySelector('strong').textContent = `정답: ${item.answer}`;
    answerBox.querySelector('p').textContent = item.explanation;

    node.querySelector('.answer-toggle').addEventListener('click', (event) => {
      answerBox.classList.toggle('hidden');
      event.currentTarget.textContent = answerBox.classList.contains('hidden') ? '정답 보기' : '정답 숨기기';
    });

    elements.questionList.appendChild(node);
  });
}

function renderJson(result) {
  elements.jsonView.textContent = JSON.stringify({
    items: result.items.map((item) => ({
      type: item.type,
      question: item.question,
      choices: item.choices,
      answer: item.answer,
      explanation: item.explanation,
      difficulty: item.difficulty,
      topic: item.topic,
      createdAt: item.createdAt,
    })),
  }, null, 2);
}

function switchView(view) {
  state.currentView = view;
  elements.tabButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  elements.questionList.classList.toggle('hidden', view !== 'cards');
  elements.jsonView.classList.toggle('hidden', view !== 'json');
}

function renderHistory() {
  const history = readJson(STORAGE_KEYS.history, []);
  elements.historyList.innerHTML = '';
  if (!history.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '저장된 생성 이력이 없습니다.';
    elements.historyList.appendChild(empty);
    return;
  }

  history.forEach((result) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const types = (result.meta?.types || []).map((type) => TYPE_LABELS[type] || type).join(', ');
    item.innerHTML = `
      <div>
        <strong></strong>
        <span></span>
      </div>
      <button class="ghost-button" type="button">열기</button>
    `;
    item.querySelector('strong').textContent = `${result.items.length}문항 · ${DIFFICULTY_LABELS[result.meta?.level] || '보통'}`;
    item.querySelector('span').textContent = `${formatDate(result.meta?.createdAt || new Date())} · ${types || '혼합'}`;
    item.querySelector('button').addEventListener('click', () => displayResult(result, true));
    elements.historyList.appendChild(item);
  });
}

function copyAll() {
  if (!state.currentResult) {
    showInputMessage('복사할 생성 결과가 없습니다.', 'error');
    return;
  }

  const text = state.currentResult.items.map((item, index) => {
    const choices = Array.isArray(item.choices) && item.choices.length
      ? item.choices.map((choice, choiceIndex) => `${choiceLabel(choiceIndex)}. ${choice}`).join('\n')
      : '';
    return [
      `Q${index + 1}. ${item.question}`,
      choices,
      `정답: ${item.answer}`,
      `해설: ${item.explanation}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  navigator.clipboard.writeText(text)
    .then(() => showInputMessage('생성 결과를 클립보드에 복사했습니다.', 'ok'))
    .catch(() => showInputMessage('브라우저 권한 때문에 복사하지 못했습니다.', 'error'));
}

function clearWorkspace() {
  elements.studyText.value = '';
  state.currentResult = null;
  elements.questionList.innerHTML = '';
  elements.jsonView.textContent = '';
  elements.resultSummary.textContent = '아직 생성된 문제가 없습니다.';
  elements.statusText.textContent = '학습 텍스트를 입력하고 문제를 생성하세요.';
  elements.jobLabel.textContent = 'Job 없음';
  elements.latestStat.textContent = '없음';
  elements.validationStat.textContent = '대기';
  elements.costStat.textContent = '$0';
  resetSteps();
  validateInput();
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.history);
  renderHistory();
}

function showInputMessage(message, type) {
  elements.inputMessage.textContent = message;
  elements.inputMessage.className = 'field-message';
  if (type) elements.inputMessage.classList.add(type);
}

function setStep(step, status) {
  const item = elements.steps.querySelector(`[data-step="${step}"]`);
  if (item) item.classList.add('done');
  elements.statusText.textContent = status;
}

function resetSteps() {
  elements.steps.querySelectorAll('li').forEach((item) => item.classList.remove('done'));
}

function checkQuota() {
  const usage = getUsage();
  const now = Date.now();
  const recentMinute = usage.events.filter((time) => now - time < 60_000);
  const todayCount = getTodayCount(usage);
  if (todayCount >= LIMITS.dailyGenerations) return { ok: false, message: '오늘 생성 한도를 초과했습니다.' };
  if (recentMinute.length >= LIMITS.minuteGenerations) return { ok: false, message: '요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.' };
  return { ok: true };
}

function incrementUsage() {
  const usage = getUsage();
  const today = todayKey();
  usage.days[today] = (usage.days[today] || 0) + 1;
  usage.events = usage.events.filter((time) => Date.now() - time < 60_000);
  usage.events.push(Date.now());
  writeJson(STORAGE_KEYS.usage, usage);
}

function updateUsageUI() {
  const count = getTodayCount(getUsage());
  elements.dailyUsage.textContent = `${count} / ${LIMITS.dailyGenerations}`;
  elements.dailyMeter.style.width = `${Math.min(100, (count / LIMITS.dailyGenerations) * 100)}%`;
}

function getUsage() {
  const usage = readJson(STORAGE_KEYS.usage, { days: {}, events: [] });
  usage.days = usage.days || {};
  usage.events = Array.isArray(usage.events) ? usage.events : [];
  return usage;
}

function getTodayCount(usage) {
  return usage.days[todayKey()] || 0;
}

function updateCacheStat() {
  elements.cacheStat.textContent = `${Object.keys(readCache()).length}건`;
}

function readCache() {
  return readJson(STORAGE_KEYS.cache, {});
}

function saveCache(key, result) {
  const cache = readCache();
  cache[key] = result;
  const entries = Object.entries(cache)
    .sort((a, b) => new Date(b[1].meta?.createdAt || 0) - new Date(a[1].meta?.createdAt || 0))
    .slice(0, LIMITS.cacheLimit);
  writeJson(STORAGE_KEYS.cache, Object.fromEntries(entries));
}

function saveHistory(result) {
  const history = readJson(STORAGE_KEYS.history, []);
  const id = result.meta?.questionSetId;
  const next = [result, ...history.filter((item) => item.meta?.questionSetId !== id)].slice(0, LIMITS.historyLimit);
  writeJson(STORAGE_KEYS.history, next);
}

function buildCacheKey(request) {
  return hashString(JSON.stringify({
    text: request.text,
    difficulty: request.difficulty,
    count: request.count,
    questionTypes: request.questionTypes,
  }));
}

function normalizeLegacyQuestions(questions) {
  return questions.map((item) => ({
    type: item.type || (Array.isArray(item.options) ? 'multiple-choice' : 'short-answer'),
    question: item.question,
    choices: Array.isArray(item.options) ? item.options : [],
    answer: item.answer,
    explanation: item.explanation,
    difficulty: item.difficulty || 'medium',
    topic: item.topic || '학습 주제',
    createdAt: item.createdAt || new Date().toISOString(),
  }));
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function choiceLabel(index) {
  return ['A', 'B', 'C', 'D'][index] || String(index + 1);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
