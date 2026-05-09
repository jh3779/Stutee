/* history.js — 생성 이력 페이지 전용 (history.html) */
/* shared.js가 먼저 로드되어 있어야 합니다. */

const el = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  renderHistory();
});

function bindElements() {
  Object.assign(el, {
    historyCount:    document.querySelector('#historyCount'),
    noHistoryPanel:  document.querySelector('#noHistoryPanel'),
    historyPanel:    document.querySelector('#historyPanel'),
    historyList:     document.querySelector('#historyList'),
    clearHistoryBtn: document.querySelector('#clearHistoryBtn'),
  });
}

function bindEvents() {
  el.clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('생성 이력을 모두 삭제하시겠습니까?')) return;
    localStorage.removeItem(STORAGE_KEYS.history);
    renderHistory();
  });
}

/* ── 이력 렌더 ── */
function renderHistory() {
  const history = readJson(STORAGE_KEYS.history, []);
  el.historyList.innerHTML = '';

  if (!history.length) {
    el.noHistoryPanel.classList.remove('hidden');
    el.historyPanel.classList.add('hidden');
    el.historyCount.textContent = '저장된 이력이 없습니다.';
    return;
  }

  el.noHistoryPanel.classList.add('hidden');
  el.historyPanel.classList.remove('hidden');
  el.historyCount.textContent = `총 ${history.length}건의 이력이 있습니다.`;

  history.forEach((result, index) => {
    const types = (result.meta?.types || [])
      .map((t) => TYPE_LABELS[t] || t).join(' · ');
    const difficulty = DIFFICULTY_LABELS[result.meta?.level] || '보통';
    const date       = formatDate(result.meta?.createdAt || new Date());

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-index">${history.length - index}</div>
      <div class="history-info">
        <strong>${result.items.length}문항 · ${difficulty}</strong>
        <span>${types || '혼합'} · ${date}</span>
      </div>
      <div class="history-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-action="open">결과 보기</button>
      </div>
    `;

    item.querySelector('[data-action="open"]').addEventListener('click', () => {
      openResult(result);
    });

    el.historyList.appendChild(item);
  });
}

/* 이력 항목 열기 → currentResult에 저장 후 results.html로 이동 */
function openResult(result) {
  writeJson(STORAGE_KEYS.currentResult, result);
  window.location.href = 'results.html';
}
