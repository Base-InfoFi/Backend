#!/bin/bash

echo "=== 로컬 테스트 환경 설정 ==="

# 1. PostgreSQL Docker 컨테이너 실행
echo "1. PostgreSQL Docker 컨테이너 확인/실행..."
if docker ps -a | grep -q postgres-shitfilter; then
  echo "  기존 컨테이너 발견"
  if ! docker ps | grep -q postgres-shitfilter; then
    echo "  컨테이너 시작 중..."
    docker start postgres-shitfilter
  else
    echo "  컨테이너 이미 실행 중"
  fi
else
  echo "  새 컨테이너 생성 중..."
  docker run --name postgres-shitfilter \
    -e POSTGRES_PASSWORD=password \
    -e POSTGRES_DB=shitfilter \
    -p 5432:5432 -d postgres:14
  echo "  컨테이너 생성 완료. 5초 대기..."
  sleep 5
fi

# 2. 환경 변수 설정
export DATABASE_URL="postgresql://postgres:password@localhost:5432/shitfilter?schema=public"

# 3. Prisma 마이그레이션
echo "2. Prisma 마이그레이션 실행..."
cd "$(dirname "$0")/.."
npx prisma migrate dev --name init_postgresql || echo "마이그레이션 실패 (이미 존재할 수 있음)"

# 4. Prisma 클라이언트 생성
echo "3. Prisma 클라이언트 생성..."
npx prisma generate

echo ""
echo "=== 설정 완료 ==="
echo "다음 명령어로 더미 데이터를 임포트하세요:"
echo "export DATABASE_URL=\"postgresql://postgres:password@localhost:5432/shitfilter?schema=public\""
echo "npx tsx scripts/import-dummy-data.ts scripts/dummy_data.json"

