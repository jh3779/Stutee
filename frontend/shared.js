/* shared.js — 모든 페이지에서 공통으로 로드되는 유틸리티 */

const STORAGE_KEYS = {
  history:       'stutee.history.v2',
  cache:         'stutee.cache.v2',
  usage:         'stutee.usage.v2',
  currentResult: 'stutee.current.v2',
  auth:          'stutee.auth.v1',
};

const STUTEE_API_BASE = window.location.protocol === 'file:' ? 'http://localhost:4000' : '';

const TYPE_LABELS = {
  'multiple-choice': '객관식',
  'short-answer':    '주관식',
  'true-false':      'OX',
  'fill-blank':      '빈칸',
};

const TYPE_CLASS = {
  'multiple-choice': 'mc',
  'short-answer':    'sa',
  'true-false':      'tf',
  'fill-blank':      'fb',
};

const DIFFICULTY_LABELS = {
  easy:   '쉬움',
  medium: '보통',
  hard:   '어려움',
};

const PLAN_LABELS = {
  free: '무료',
  student: '학생',
  pro: '프로',
};

/* ── Storage ── */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ── Auth ── */
function getAuthSession() {
  const session = readJson(STORAGE_KEYS.auth, null);
  if (!session?.token || !session?.user) return null;
  return session;
}

function setAuthSession(session) {
  writeJson(STORAGE_KEYS.auth, session);
  renderTopbarAuth();
  renderProfilePanel();
  initSidebarQuota();
  window.dispatchEvent(new Event('stutee-auth-change'));
}

function clearAuthSession() {
  localStorage.removeItem(STORAGE_KEYS.auth);
  renderTopbarAuth();
  renderProfilePanel();
  initSidebarQuota();
  window.dispatchEvent(new Event('stutee-auth-change'));
}

function getAuthHeaders() {
  const session = getAuthSession();
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

async function stuteeApi(path, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...getAuthHeaders(),
    ...(options.headers || {}),
  };

  const response = await fetch(`${STUTEE_API_BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && data?.error?.code === 'AUTH_REQUIRED') {
    clearAuthSession();
  }

  if (!response.ok || data.success === false) {
    const error = new Error(data?.error?.message || data?.message || `요청 실패 (${response.status})`);
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }

  return data;
}

async function refreshAuthSession() {
  const session = getAuthSession();
  if (!session) return null;

  try {
    const data = await stuteeApi('/api/me');
    const next = {
      ...session,
      user: data.user,
      quota: data.quota,
      historyCount: data.historyCount,
    };
    writeJson(STORAGE_KEYS.auth, next);
    renderTopbarAuth();
    renderProfilePanel();
    initSidebarQuota();
    return next;
  } catch {
    clearAuthSession();
    return null;
  }
}

function setAuthQuota(quota) {
  const session = getAuthSession();
  if (!session) return;
  writeJson(STORAGE_KEYS.auth, { ...session, quota });
  initSidebarQuota();
  window.dispatchEvent(new Event('stutee-auth-change'));
}

function requireLoginMessage(target) {
  const message = '로그인 후 문제를 생성할 수 있습니다.';
  if (target) {
    target.textContent = message;
    target.className = `${target.className.split(' ')[0]} error`;
  }
  window.location.href = 'login.html';
  return { ok: false, message };
}

function renderTopbarAuth() {
  const button = document.querySelector('#topbarAuth');
  if (!button) return;
  const session = getAuthSession();
  if (session) {
    button.textContent = '프로필';
    button.setAttribute('href', 'profile.html');
    return;
  }
  button.textContent = '로그인';
  button.setAttribute('href', 'login.html');
}

function renderProfilePanel() {
  const panel = document.querySelector('#profilePanel');
  if (!panel) return;

  const session = getAuthSession();
  if (!session) {
    panel.innerHTML = `
      <div class="user-card">
        <div class="user-avatar">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
        </div>
        <div class="user-meta">
          <strong>게스트</strong>
          <span>비로그인 상태</span>
        </div>
      </div>
      <a class="login-cta" href="login.html">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 011-1h10a1 1 0 011 1v3a1 1 0 01-2 0V4H5v12h8v-2a1 1 0 112 0v3a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm13.707 7.707a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 9H8a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3z" clip-rule="evenodd"/></svg>
        로그인 / 회원가입
      </a>
    `;
    return;
  }

  const user = session.user;
  const quota = session.quota;
  const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
  panel.innerHTML = `
    <div class="user-card">
      <div class="user-avatar user-avatar--logged-in">${escapeHtml(initial)}</div>
      <div class="user-meta">
        <strong>${escapeHtml(user.name || user.email)}</strong>
        <span>${PLAN_LABELS[user.plan] || user.plan} 플랜 · ${quota?.remaining ?? '-'}회 남음</span>
      </div>
    </div>
    <a class="user-profile-link" href="profile.html">
      <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
      프로필 보기
    </a>
  `;
}

async function logoutCurrentSession() {
  try {
    await stuteeApi('/api/auth/logout', { method: 'POST' });
  } catch {
    // 서버 세션이 이미 만료돼도 로컬 세션은 정리한다.
  }
  clearAuthSession();
}

/* ── Utils ── */
function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash  = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function choiceLabel(i) { return ['A', 'B', 'C', 'D'][i] || String(i + 1); }

/* ── Usage ── */
function getUsage() {
  const u = readJson(STORAGE_KEYS.usage, { days: {}, events: [] });
  u.days   = u.days   || {};
  u.events = Array.isArray(u.events) ? u.events : [];
  return u;
}

function getTodayCount(usage) { return usage.days[todayKey()] || 0; }

/* ── 사이드바 쿼터 초기화 (모든 페이지) ── */
function initSidebarQuota() {
  const el  = document.querySelector('#dailyUsage');
  const bar = document.querySelector('#dailyMeter');
  if (!el || !bar) return;
  const session = getAuthSession();
  const quota = session?.quota;
  const count = quota ? quota.dailyCount : getTodayCount(getUsage());
  const limit = quota ? quota.dailyLimit : 20;
  el.textContent = `${count} / ${limit}`;
  bar.style.width = `${Math.min(100, (count / limit) * 100)}%`;
  const hint = document.querySelector('.quota-hint');
  if (hint) {
    hint.textContent = session ? `${PLAN_LABELS[session.user.plan] || session.user.plan} 플랜 · 서버 저장` : '게스트 · 분당 최대 5회';
  }
}

/* ── 질문 카드 렌더 (결과/이력 페이지 공유) ── */
function renderQuestionsInto(container, items, template) {
  container.innerHTML = '';

  if (!items || !items.length) {
    const empty = document.createElement('div');
    empty.className   = 'empty-state';
    empty.textContent = '표시할 문제가 없습니다.';
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);

    const typePill = node.querySelector('.pill.type');
    typePill.textContent = TYPE_LABELS[item.type] || item.type;
    typePill.classList.add(TYPE_CLASS[item.type] || 'mc');

    node.querySelector('.pill.difficulty').textContent =
      DIFFICULTY_LABELS[item.difficulty] || item.difficulty || '보통';
    node.querySelector('.q-topic').textContent = item.topic || '학습 주제';
    node.querySelector('.q-text').textContent  = item.question;

    const choices = node.querySelector('.choices');
    if (Array.isArray(item.choices) && item.choices.length) {
      item.choices.forEach((choice, ci) => {
        const row = document.createElement('div');
        row.className = 'choice';
        row.innerHTML = `<strong>${choiceLabel(ci)}</strong><span></span>`;
        row.querySelector('span').textContent = choice;
        choices.appendChild(row);
      });
    } else {
      choices.classList.add('hidden');
    }

    const answerBox = node.querySelector('.answer-box');
    answerBox.querySelector('strong').textContent = `정답: ${item.answer}`;
    answerBox.querySelector('p').textContent      = item.explanation;

    node.querySelector('.answer-toggle').addEventListener('click', (ev) => {
      answerBox.classList.toggle('hidden');
      ev.currentTarget.textContent = answerBox.classList.contains('hidden')
        ? '정답 보기' : '정답 숨기기';
    });

    container.appendChild(node);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── DOMContentLoaded 훅 ── */
document.addEventListener('DOMContentLoaded', () => {
  renderTopbarAuth();
  renderProfilePanel();
  initSidebarQuota();
  refreshAuthSession();
});
