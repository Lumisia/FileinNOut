#!/usr/bin/env bash
# WaffleBear 로컬 Kubernetes 기동 (Docker Desktop K8s)
# 사용법:
#   ./cicd/k8s/k8s-up.sh            기동
#   ./cicd/k8s/k8s-up.sh --forward  접속용 port-forward (frontend → localhost:8088)
#   ./cicd/k8s/k8s-up.sh --status   상태
#   ./cicd/k8s/k8s-up.sh --down     전체 삭제(namespace drop)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NS="waffle"

command -v kubectl >/dev/null || { echo "kubectl 을 찾을 수 없습니다." >&2; exit 1; }

if ! kubectl config get-contexts -o name | grep -qx "docker-desktop"; then
    echo "kube context 'docker-desktop' 가 없습니다. Docker Desktop > Settings > Kubernetes > Enable Kubernetes 활성화 후 다시 실행하세요." >&2
    exit 1
fi
kubectl config use-context docker-desktop >/dev/null

case "${1:-}" in
  --status) kubectl -n "$NS" get all; exit 0 ;;
  --down)   echo "==> namespace '$NS' 삭제"; kubectl delete namespace "$NS" --ignore-not-found; exit $? ;;
  --forward)
    # kind 모드는 NodePort 를 localhost 로 노출하지 않으므로 frontend 를 port-forward.
    echo "프론트(전체):  http://localhost:8088"
    echo "  Swagger:     http://localhost:8088/api/swagger-ui/index.html"
    echo "(Ctrl+C 로 종료)"
    exec kubectl -n "$NS" port-forward svc/frontend 8088:80
    ;;
esac

ENV_FILE="$REPO_ROOT/.env"
[ -f "$ENV_FILE" ] || { echo ".env 가 없습니다 ($ENV_FILE)." >&2; exit 1; }

echo "==> namespace 적용"
kubectl apply -f "$SCRIPT_DIR/00-namespace.yaml"

echo "==> .env 로부터 Secret(waffle-secret) 생성"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
# export 접두사 제거 + 양끝 따옴표 제거
sed -E 's/^[[:space:]]*export[[:space:]]+//' "$ENV_FILE" \
  | grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' \
  | sed -E 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$/\1=\2/' \
  | sed -E 's/="(.*)"$/=\1/' \
  | sed -E "s/='(.*)'$/=\1/" > "$TMP"
kubectl -n "$NS" create secret generic waffle-secret --from-env-file="$TMP" --dry-run=client -o yaml | kubectl apply -f -

echo "==> 매니페스트 적용"
kubectl apply -f "$SCRIPT_DIR"

echo "==> rollout 대기"
for d in redis db minio backend-app websocket-server frontend; do
    kubectl -n "$NS" rollout status "deploy/$d" --timeout=300s
done

echo
kubectl -n "$NS" get pods -o wide
echo
echo "전체 6개 서비스 기동 완료."
echo "Docker Desktop kind 모드는 NodePort 를 localhost 로 노출하지 않으므로 접속은 port-forward 사용:"
echo "  ./cicd/k8s/k8s-up.sh --forward      → http://localhost:8088 (프론트+API)"
echo "  kubectl -n waffle port-forward svc/minio 9001:9001   → MinIO 콘솔 http://localhost:9001"
