// main.js
// Simple SPA logic: send input to backend /api/generate-quiz and render results.
const studyText = document.getElementById('studyText');
const difficultySelect = document.getElementById('difficulty');
const countInput = document.getElementById('count');
const questionTypeSelect = document.getElementById('questionType');
const generateBtn = document.getElementById('generateBtn');
const statusText = document.getElementById('statusText');
const resultsEl = document.getElementById('results');

const API_BASE = 'http://localhost:4000';

generateBtn.addEventListener('click', () => {
  const text = (studyText.value || '').trim();
  const level = difficultySelect.value;
  const count = Number(countInput.value) || 5;
  const type = questionTypeSelect.value;

  if (!text) {
    statusText.textContent = '학습 노트를 입력하세요.';
    return;
  }

  requestQuiz({ text, level, count, type });
});

async function requestQuiz(payload) {
  setLoading(true, '퀴즈 생성 중...');

  try {
    const res = await fetch(`${API_BASE}/api/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail.message || `요청 실패 (status ${res.status})`);
    }

    const data = await res.json();
    const questions = Array.isArray(data.questions) ? data.questions : [];
    renderQuestions(questions, data.meta || {});
    statusText.textContent = '생성 완료';
  } catch (err) {
    console.error(err);
    statusText.textContent = `오류: ${err.message}`;
    resultsEl.innerHTML = `<p class="muted">문제를 불러오지 못했습니다. 다시 시도해 주세요.</p>`;
  } finally {
    setLoading(false);
  }
}

function renderQuestions(questions, meta) {
  if (!questions.length) {
    resultsEl.innerHTML = '<p class="muted">문제가 없습니다.</p>';
    return;
  }

  resultsEl.innerHTML = '';
  questions.forEach((q) => {
    const card = document.createElement('article');
    card.className = 'question-card';

    const metaLevel = meta.level || 'quiz';
    const metaType = q.type || meta.type || 'quiz';

    const head = document.createElement('div');
    head.className = 'question-head';
    head.innerHTML = `
      <div><strong>${q.question}</strong></div>
      <div class="badge-row">
        <span class="badge">${metaLevel}</span>
        <span class="badge">${metaType}</span>
      </div>
    `;
    card.appendChild(head);

    const opts = Array.isArray(q.options) ? q.options : null;
    // 객관식일 경우 정답을 선택지와 매칭해 표시(A/B/C/D). 없으면 첫 번째 선택지를 기본값으로 사용.
    let answerText = q.answer || 'N/A';
    if (opts && opts.length) {
      const idx = opts.findIndex(
        (opt) => typeof opt === 'string' && typeof q.answer === 'string' && opt.trim() === q.answer.trim()
      );
      const resolvedIdx = idx >= 0 ? idx : 0;
      const resolvedOpt = opts[resolvedIdx] || '선택지 없음';
      answerText = `${String.fromCharCode(65 + resolvedIdx)}. ${resolvedOpt}`;
    }

    if (opts) {
      const ul = document.createElement('ul');
      ul.className = 'choices';
      opts.forEach((opt, idx) => {
        const li = document.createElement('li');
        li.textContent = `${String.fromCharCode(65 + idx)}. ${opt}`;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-btn';
    toggleBtn.textContent = '정답/해설 보기';

    const answerBlock = document.createElement('div');
    answerBlock.className = 'answer-block hidden';
    answerBlock.innerHTML = `
      <p class="meta"><strong>정답:</strong> ${answerText}</p>
      <p class="meta"><strong>해설:</strong> ${q.explanation || ''}</p>
    `;

    toggleBtn.addEventListener('click', () => {
      const willShow = answerBlock.classList.contains('hidden');
      answerBlock.classList.toggle('hidden', !willShow);
      toggleBtn.textContent = willShow ? '정답/해설 숨기기' : '정답/해설 보기';
    });

    card.appendChild(toggleBtn);
    card.appendChild(answerBlock);

    resultsEl.appendChild(card);
  });
}

function setLoading(isLoading, message = '') {
  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? message : '문제 생성';
}
