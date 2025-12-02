const sourceText = document.getElementById('sourceText');
const countSelect = document.getElementById('countSelect');
const levelSelect = document.getElementById('levelSelect');
const typeSelect = document.getElementById('typeSelect');
const generateBtn = document.getElementById('generateBtn');
const resultsContainer = document.getElementById('resultsContainer');
const copyAllBtn = document.getElementById('copyAllBtn');
const translateBtn = document.getElementById('translateBtn');
const langSelect = document.getElementById('langSelect');

let baseProblems = [];
let currentProblems = [];
let lastMeta = {};

generateBtn.addEventListener('click', () => {
  const count = Number(countSelect.value);
  const level = levelSelect.value;
  const type = typeSelect.value;
  const text = sourceText.value.trim();

  const useBackend = true;

  if (useBackend) {
    requestProblems({ count, level, type, text });
  } else {
    const dummy = createDummyProblems({ count, level, type, text });
    renderProblems(dummy, { level, type });
  }
});

async function requestProblems(payload) {
  generateBtn.disabled = true;
  generateBtn.textContent = '생성 중...';
  try {
    const res = await fetch('http://localhost:4000/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }

    const data = await res.json();
    const items = data.items || [];
    renderProblems(items, data.meta || payload);
  } catch (err) {
    console.error(err);
    resultsContainer.innerHTML = `<p class="muted">문제 불러오기 실패. 다시 시도해 주세요.</p>`;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '문제 생성';
  }
}

function createDummyProblems({ count, level, type, text }) {
  const baseText = text || '광합성과 에너지 순환에 대한 학습 노트 예시.';
  const problems = [];

  for (let i = 1; i <= count; i += 1) {
    const isMultiple =
      type === 'multiple-choice' ? true : type === 'short-answer' ? false : i % 2 === 1;

    const choices = isMultiple
      ? ['Option A', 'Option B', 'Option C', 'Option D'].map(
          (choice, idx) => `${choice} - detail ${idx + 1}`
        )
      : null;

    problems.push({
      id: i,
      question: `Q${i}. Based on: ${baseText}`,
      choices,
      answer: isMultiple ? 'Option B' : 'Short-form answer text',
      explanation: 'Brief explanation for why this is the correct answer.',
    });
  }

  return problems;
}

function renderProblems(problems, meta) {
  if (!problems.length) {
    resultsContainer.innerHTML = '<p class="muted">아직 문제가 없습니다.</p>';
    if (copyAllBtn) copyAllBtn.disabled = true;
    if (translateBtn) translateBtn.disabled = true;
    baseProblems = [];
    currentProblems = [];
    lastMeta = meta || {};
    return;
  }

  resultsContainer.innerHTML = '';

  problems.forEach((problem) => {
    const card = document.createElement('article');
    card.className = 'question-card';

    const head = document.createElement('div');
    head.className = 'question-head';
    head.innerHTML = `
      <div>
        <strong>${problem.question}</strong>
      </div>
      <span class="badge">${meta.type}</span>
    `;

    const metaLine = document.createElement('p');
    metaLine.className = 'meta';
    metaLine.textContent = `Difficulty: ${meta.level}`;

    card.appendChild(head);
    card.appendChild(metaLine);

    if (problem.choices) {
      const ul = document.createElement('ul');
      ul.className = 'choices';
      problem.choices.forEach((choice) => {
        const li = document.createElement('li');
        li.textContent = choice;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'toggle-btn';
    toggleBtn.textContent = 'Show answer & explanation';

    const answerBlock = document.createElement('div');
    answerBlock.className = 'answer-block hidden';
    answerBlock.innerHTML = `
      <p><strong>Answer:</strong> ${problem.answer}</p>
      <p><strong>Explanation:</strong> ${problem.explanation}</p>
    `;

    toggleBtn.addEventListener('click', () => {
      const isHidden = answerBlock.classList.contains('hidden');
      answerBlock.classList.toggle('hidden', !isHidden);
      toggleBtn.textContent = isHidden
        ? 'Hide answer & explanation'
        : 'Show answer & explanation';
    });

    card.appendChild(toggleBtn);
    card.appendChild(answerBlock);

    resultsContainer.appendChild(card);
  });

  // Track problems for copy/translate features.
  baseProblems = baseProblems.length ? baseProblems : problems;
  currentProblems = problems;
  lastMeta = meta || {};

  // Enable copy-all when there are items
  if (problems.length > 0 && copyAllBtn) {
    copyAllBtn.disabled = false;
    copyAllBtn.onclick = () => copyAll(currentProblems);
  }

  // Enable translate (mock) when there are items
  if (problems.length > 0 && translateBtn) {
    translateBtn.disabled = false;
    translateBtn.onclick = () => {
      const targetLang = langSelect ? langSelect.value : 'ko';
      translateProblems(targetLang);
    };
  }

  if (langSelect) {
    langSelect.disabled = problems.length === 0;
  }
}

function copyAll(problems) {
  if (!problems.length) return;
  const text = problems
    .map((p, idx) => {
      const choices = p.choices
        ? p.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join('\n')
        : '';
      return [
        `Q${idx + 1}. ${p.question}`,
        choices,
        `Answer: ${p.answer}`,
        `Explanation: ${p.explanation}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  navigator.clipboard
    .writeText(text)
    .then(() => {
      copyAllBtn.textContent = '복사 완료!';
      setTimeout(() => (copyAllBtn.textContent = '전체 복사'), 1400);
    })
    .catch(() => {
      copyAllBtn.textContent = '복사 실패';
      setTimeout(() => (copyAllBtn.textContent = '전체 복사'), 1400);
    });
}

async function translateProblems(targetLang = 'ko') {
  if (!baseProblems.length) return;
  translateBtn.disabled = true;
  translateBtn.textContent = '번역 중...';

  try {
    const target = targetLang || (langSelect ? langSelect.value : 'ko');
    const res = await fetch('http://localhost:4000/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: baseProblems, targetLang: target }),
    });

    if (!res.ok) {
      throw new Error(`Translate failed: ${res.status}`);
    }

    const data = await res.json();
    const items = data.items || [];
    currentProblems = items;
    renderProblems(items, { ...lastMeta, translatedTo: target, translationMode: data.meta?.mode });
    translateBtn.textContent = '번역 완료';
  } catch (err) {
    console.error(err);
    translateBtn.textContent = '번역 실패';
  } finally {
    setTimeout(() => {
      translateBtn.disabled = false;
      translateBtn.textContent = '번역';
    }, 1400);
  }
}
