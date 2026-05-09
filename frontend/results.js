/* results.js — 생성 결과 페이지 전용 (results.html) */
/* shared.js가 먼저 로드되어 있어야 합니다. */

const el = {};
let currentResult = null;

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  loadResult();
});

function bindElements() {
  Object.assign(el, {
    resultSummary: document.querySelector('#resultSummary'),
    noResultPanel: document.querySelector('#noResultPanel'),
    resultsPanel:  document.querySelector('#resultsPanel'),
    questionList:  document.querySelector('#questionList'),
    jsonView:      document.querySelector('#jsonView'),
    copyBtn:       document.querySelector('#copyBtn'),
    tabButtons:    Array.from(document.querySelectorAll('.tab-btn')),
    template:      document.querySelector('#questionTemplate'),
  });
}

function bindEvents() {
  el.copyBtn.addEventListener('click', copyAll);
  el.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

/* ── 결과 로드 ── */
function loadResult() {
  const result = readJson(STORAGE_KEYS.currentResult, null);

  if (!result || !Array.isArray(result.items) || !result.items.length) {
    showNoResult();
    return;
  }

  currentResult = result;
  showResult(result);
}

function showNoResult() {
  el.noResultPanel.classList.remove('hidden');
  el.resultsPanel.classList.add('hidden');
}

function showResult(result) {
  el.noResultPanel.classList.add('hidden');
  el.resultsPanel.classList.remove('hidden');

  const types = (result.meta?.types || [])
    .map((t) => TYPE_LABELS[t] || t).join(', ');
  const difficulty = DIFFICULTY_LABELS[result.meta?.level] || '보통';
  const date       = formatDate(result.meta?.createdAt || new Date());
  const source     = result.meta?.source || 'local';

  el.resultSummary.textContent =
    `${result.items.length}문항 · ${difficulty} · ${types || '혼합'} · ${date} · ${source}`;

  renderQuestionsInto(el.questionList, result.items, el.template);
  renderJson(result);
  switchView('cards');
}

/* ── 렌더 ── */
function renderJson(result) {
  el.jsonView.textContent = JSON.stringify({
    items: result.items.map((item) => ({
      type:        item.type,
      question:    item.question,
      choices:     item.choices,
      answer:      item.answer,
      explanation: item.explanation,
      difficulty:  item.difficulty,
      topic:       item.topic,
      createdAt:   item.createdAt,
    })),
  }, null, 2);
}

function switchView(view) {
  el.tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  el.questionList.classList.toggle('hidden', view !== 'cards');
  el.jsonView.classList.toggle('hidden',     view !== 'json');
}

/* ── 전체 복사 ── */
function copyAll() {
  if (!currentResult) return;

  const text = currentResult.items.map((item, i) => {
    const choices = Array.isArray(item.choices) && item.choices.length
      ? item.choices.map((c, ci) => `${choiceLabel(ci)}. ${c}`).join('\n')
      : '';
    return [
      `Q${i + 1}. ${item.question}`,
      choices,
      `정답: ${item.answer}`,
      `해설: ${item.explanation}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  navigator.clipboard.writeText(text).catch(() => {});
}
