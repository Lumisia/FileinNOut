# Docker로 전체 서비스 기동

`docker compose` 하나로 전체 스택(프론트 + 백엔드 + WebSocket 서버 + MariaDB + Redis + MinIO)을 띄운다.

## 구성 서비스

| 서비스 | 이미지/빌드 | 포트(host) | 설명 |
|--------|-------------|-----------|------|
| `frontend` | `frontend.dockerfile` (Nginx) | 80, 443 | 정적 SPA + `/api`·`/api/ws-stomp`·`/api/sse` 리버스 프록시 |
| `backend-app` | `backend.dockerfile` (Spring Boot) | 8080 | REST API + STOMP 브로커. 부팅 시 MinIO 버킷 자동 생성 |
| `websocket-server` | `websocket.dockerfile` (Node) | 1234 | Yjs 협업 편집 + realtime 프록시 |
| `db` | `mariadb:latest` | 3307→3306 | `web` 스키마. healthcheck 포함 |
| `redis` | `redis:latest` | 6379 | STOMP/SSE fan-out + 캐시 |
| `minio` | `minio/minio` | 9000(API), 9001(콘솔) | 오브젝트 스토리지 |

기동 순서는 compose `depends_on`이 보장한다: db(healthy) → backend → websocket → frontend.

## 사전 준비

- Docker Desktop (Compose v2+). 확인: `docker compose version`
- `.env` 파일 — 저장소엔 없음(`.gitignore`). 템플릿에서 생성:
  ```powershell
  Copy-Item .env.example .env   # PowerShell
  # cp .env.example .env        # bash
  ```
  `.env`의 `<...>` placeholder를 실제 값으로 채운다.
  - `MINIO_SECRET`는 8자 이상 (MinIO 제약)
  - `DB_PASS`, `ADMIN_PASSWORD`, `JWT_KEY` 필수
  - 인프라 호스트(`redis`/`db`/`minio`)·내부 URL은 기본값 그대로 두면 됨

## 기동

```powershell
# Windows
./docker-up.ps1
```
```bash
# macOS / Linux
./docker-up.sh
```
스크립트 없이 직접:
```bash
docker compose up -d --build
```

## 접속

- 프론트: http://localhost
- 백엔드 API/Swagger: http://localhost:8080/swagger-ui.html
- MinIO 콘솔: http://localhost:9001 (`MINIO_NAME` / `MINIO_SECRET`)

## 운영 명령

```bash
docker compose ps            # 상태
docker compose logs -f backend-app   # 로그 추적
docker compose down          # 중지 (볼륨 유지)
docker compose down -v       # 중지 + 볼륨 삭제(DB/MinIO 데이터 초기화)
```

## 트러블슈팅

- **백엔드가 DB 못 잡음**: `db` healthcheck 통과 전엔 backend가 기다린다. `docker compose logs db`로 확인.
- **파일 업로드 실패**: MinIO 버킷은 backend 부팅 시 자동 생성(`MinioConfig`). `MINIO_NAME/SECRET`가 `minio` 서비스 자격증명과 일치해야 함.
- **포트 충돌(80/8080/3307…)**: 기존 점유 프로세스 종료 또는 `docker-compose.yml` 포트 매핑 변경.
- **변경 반영 안 됨**: `docker compose up -d --build`로 이미지 재빌드.
