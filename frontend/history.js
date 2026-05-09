/* history.js — 생성 이력 페이지 전용 (history.html) */
/* shared.js가 먼저 로드되어 있어야 합니다. */

const el = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  renderHistory();
});
window.addEventListener('stutee-auth-change', renderHistory);

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
  el.clearHistoryBtn.addEventListener('click', async () => {
    if (!confirm('생성 이력을 모두 삭제하시겠습니까?')) return;
    if (getAuthSession()) {
      try {
        await stuteeApi('/api/history', { method: 'DELETE' });
      } catch (error) {
        alert(error.message || '이력 삭제에 실패했습니다.');
      }
    }
    localStorage.removeItem(STORAGE_KEYS.history);
    renderHistory();
  });
}

/* ── 이력 렌더 ── */
async function renderHistory() {
  const history = await loadHistory();
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

async function loadHistory() {
  if (!getAuthSession()) {
    el.historyCount.textContent = '로그인하면 사용자별 생성 이력을 확인할 수 있습니다.';
    return [];
  }

  try {
    const data = await stuteeApi('/api/history');
    writeJson(STORAGE_KEYS.history, data.history || []);
    return data.history || [];
  } catch {
    return readJson(STORAGE_KEYS.history, []);
  }
}

/* 이력 항목 열기 → currentResult에 저장 후 results.html로 이동 */
function openResult(result) {
  writeJson(STORAGE_KEYS.currentResult, result);
  window.location.href = 'results.html';
}
