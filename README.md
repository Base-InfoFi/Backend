# InfoFi Slash Protocol

Web3 InfoFi 프로토콜 - Flock LLM을 활용한 글 평가 및 슬래싱 시스템

## 개요

이 프로젝트는 사용자가 특정 프로젝트에 대해 작성한 글을 Flock LLM으로 평가하여, 정보성/관련성/인사이트 점수를 매기고, 그에 따라 리워드 또는 슬래싱 포인트를 부여하는 시스템입니다.

## 기술 스택

- **프레임워크**: Next.js 15 (App Router)
- **언어**: TypeScript
- **데이터베이스**: PostgreSQL (Prisma ORM)
- **LLM**: Flock (OpenAI SDK 호환)
- **배포**: Vercel (예정)

## 프로젝트 구조

```
base/
├── app/
│   ├── api/
│   │   ├── posts/          # 글 평가 API
│   │   └── leaderboard/    # 리더보드 API
│   └── ...
├── lib/
│   ├── prisma.ts           # Prisma 클라이언트
│   ├── llm.ts              # Flock LLM 클라이언트
│   ├── evaluatePost.ts     # 글 평가 로직
│   └── scoring.ts          # 점수 계산 로직
├── prisma/
│   └── schema.prisma       # 데이터베이스 스키마
└── ...
```

## 설정

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/infofi?schema=public"

# Flock LLM
FLOCK_API_KEY=sk-xxxxx
FLOCK_BASE_URL=https://api.flock.io/v1
FLOCK_MODEL=qwen3-30b-a3b-instruct-2507
```

### 2. 데이터베이스 마이그레이션

```bash
# Prisma 클라이언트 생성
npx prisma generate

# 데이터베이스 마이그레이션
npx prisma migrate dev --name init
```

### 3. 개발 서버 실행

```bash
npm run dev
```

## API 엔드포인트

### POST /api/posts

글을 평가하고 리워드/슬래싱 포인트를 부여합니다.

**요청 예시:**
```json
{
  "projectSlug": "polymarket",
  "author": {
    "wallet": "0x1234...",
    "handle": "@user123"
  },
  "source": "x",
  "sourceId": "1876543212345678",
  "url": "https://x.com/...",
  "content": "Polymarket is changing prediction markets by ..."
}
```

**응답 예시:**
```json
{
  "postId": "clx...",
  "evaluation": {
    "informationScore": 8,
    "relevanceScore": 9,
    "insightScore": 7,
    "spamLikelihood": 0.1,
    "finalLabel": "GOOD",
    "rewardPoints": 8,
    "slashPoints": 0
  },
  "score": {
    "totalReward": 100,
    "totalSlash": 5,
    "netScore": 95
  }
}
```

### GET /api/leaderboard

프로젝트별 리더보드를 조회합니다.

**쿼리 파라미터:**
- `timeRange`: `all` | `24h` | `7d` (기본값: `all`)

**응답 예시:**
```json
[
  {
    "projectSlug": "polymarket",
    "projectName": "Polymarket",
    "currentShare": 0.111,
    "deltaAbs": 0.00407,
    "deltaRel": 0.268,
    "netScore": 12345,
    "postCount": 345,
    "goodCount": 210,
    "shitCount": 50
  }
]
```

## 데이터 모델

### 주요 테이블

- **Project**: 프로젝트 정보
- **User**: 사용자 정보
- **Post**: 평가 대상 글
- **Evaluation**: LLM 평가 결과
- **UserScore**: 사용자별 프로젝트 점수

자세한 스키마는 `prisma/schema.prisma`를 참조하세요.

## 평가 로직

1. **Flock LLM 평가**: 글의 정보성, 관련성, 인사이트 점수 및 스팸 가능성 평가
2. **분류**: `GOOD`, `SHITPOSTING`, `BORDERLINE` 중 하나로 분류
3. **점수 계산**:
   - `GOOD`: 리워드 포인트 부여 (기본 5점, 점수에 따라 가중)
   - `SHITPOSTING`: 슬래싱 포인트 부여 (0~10점)
   - `BORDERLINE`: 약한 리워드 또는 경고 수준

## 다음 단계

- [ ] 프로젝트 컨텍스트 자동 요약 기능
- [ ] Base Mini App 연동
- [ ] 프론트엔드 UI 구현
- [ ] 리더보드 시각화

## 라이선스

MIT
