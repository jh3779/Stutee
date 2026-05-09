# Stutee (S.T) – MVP

Stutee는 사용자가 학습 내용을 붙여넣으면 문제·정답·해설을 자동 생성해주는 학습 보조 웹앱입니다.

현재 버전은 AWS와 외부 LLM API 없이 실행되는 로컬 MVP입니다. 단일 페이지 프론트엔드와 Node/Express 백엔드로 구성되며, 백엔드는 규칙 기반 문제 생성 엔진을 제공합니다.

🚀 프로젝트 구조
Stuttee/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── main.js
└── backend/
    ├── package.json
    ├── server.js
    └── ...

## 빠른 시작

```bash
cd backend
npm install
npm start
```

서버와 웹사이트 주소: http://localhost:4000

주요 기능

- 학습 텍스트 입력
- 객관식, 주관식, OX, 빈칸 문제 생성
- 난이도/문항 수 선택
- 정답/해설 토글
- JSON 결과 보기
- 전체 복사
- 브라우저 localStorage 기반 캐시/이력/생성량 제한

📡 백엔드 API 요약

`POST /api/generate-quiz`

요청:

```json
{
  "text": "학습 원문",
  "difficulty": "medium",
  "count": 5,
  "questionTypes": ["multiple-choice", "short-answer", "true-false", "fill-blank"]
}
```

응답:

```json
{
  "success": true,
  "items": [
    {
      "type": "multiple-choice",
      "question": "문제",
      "choices": ["A", "B", "C", "D"],
      "answer": "A",
      "explanation": "해설",
      "difficulty": "medium",
      "topic": "주제",
      "createdAt": "2026-05-09T00:00:00.000Z"
    }
  ]
}
```

## 구현 상세

- CORS 활성화
- DB 없음
- 외부 LLM API 없음
- 입력 길이/반복 입력/금칙어 검사
- 생성 결과 캐싱은 브라우저 localStorage 사용

## 다음 단계

- 실제 LLM Provider 연동
- 로그인/사용자별 저장소
- 서버 Redis rate limit
- DB 기반 문제 이력 저장
