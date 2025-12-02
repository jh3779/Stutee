const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.use(cors());
app.use(express.json());

// Health check endpoint.
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Stuttee mock backend' });
});

// Generate route: uses OpenAI if key is present, otherwise mock.
app.post('/generate', async (req, res) => {
  const { count = 5, level = 'medium', type = 'mixed', text = '' } = req.body || {};
  const total = Math.min(Math.max(Number(count) || 5, 1), 50);
  const baseMeta = { count: total, level, type };

  if (!OPENAI_API_KEY) {
    const payload = buildMockQuestions({ count: total, level, type, text });
    return res.json({ items: payload, meta: { ...baseMeta, mode: 'mock' } });
  }

  try {
    const items = await generateViaOpenAI({ count: total, level, type, text });
    return res.json({ items, meta: { ...baseMeta, mode: 'openai' } });
  } catch (err) {
    console.error('OpenAI generate failed, falling back to mock', err.message);
    const payload = buildMockQuestions({ count: total, level, type, text });
    return res.json({
      items: payload,
      meta: { ...baseMeta, mode: 'mock-fallback', error: 'openai_failed' },
    });
  }
});

// Translate route (uses OpenAI if key is present; otherwise mock prefix translation).
app.post('/translate', async (req, res) => {
  try {
    const { items = [], targetLang = 'ko' } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array required' });
    }

    if (!OPENAI_API_KEY) {
      const translated = items.map((p) => mockTranslate(p, targetLang));
      return res.json({ items: translated, meta: { targetLang, mode: 'mock' } });
    }

    try {
      const translated = await translateViaOpenAI({ items, targetLang });
      return res.json({ items: translated, meta: { targetLang, mode: 'openai' } });
    } catch (err) {
      console.error('OpenAI translate failed, falling back to mock', err.message);
      const translated = items.map((p) => mockTranslate(p, targetLang));
      return res.json({
        items: translated,
        meta: { targetLang, mode: 'mock-fallback', error: 'openai_failed' },
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'translate failed' });
  }
});

function buildMockQuestions({ count, level, type, text }) {
  const base = text && typeof text === 'string'
    ? text.slice(0, 120) || 'user provided text'
    : 'sample study text';

  const problems = [];
  for (let i = 1; i <= count; i += 1) {
    const isMC =
      type === 'multiple-choice' ? true : type === 'short-answer' ? false : i % 2 === 1;
    const choices = isMC
      ? ['Option A', 'Option B', 'Option C', 'Option D'].map(
          (c, idx) => `${c} for Q${i} based on ${base} (${idx + 1})`
        )
      : null;

    problems.push({
      id: i,
      question: `Q${i}. Based on: ${base}`,
      choices,
      answer: isMC ? 'Option B' : 'Short-form answer text',
      explanation: `Reasoning for Q${i} at ${level} difficulty.`,
    });
  }
  return problems;
}

function mockTranslate(problem, targetLang) {
  return {
    ...problem,
    question: `[${targetLang}] ${problem.question}`,
    choices: problem.choices ? problem.choices.map((c) => `[${targetLang}] ${c}`) : null,
    answer: `[${targetLang}] ${problem.answer}`,
    explanation: `[${targetLang}] ${problem.explanation}`,
  };
}

async function translateViaOpenAI({ items, targetLang }) {
  const payload = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a translator. Translate each item to the target language while keeping the JSON fields (question, choices, answer, explanation). Respond with JSON: { "items": [...] }',
      },
      {
        role: 'user',
        content: JSON.stringify({ targetLang, items }),
      },
    ],
    temperature: 0.2,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from OpenAI');
  }

  const parsed = JSON.parse(content);
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error('Parsed content missing items array');
  }
  return parsed.items;
}

async function generateViaOpenAI({ count, level, type, text }) {
  const userText = text && typeof text === 'string' ? text.slice(0, 1200) : '';
  const payload = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You generate exam-style practice questions. Keep outputs concise and structured as JSON { "items": [ { "id": number, "question": string, "choices": [string]|null, "answer": string, "explanation": string } ] }.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          text: userText,
          count,
          level,
          type,
          format_hint:
            'If type is multiple-choice, include 4 options; if short-answer, set choices to null; if mixed, alternate.',
        }),
      },
    ],
    temperature: 0.5,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const textBody = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${textBody}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content returned from OpenAI');

  const parsed = JSON.parse(content);
  if (!parsed.items || !Array.isArray(parsed.items)) {
    throw new Error('Parsed content missing items array');
  }
  return parsed.items;
}

app.listen(PORT, () => {
  console.log(`Stuttee backend running on http://localhost:${PORT}`);
});
