# Stuttee (S.T) MVP

AI-assisted study helper that generates practice questions from pasted study text. MVP is a single-page frontend with a Node/Express backend (mock generation by default).

## Structure
- `frontend/`: static SPA (`index.html`, `style.css`, `main.js`)
- `backend/`: Node + Express server with `/generate` mock endpoint

## Quickstart
1) Backend  
   ```bash
   cd backend
   # If PATH has node/npm:
   npm start
   # If PATH is missing, use absolute path:
   & "C:\Program Files\nodejs\node.exe" server.js
   ```
   Server runs on `http://localhost:4000`.
   - 환경변수: `OPENAI_API_KEY` (선택, 있으면 /generate와 /translate가 OpenAI 사용), `OPENAI_MODEL` (기본 gpt-4o-mini)

2) Frontend  
   Open `frontend/index.html` in a browser.  
   - Paste study text, choose count/level/type, click **Generate**.  
   - Cards show questions/choices/answer/explanation with toggle.  
   - **Copy all** copies questions+answers+explanations to clipboard as text.
   - **Translate** calls `/translate`: `OPENAI_API_KEY` 있으면 OpenAI, 없으면 모크 접두어 번역. 대상 언어는 우측 셀렉트박스에서 선택(ko/en/ja 기본 제공).

## Notes
- `/generate`: `OPENAI_API_KEY` 없으면 모크 JSON, 있으면 OpenAI 호출 후 실패 시 모크로 폴백.
- CORS enabled; no database used.
- `/translate` uses OpenAI when `OPENAI_API_KEY` is present; falls back to mock prefix translation otherwise.
- Next steps: refine UI, error states, and optional OpenAI integration (via `.env` + server prompt).
