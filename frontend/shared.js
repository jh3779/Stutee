/* shared.js — 모든 페이지에서 공통으로 로드되는 유틸리티 */

const STORAGE_KEYS = {
  history:       'stutee.history.v2',
  cache:         'stutee.cache.v2',
  usage:         'stutee.usage.v2',
  currentResult: 'stutee.current.v2',
};

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
  const count = getTodayCount(getUsage());
  el.textContent    = `${count} / 20`;
  bar.style.width   = `${Math.min(100, (count / 20) * 100)}%`;
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

/* ── DOMContentLoaded 훅 ── */
document.addEventListener('DOMContentLoaded', initSidebarQuota);
