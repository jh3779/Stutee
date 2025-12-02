Stuttee (S.T) – MVP

Stuttee 는 사용자가 학습 내용을 붙여넣으면,
👉 AI가 자동으로 문제·정답·해설을 생성해주는 학습 보조 웹앱입니다.

MVP는 단일 페이지(SPA) 프론트엔드와 Node/Express 백엔드로 구성되며,
기본적으로 Mock 기반 문제 생성을 제공합니다.
OpenAI API Key를 설정하면 실제 AI 생성 기능을 사용할 수 있습니다.

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

⚡ 빠른 시작 (Quickstart)
1) 백엔드 실행
cd backend
npm start


만약 node가 PATH에 등록되어 있지 않다면:

& "C:\Program Files\nodejs\node.exe" server.js


서버 주소: http://localhost:4000

환경 변수
변수명	설명
OPENAI_API_KEY	선택 사항. 존재하면 /generate 및 /translate가 OpenAI API 사용
OPENAI_MODEL	기본값 gpt-4o-mini
🌐 프론트엔드 실행

frontend/index.html 파일을 브라우저로 직접 열면 됩니다.

주요 기능

학습 텍스트 붙여넣기

문제 개수 / 난이도 / 유형 선택 후 Generate

생성된 문제 카드 표시

문제

선택형 보기 (해당 시)

정답/해설 토글 표시

Copy all
→ 문제·정답·해설 전체를 텍스트 형태로 클립보드 복사

Translate

/translate 호출

API Key 있으면 OpenAI 번역

없으면 Mock 접두어 방식 번역

언어: ko / en / ja

📡 백엔드 API 요약
/generate (POST)

OPENAI_API_KEY 없으면 Mock JSON 반환

있으면 OpenAI API 호출 → 실패 시 Mock으로 폴백

/translate (POST)

API Key 있으면 실제 OpenAI 번역

없으면 Mock 문자열 반환

📌 구현 상세

CORS 활성화됨

DB 없음 (MVP)

오류 발생 시 사용자 친화적 메시지 제공(기본 Mock 처리)

🔧 다음 단계 제안 (Next Steps)

UI 개선

에러 상태 UX 개선

OpenAI 프롬프트 고도화

.env 도입 및 보안 설정 정비

선택형/서술형 문제 스타일 더 다양하게 확장

📄 라이선스

MIT License

🙌 기여 및 문의

버그 리포트, 기능 제안 언제든 환영합니다!
