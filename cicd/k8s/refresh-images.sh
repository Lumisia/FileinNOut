#!/usr/bin/env bash
# 로컬 이미지 재빌드 → Docker Desktop kind 노드에 주입 → k8s rollout
# 사용법: ./cicd/k8s/refresh-images.sh [app ...]
#   인자 없으면 backend frontend websocket-server 전체.
#
# 배경: Docker Desktop k8s 는 kind 모드(노드가 별도 containerd)라 로컬 빌드 이미지를
# 직접 못 본다. 노드에 ctr import 로 주입한다. imagePullPolicy: IfNotPresent + :latest 는
# 옛 이미지(특히 Hub pull 본)를 캐시로 재사용하므로, 주입 전 노드의 해당 이미지 ref 를
# 전부 제거(clean-slate)한 뒤 import 해야 새 콘텐츠가 확실히 반영된다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NS="waffle"
NODE="desktop-control-plane"   # Docker Desktop kind 노드 컨테이너

# app 이름 -> compose 서비스 / 이미지 / k8s deployment·container 매핑
declare -A IMG=( [backend]=lumisia/backend [frontend]=lumisia/frontend [websocket-server]=lumisia/websocket-server )
declare -A SVC=( [backend]=backend-app    [frontend]=frontend         [websocket-server]=websocket-server )
declare -A DEP=( [backend]=backend-app    [frontend]=frontend         [websocket-server]=websocket-server )

apps=("$@"); [ ${#apps[@]} -eq 0 ] && apps=(backend frontend websocket-server)

kubectl config use-context docker-desktop >/dev/null

echo "==> 이미지 빌드: ${apps[*]}"
svcs=(); for a in "${apps[@]}"; do svcs+=("${SVC[$a]}"); done
( cd "$REPO_ROOT" && docker compose build "${svcs[@]}" )

for a in "${apps[@]}"; do
  img="${IMG[$a]}:latest"; dep="${DEP[$a]}"
  echo "==> [$a] 노드 기존 ref 제거"
  for ref in $(docker exec "$NODE" ctr -n k8s.io images ls -q | grep -E "${IMG[$a]}(:|@)" || true); do
    docker exec "$NODE" ctr -n k8s.io images rm "$ref" >/dev/null 2>&1 || true
  done
  echo "==> [$a] 노드로 import: $img"
  docker save "$img" | docker exec -i "$NODE" ctr -n k8s.io images import --digests=true - >/dev/null
  echo "==> [$a] rollout restart"
  kubectl -n "$NS" rollout restart "deploy/$dep"
done

for a in "${apps[@]}"; do kubectl -n "$NS" rollout status "deploy/${DEP[$a]}" --timeout=240s; done
echo "==> 완료. Pod imageID 확인:"
for a in "${apps[@]}"; do
  p=$(kubectl -n "$NS" get pod -l "app=${DEP[$a]}" --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}')
  echo "  ${DEP[$a]}: $(kubectl -n "$NS" get pod "$p" -o jsonpath='{.status.containerStatuses[0].imageID}')"
done
