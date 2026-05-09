# Stutee (S.T) – MVP

Stutee는 사용자가 학습 내용을 붙여넣으면 문제·정답·해설을 자동 생성해주는 학습 보조 웹앱입니다.

현재 버전은 AWS와 외부 LLM API 없이 실행되는 로컬 MVP입니다. 프론트엔드는 다중 페이지 형태의 정적 웹앱이고, 백엔드는 Node/Express 기반 로컬 API입니다. 백엔드는 로그인, 세션, 사용자별 생성 이력, 규칙 기반 문제 생성 엔진을 제공합니다.

🚀 프로젝트 구조
Stuttee/
├── frontend/
│   ├── home.html
│   ├── index.html
│   ├── login.html
│   ├── profile.html
│   ├── plan.html
│   ├── account.html
│   ├── accessibility.html
│   ├── results.html
│   ├── history.html
│   ├── shared.js
│   ├── style.css
│   └── main.js
└── backend/
    ├── data/        # 실행 시 자동 생성, git 제외
    ├── package.json
    ├── server.js
    └── ...

## 빠른 시작

```bash
cd backend
npm install
npm start
```

서버와 웹사이트 주소: http://127.0.0.1:4000

주요 기능

- 회원가입/로그인/로그아웃
- 분리형 로그인 페이지와 우측 상단 로그인/프로필 진입 버튼
- 사이드바 남은 생성 횟수와 프로필 요약
- 프로필 설정: 접근성 안내, 로그아웃, 플랜 변경, 가입 탈퇴
- 사용자별 생성 이력 서버 저장
- 사용자별 일일 생성량 제한
- 학습 텍스트 입력
- 객관식, 주관식, OX, 빈칸 문제 생성
- 난이도/문항 수 선택
- 정답/해설 토글
- JSON 결과 보기
- 전체 복사
- 브라우저 localStorage 기반 캐시와 최근 결과 표시

📡 백엔드 API 요약

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `PATCH /api/me/plan`
- `DELETE /api/me`

문제 생성 API는 로그인 후 받은 Bearer token이 필요합니다.

### Generate

`POST /api/generate-quiz`

Header:

```text
Authorization: Bearer {token}
```

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
- 외부 DB 없음. `backend/data/*.json`에 로컬 저장
- 외부 LLM API 없음
- 비밀번호는 평문 저장하지 않고 `crypto.scrypt` 기반 해시 저장
- 세션은 랜덤 토큰을 발급하고 서버에는 토큰 해시만 저장
- 입력 길이/반복 입력/금칙어 검사
- 생성 결과는 사용자별 서버 이력과 브라우저 캐시에 저장

## 다음 단계

- 실제 LLM Provider 연동
- 서버 Redis rate limit
- RDS/PostgreSQL 기반 문제 이력 저장
