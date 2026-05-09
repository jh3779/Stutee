/* main.js — 문제 생성 페이지 전용 (index.html) */
/* shared.js가 먼저 로드되어 있어야 합니다. */

const LIMITS = {
  minChars:          80,
  maxChars:          5000,
  dailyGenerations:  20,
  minuteGenerations: 5,
  cacheLimit:        40,
  historyLimit:      12,
};

const SAMPLE_TEXT = `클라우드 컴퓨팅은 인터넷을 통해 서버, 저장소, 데이터베이스, 네트워크, 소프트웨어와 같은 컴퓨팅 자원을 필요한 만큼 사용하는 방식이다. 사용자는 직접 물리 서버를 구매하지 않아도 되고, 사용량에 따라 비용을 지불할 수 있다. AWS의 VPC는 사용자가 정의한 가상 네트워크로, public subnet과 private subnet을 나누어 보안 경계를 만들 수 있다. Application Load Balancer는 사용자 요청을 여러 EC2 인스턴스로 분산하며, Auto Scaling Group은 트래픽 증가에 따라 인스턴스 수를 자동으로 조정한다. RDS Multi-AZ는 장애 발생 시 대기 인스턴스로 전환하여 데이터베이스 가용성을 높인다. SQS는 비동기 작업을 큐에 저장하여 웹 요청 처리와 시간이 오래 걸리는 작업을 분리하는 데 사용된다. Redis는 캐시와 rate limit에 활용할 수 있으며, CloudWatch는 로그와 지표를 수집해 장애 상황을 빠르게 파악하도록 돕는다.`;

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:4000' : '';

const el = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  updateUsageUI();
  updateCacheStat();
  validateInput();
});

function bindElements() {
  Object.assign(el, {
    form:           document.querySelector('#generator'),
    studyText:      document.querySelector('#studyText'),
    charCount:      document.querySelector('#charCount'),
    inputMessage:   document.querySelector('#inputMessage'),
    count:          document.querySelector('#count'),
    countValue:     document.querySelector('#countValue'),
    generateBtn:    document.querySelector('#generateBtn'),
    sampleBtn:      document.querySelector('#sampleBtn'),
    resetBtn:       document.querySelector('#resetBtn'),
    statusText:     document.querySelector('#statusText'),
    jobLabel:       document.querySelector('#jobLabel'),
    steps:          document.querySelector('#steps'),
    cacheStat:      document.querySelector('#cacheStat'),
    latestStat:     document.querySelector('#latestStat'),
    validationStat: document.querySelector('#validationStat'),
    costStat:       document.querySelector('#costStat'),
    successCta:     document.querySelector('#successCta'),
  });
}

function bindEvents() {
  el.studyText.addEventListener('input', validateInput);
  el.count.addEventListener('input', () => {
    el.countValue.textContent = el.count.value;
  });
  el.form.addEventListener('submit', handleGenerate);
  el.sampleBtn.addEventListener('click', () => {
    el.studyText.value = SAMPLE_TEXT;
    validateInput();
    el.studyText.focus();
  });
  el.resetBtn.addEventListener('click', clearWorkspace);
}

/* ── 생성 핸들러 ── */
async function handleGenerate(event) {
  event.preventDefault();

  const request    = getRequest();
  const validation = validateRequest(request);
  if (!validation.ok) { showMsg(validation.message, 'error'); return; }

  const quota = checkQuota();
  if (!quota.ok) { showMsg(quota.message, 'error'); return; }

  const cacheKey = buildCacheKey(request);
  const cached   = readJson(STORAGE_KEYS.cache, {})[cacheKey];
  const jobId    = `job_${Date.now().toString(36)}`;

  el.jobLabel.textContent  = jobId;
  el.generateBtn.disabled  = true;
  el.successCta.classList.add('hidden');
  resetSteps();

  try {
    setStep('input', '입력 검증 완료');
    await wait(120);
    setStep('cache', '캐시 확인 중');

    if (cached) {
      await wait(160);
      setStep('api',      '캐시 결과 사용');
      setStep('validate', '검증 완료');
      setStep('save',     '저장 완료');
      finishGeneration(cached);
      showMsg('동일 조건의 캐시 결과를 불러왔습니다.', 'ok');
      return;
    }

    setStep('api', '백엔드 요청 중');
    const result = await requestQuiz(request);
    setStep('validate', '결과 검증 중');

    const rv = validateResult(result);
    if (!rv.ok) throw new Error(rv.message);

    setStep('save', '저장 완료');
    incrementUsage();
    saveCache(cacheKey, result);
    saveHistory(result);
    finishGeneration(result);
    showMsg('문제 생성이 완료되었습니다.', 'ok');
  } catch (err) {
    el.statusText.textContent      = '생성 실패';
    el.validationStat.textContent  = '실패';
    showMsg(err.message || '문제 생성 중 오류가 발생했습니다.', 'error');
  } finally {
    el.generateBtn.disabled = false;
    updateUsageUI();
    updateCacheStat();
  }
}

function finishGeneration(result) {
  /* localStorage에 현재 결과 저장 → results.html에서 읽음 */
  writeJson(STORAGE_KEYS.currentResult, result);

  el.latestStat.textContent    = `${result.items.length}문항`;
  el.validationStat.textContent = '통과';
  el.costStat.textContent      = `$${Number(result.usage?.estimatedCostUsd || 0).toFixed(6)}`;
  el.statusText.textContent    = `${result.items.length}문항 생성 완료`;

  /* 결과 보기 CTA 표시 */
  el.successCta.classList.remove('hidden');
}

/* ── API 요청 ── */
async function requestQuiz(request) {
  const response = await fetch(`${API_BASE}/api/generate-quiz`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      text:          request.text,
      difficulty:    request.difficulty,
      count:         request.count,
      questionTypes: request.questionTypes,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || `요청 실패 (${response.status})`);
  }

  const items = Array.isArray(data.items)
    ? data.items
    : normalizeLegacy(data.questions || []);

  return {
    meta:  data.meta  || {},
    usage: data.usage || { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    items,
  };
}

/* ── 입력/요청 검증 ── */
function getRequest() {
  return {
    text:          normalizeText(el.studyText.value),
    difficulty:    document.querySelector('input[name="difficulty"]:checked').value,
    count:         Number(el.count.value) || 5,
    questionTypes: Array.from(
      document.querySelectorAll('input[name="questionType"]:checked')
    ).map((i) => i.value),
  };
}

function validateInput() {
  const length = el.studyText.value.trim().length;
  el.charCount.textContent = `${length} / ${LIMITS.maxChars}`;
  const v = validateRequest(getRequest(), true);
  if (!length)    showMsg('', '');
  else if (v.ok)  showMsg('입력 조건이 유효합니다.', 'ok');
  else            showMsg(v.message, 'error');
}

function validateRequest(req, soft = false) {
  if (!req.text && soft)             return { ok: false, message: '' };
  if (req.text.length < LIMITS.minChars) return { ok: false, message: `원문은 최소 ${LIMITS.minChars}자 이상이어야 합니다.` };
  if (req.text.length > LIMITS.maxChars) return { ok: false, message: `원문은 최대 ${LIMITS.maxChars}자까지 입력할 수 있습니다.` };
  if (!req.questionTypes.length)     return { ok: false, message: '문제 유형을 하나 이상 선택하세요.' };
  if (/(.)\1{24,}/.test(req.text))   return { ok: false, message: '반복 문자가 너무 많습니다.' };
  return { ok: true };
}

function validateResult(result) {
  if (!result?.items?.length) return { ok: false, message: '생성된 문제가 없습니다.' };
  for (const item of result.items) {
    if (!item.question || !item.answer || !item.explanation)
      return { ok: false, message: '문제 응답 구조가 올바르지 않습니다.' };
    if (item.type === 'multiple-choice' &&
        (!Array.isArray(item.choices) || !item.choices.includes(item.answer)))
      return { ok: false, message: '객관식 정답이 선택지에 없습니다.' };
  }
  return { ok: true };
}

/* ── 쿼터 ── */
function checkQuota() {
  const usage  = getUsage();
  const now    = Date.now();
  const recent = usage.events.filter((t) => now - t < 60_000);
  if (getTodayCount(usage) >= LIMITS.dailyGenerations)  return { ok: false, message: '오늘 생성 한도를 초과했습니다.' };
  if (recent.length >= LIMITS.minuteGenerations)         return { ok: false, message: '요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.' };
  return { ok: true };
}

function incrementUsage() {
  const usage = getUsage();
  const today = todayKey();
  usage.days[today] = (usage.days[today] || 0) + 1;
  usage.events = usage.events.filter((t) => Date.now() - t < 60_000);
  usage.events.push(Date.now());
  writeJson(STORAGE_KEYS.usage, usage);
}

function updateUsageUI() {
  const count = getTodayCount(getUsage());
  const dailyUsage = document.querySelector('#dailyUsage');
  const dailyMeter = document.querySelector('#dailyMeter');
  if (dailyUsage) dailyUsage.textContent = `${count} / ${LIMITS.dailyGenerations}`;
  if (dailyMeter) dailyMeter.style.width = `${Math.min(100, (count / LIMITS.dailyGenerations) * 100)}%`;
}

/* ── 캐시 ── */
function updateCacheStat() {
  const count = Object.keys(readJson(STORAGE_KEYS.cache, {})).length;
  if (el.cacheStat) el.cacheStat.textContent = `${count}건`;
}

function saveCache(key, result) {
  const cache   = readJson(STORAGE_KEYS.cache, {});
  cache[key]    = result;
  const entries = Object.entries(cache)
    .sort((a, b) => new Date(b[1].meta?.createdAt || 0) - new Date(a[1].meta?.createdAt || 0))
    .slice(0, LIMITS.cacheLimit);
  writeJson(STORAGE_KEYS.cache, Object.fromEntries(entries));
}

function saveHistory(result) {
  const history = readJson(STORAGE_KEYS.history, []);
  const id      = result.meta?.questionSetId;
  const next    = [result, ...history.filter((i) => i.meta?.questionSetId !== id)]
    .slice(0, LIMITS.historyLimit);
  writeJson(STORAGE_KEYS.history, next);
}

function buildCacheKey(req) {
  return hashString(JSON.stringify({
    text: req.text, difficulty: req.difficulty,
    count: req.count, questionTypes: req.questionTypes,
  }));
}

/* ── UI 헬퍼 ── */
function showMsg(message, type) {
  el.inputMessage.textContent = message;
  el.inputMessage.className   = 'field-msg';
  if (type) el.inputMessage.classList.add(type);
}

function setStep(step, status) {
  const item = el.steps.querySelector(`[data-step="${step}"]`);
  if (item) item.classList.add('done');
  el.statusText.textContent = status;
}

function resetSteps() {
  el.steps.querySelectorAll('li').forEach((li) => li.classList.remove('done'));
}

function clearWorkspace() {
  el.studyText.value            = '';
  el.statusText.textContent     = '학습 텍스트를 입력하고 문제를 생성하세요.';
  el.jobLabel.textContent       = 'Job 없음';
  el.latestStat.textContent     = '없음';
  el.validationStat.textContent = '대기';
  el.costStat.textContent       = '$0';
  el.successCta.classList.add('hidden');
  resetSteps();
  validateInput();
}

/* ── 유틸 ── */
function normalizeText(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

function normalizeLegacy(questions) {
  return questions.map((item) => ({
    type:        item.type || (Array.isArray(item.options) ? 'multiple-choice' : 'short-answer'),
    question:    item.question,
    choices:     Array.isArray(item.options) ? item.options : [],
    answer:      item.answer,
    explanation: item.explanation,
    difficulty:  item.difficulty || 'medium',
    topic:       item.topic || '학습 주제',
    createdAt:   item.createdAt || new Date().toISOString(),
  }));
}
