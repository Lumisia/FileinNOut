#!/usr/bin/env bash
# WaffleBear 전체 스택 기동 (macOS / Linux)
# 사용법: ./docker-up.sh          전체 빌드 + 기동
#        ./docker-up.sh down     중지
#        ./docker-up.sh logs     로그 추적
set -euo pipefail
cd "$(dirname "$0")"

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose 를 찾을 수 없습니다. Docker 설치/실행 여부를 확인하세요." >&2
  exit 1
fi

case "${1:-up}" in
  down) docker compose down; exit $? ;;
  logs) docker compose logs -f; exit $? ;;
esac

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "WARN: .env 가 없어 .env.example 로 생성합니다. <...> placeholder 값을 채운 뒤 다시 실행하세요." >&2
    cp .env.example .env
    exit 1
  else
    echo "ERROR: .env 와 .env.example 둘 다 없습니다." >&2
    exit 1
  fi
fi

echo "==> 전체 스택 빌드 + 기동"
docker compose up -d --build
docker compose ps

cat <<'EOF'

프론트:      http://localhost
백엔드:      http://localhost:8080
MinIO 콘솔:  http://localhost:9001
EOF
