# 로컬 Kubernetes 기동 (Docker Desktop)

docker-compose 와 동일한 전체 스택을 로컬 단일노드 k8s(Docker Desktop 내장)에서 띄운다.
프로덕션용 Helm chart(`cicd/helm`)와 달리 sentinel/HPA/canary/실도메인 ingress/TLS 없이 **로컬 전용**으로 단순화했다.

## 구성

| 워크로드 | 이미지 | Service | 비고 |
|---|---|---|---|
| `frontend` | `lumisia/frontend:latest` (Nginx) | NodePort 30080 | `/api`·`/wss` 를 backend/websocket 으로 프록시 |
| `backend-app` | `lumisia/backend:latest` (Spring) | NodePort 30808 | REST + STOMP. context-path `/api` |
| `websocket-server` | `lumisia/websocket-server:latest` (Node) | ClusterIP 1234 | Yjs 협업 + realtime |
| `db` | `mariadb:latest` | ClusterIP 3306 | `web` 스키마 (PVC) |
| `redis` | `redis:latest` | ClusterIP 6379 | fan-out/캐시 |
| `minio` | `minio/minio:latest` | NodePort(콘솔 30901) | 오브젝트 스토리지 (PVC) |

- Service 이름을 compose service 이름과 동일하게 맞춰(`redis`/`db`/`minio`/`backend-app`/`websocket-server`) 호스트명 그대로 재사용.
- 기동 순서: `backend-app`·`websocket-server` 의 initContainer 가 의존 서비스 TCP 포트를 기다린 뒤 시작.
- **이미지 출처**: Docker Desktop k8s 는 **kind 모드**(노드가 별도 containerd)라 로컬 빌드 이미지를 직접 못 쓴다. `imagePullPolicy: IfNotPresent` 로 `lumisia/*:latest` 를 Docker Hub 에서 pull 한다(= CI 가 push 한 빌드). 로컬 dev 브랜치 빌드를 그대로 k8s 에 올리려면 Hub(또는 레지스트리)에 push 후 사용.

## 사전 준비

1. **Docker Desktop > Settings > Kubernetes > Enable Kubernetes** 활성화 → 프로비저닝 완료 대기.
   확인: `kubectl config get-contexts` 에 `docker-desktop` 존재.
2. 이미지: `lumisia/*:latest` 가 로컬에 빌드되어 있거나(=`docker compose build`) Docker Hub 에서 pull 가능해야 함.
3. `.env`: 저장소 루트의 `.env`(compose 와 동일)를 그대로 사용. Secret 으로 변환되어 클러스터에 주입된다(파일은 커밋되지 않음).

## 기동

```powershell
# Windows
./cicd/k8s/k8s-up.ps1
```
```bash
# macOS / Linux
./cicd/k8s/k8s-up.sh
```

스크립트 동작: namespace `waffle` 생성 → `.env`→Secret(`waffle-secret`) 변환 주입 → 매니페스트 apply → 전 Deployment rollout 대기.

## 접속 (port-forward)

Docker Desktop k8s 는 **kind 모드**라 NodePort 가 localhost 로 노출되지 않는다. 접속은 port-forward 사용:

```powershell
./cicd/k8s/k8s-up.ps1 -Forward     # frontend → http://localhost:8088 (프론트 + /api)
```
```bash
./cicd/k8s/k8s-up.sh --forward
```

- 프론트(전체): http://localhost:8088
- Swagger: http://localhost:8088/api/swagger-ui/index.html
- MinIO 콘솔(필요시): `kubectl -n waffle port-forward svc/minio 9001:9001` → http://localhost:9001 (`MINIO_NAME`/`MINIO_SECRET`)

## 이미지 갱신 (로컬 빌드 → k8s 반영)

코드 수정 후 새 빌드를 k8s 에 올릴 때:

```powershell
./cicd/k8s/refresh-images.ps1                       # backend+frontend+websocket 전체
./cicd/k8s/refresh-images.ps1 -Apps frontend        # 일부만
```
```bash
./cicd/k8s/refresh-images.sh                        # 전체
./cicd/k8s/refresh-images.sh frontend               # 일부만
```

동작: `docker compose build` → kind 노드(`desktop-control-plane`)의 기존 이미지 ref 제거 → `docker save | ctr -n k8s.io images import` 로 주입 → `kubectl rollout restart`.

> **왜 clean-slate(기존 ref 제거)가 필요한가**: kind 노드는 별도 containerd 라 로컬 빌드를 직접 못 본다. 게다가 `imagePullPolicy: IfNotPresent` + `:latest` 는 노드에 남은 옛 이미지(특히 Docker Hub 에서 pull 한 본)를 그대로 재사용한다. import 만으로는 새 콘텐츠가 안 잡히는 경우가 있어, 해당 이미지의 모든 ref(`:latest`, `@sha256:...`)를 지운 뒤 import 한다. 반영 확인은 Pod 의 `imageID` 가 `docker.io/...@sha256:`(Hub) 가 아닌 bare `sha256:`(로컬 import) 인지로 판별.

## 운영

```bash
kubectl -n waffle get pods
kubectl -n waffle logs -f deploy/backend-app
./cicd/k8s/k8s-up.ps1 -Status     # 또는 --status (sh)
./cicd/k8s/k8s-up.ps1 -Down       # 또는 --down (sh) : namespace 통째 삭제
```

## 설정 override

- 클러스터 내부 네트워킹/로컬 전용 값은 `10-config.yaml`(ConfigMap `waffle-config`)에서 `.env` 값을 덮어쓴다:
  `REDIS_HOST=redis`, `MINIO_API=http://minio:9000`, `DB_URL=...//db:3306/web`,
  `APP_FRONTEND_URL=http://localhost:30080`, `APP_SECURE_COOKIE=false` 등.
- envFrom 순서상 Secret(`.env` 전체) → ConfigMap 순으로 적용되어 ConfigMap 이 동일 키를 이긴다.

## 트러블슈팅

- **Pod `ImagePullBackOff`**: `lumisia/*:latest` 로컬에 없음 → `docker compose build` 또는 Docker Hub 접근 확인.
- **`backend-app` 재시작 반복**: `kubectl -n waffle logs deploy/backend-app`. DB 자격증명(`DB_ID`/`DB_PASS`)·MinIO 자격증명 확인.
- **NodePort 접속 안 됨**: Docker Desktop K8s 는 NodePort 를 localhost 로 매핑. `kubectl -n waffle get svc` 로 포트 확인.
- **포트 충돌**: compose 스택(80/8080)과 k8s NodePort(30080/30808)는 겹치지 않아 동시 구동 가능.
