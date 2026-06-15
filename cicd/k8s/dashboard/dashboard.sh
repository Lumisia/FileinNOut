#!/usr/bin/env bash
# Kubernetes Dashboard 설치 + 접속 (Docker Desktop K8s, 로컬 전용)
# 사용법:
#   ./cicd/k8s/dashboard/dashboard.sh            설치 + 토큰 출력 + port-forward
#   ./cicd/k8s/dashboard/dashboard.sh --token    로그인 토큰만 출력
#   ./cicd/k8s/dashboard/dashboard.sh --forward  port-forward 만 (https://localhost:8443)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASH_URL="https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml"
NS="kubernetes-dashboard"

kubectl config use-context docker-desktop >/dev/null

case "${1:-}" in
  --token)   kubectl -n "$NS" create token admin-user --duration=24h; exit 0 ;;
  --forward)
    echo "대시보드: https://localhost:8443  (자체서명 인증서 경고는 무시/진행)"
    echo "토큰: ./cicd/k8s/dashboard/dashboard.sh --token"
    echo "(Ctrl+C 로 종료)"
    exec kubectl -n "$NS" port-forward svc/kubernetes-dashboard 8443:443 --address 127.0.0.1
    ;;
esac

echo "==> Dashboard 설치"
kubectl apply -f "$DASH_URL"
kubectl apply -f "$SCRIPT_DIR/admin-user.yaml"

echo "==> rollout 대기"
kubectl -n "$NS" rollout status deploy/kubernetes-dashboard --timeout=180s
kubectl -n "$NS" rollout status deploy/dashboard-metrics-scraper --timeout=180s

echo
echo "=== 로그인 토큰 (24h) ==="
kubectl -n "$NS" create token admin-user --duration=24h
echo
echo "대시보드: https://localhost:8443  (자체서명 인증서 경고는 무시/진행, Token 방식 로그인)"
echo "(Ctrl+C 로 종료)"
exec kubectl -n "$NS" port-forward svc/kubernetes-dashboard 8443:443 --address 127.0.0.1
